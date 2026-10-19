import { useEffect, useState } from 'react';

type Call = {
  id: string;
  callerNumber: string;
  status: string;
  intent: string | null;
  startedAt: string;
  durationSec: number | null;
};

type CallDetail = Call & {
  transcriptMessages: {
    id: string;
    role: string;
    text: string;
    timestamp: string;
  }[];
  actions: {
    id: string;
    type: string;
    status: string;
    createdAt: string;
  }[];
  appointments: {
    id: string;
    startsAt: string;
    endsAt: string;
    status: string;
  }[];
};

type Analytics = {
  kpis: {
    totalCalls: number;
    callsResolved: number;
    appointmentsBooked: number;
    averageCallDurationSec: number | null;
    changes: Record<string, number | null>;
  };
};

type Summary = {
  summary: {
    summary: string | null;
    actions: { id: string; type: string; status: string }[];
  } | null;
};

type LiveCallCardProps = {
  call: Call;
  onOpen: (id: string) => void;
};

function LiveCallCard({ call, onOpen }: LiveCallCardProps) {
  return (
    <button
      className="panel live-call"
      onClick={() => onOpen(call.id)}
      type="button"
    >
      <span className="eyebrow">Live call</span>
      <strong>{call.callerNumber}</strong>
      <span className="muted">Call in progress · live updates enabled</span>
      <span className="live-call-meta">
        {call.intent ?? 'unclassified'} · started {formatDate(call.startedAt)}
      </span>
      <span className="waveform" aria-label="Live call waveform placeholder">
        {Array.from({ length: 18 }, (_, index) => (
          <span
            key={index}
            style={{ height: `${12 + ((index * 17) % 28)}px` }}
          />
        ))}
      </span>
    </button>
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';
  const response = await fetch(`${apiBaseUrl}${url}`);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

export function App() {
  const [calls, setCalls] = useState<Call[]>([]);
  const activeCall =
    calls.find((call) => call.status === 'in_progress') ?? null;
  const [selectedCall, setSelectedCall] = useState<CallDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [authenticated, setAuthenticated] = useState(true);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [summary, setSummary] = useState<Summary['summary']>(null);
  const [daily, setDaily] = useState<{ date: string; count: number }[]>([]);
  const [intents, setIntents] = useState<
    { intent: string | null; count: number; percentage: number }[]
  >([]);

  async function refreshCalls() {
    return fetchJson<{ calls: Call[] }>('/api/calls')
      .then((data) => setCalls(data.calls))
      .catch((requestError: unknown) => {
        if (
          requestError instanceof Error &&
          requestError.message.includes('(401)')
        ) {
          setAuthenticated(false);
        }
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to load calls',
        );
      });
  }

  async function refreshAnalytics() {
    const [analyticsData, summaryData, dailyData, intentsData] =
      await Promise.all([
        fetchJson<Analytics>('/api/kpis'),
        fetchJson<Summary>('/api/calls/latest-summary'),
        fetchJson<{ days: { date: string; count: number }[] }>(
          '/api/calls/daily',
        ),
        fetchJson<{
          intents: {
            intent: string | null;
            count: number;
            percentage: number;
          }[];
        }>('/api/intents'),
      ]);
    setAnalytics(analyticsData);
    setSummary(summaryData.summary);
    setDaily(dailyData.days);
    setIntents(intentsData.intents);
  }

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    void Promise.all([refreshCalls(), refreshAnalytics()]).finally(() =>
      setLoading(false),
    );

    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let source: EventSource | undefined;

    const connect = () => {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';
      source = new EventSource(`${apiBaseUrl}/api/calls/stream`);
      source.onopen = () => setLive(true);
      source.onerror = () => {
        setLive(false);
        source?.close();
        reconnectTimer = setTimeout(connect, 2_000);
      };
      source.addEventListener('call.updated', (event) => {
        const update = JSON.parse((event as MessageEvent).data) as {
          callId: string;
        };
        void refreshCalls();
        void refreshAnalytics();
        if (selectedCall?.id === update.callId) {
          void openCall(update.callId);
        }
      });
    };

    connect();

    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      source?.close();
    };
  }, [authenticated, selectedCall?.id]);

  async function openCall(id: string) {
    setError(null);
    try {
      const data = await fetchJson<{ call: CallDetail }>(`/api/calls/${id}`);
      setSelectedCall(data.call);
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load call',
      );
    }
  }

  return (
    <main className="page">
      {!authenticated && (
        <section className="panel">
          <h2>Dashboard sign in required</h2>
          <p className="muted">
            Open <a href="/dashboard">the dashboard sign-in page</a> to
            continue.
          </p>
        </section>
      )}
      {authenticated && (
        <>
          <header className="header">
            <div>
              <p className="eyebrow">AI Voice Agent</p>
              <h1>Call history</h1>
            </div>
            <span className="badge">{live ? 'Live' : 'Reconnecting'}</span>
          </header>

          {error && <p className="error">{error}</p>}

          <section className="layout">
            {activeCall && <LiveCallCard call={activeCall} onOpen={openCall} />}
            <div className="panel">
              <h2>Recent calls</h2>
              {loading ? (
                <p className="muted">Loading calls...</p>
              ) : calls.length === 0 ? (
                <p className="muted">No calls have been recorded yet.</p>
              ) : (
                <div className="call-list">
                  {calls.map((call) => (
                    <button
                      className={`call-row ${selectedCall?.id === call.id ? 'selected' : ''}`}
                      key={call.id}
                      onClick={() => void openCall(call.id)}
                      type="button"
                    >
                      <strong>{call.callerNumber}</strong>
                      <span>{formatDate(call.startedAt)}</span>
                      <span className="row-meta">
                        {call.intent ?? 'unclassified'} · {call.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="panel detail">
              {!selectedCall ? (
                <p className="muted">Select a call to view its details.</p>
              ) : (
                <>
                  <div className="detail-heading">
                    <div>
                      <p className="eyebrow">Call detail</p>
                      <h2>{selectedCall.callerNumber}</h2>
                    </div>
                    <span className="badge">{selectedCall.status}</span>
                  </div>
                  <p className="muted">
                    {formatDate(selectedCall.startedAt)} ·{' '}
                    {selectedCall.intent ?? 'unclassified'}
                  </p>

                  <h3>Transcript</h3>
                  {selectedCall.transcriptMessages.length === 0 ? (
                    <p className="muted">No transcript messages.</p>
                  ) : (
                    <div className="transcript">
                      {selectedCall.transcriptMessages.map((message) => (
                        <div className="message" key={message.id}>
                          <strong>{message.role}</strong>
                          <p>{message.text}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <h3>Actions</h3>
                  {selectedCall.actions.length === 0 ? (
                    <p className="muted">No actions recorded.</p>
                  ) : (
                    <ul>
                      {selectedCall.actions.map((action) => (
                        <li key={action.id}>
                          {action.type} · {action.status}
                        </li>
                      ))}
                    </ul>
                  )}

                  <h3>Appointments</h3>
                  {selectedCall.appointments.length === 0 ? (
                    <p className="muted">No appointments.</p>
                  ) : (
                    <ul>
                      {selectedCall.appointments.map((appointment) => (
                        <li key={appointment.id}>
                          {formatDate(appointment.startsAt)} ·{' '}
                          {appointment.status}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </section>
          <section className="analytics-grid">
            <div className="panel">
              <p className="eyebrow">Performance</p>
              <h2>Call analytics</h2>
              <div className="kpi-grid">
                {analytics ? (
                  [
                    ['Total calls', analytics.kpis.totalCalls, 'totalCalls'],
                    ['Resolved', analytics.kpis.callsResolved, 'callsResolved'],
                    [
                      'Appointments',
                      analytics.kpis.appointmentsBooked,
                      'appointmentsBooked',
                    ],
                    [
                      'Avg duration',
                      analytics.kpis.averageCallDurationSec
                        ? `${analytics.kpis.averageCallDurationSec}s`
                        : '—',
                      'averageCallDurationSec',
                    ],
                  ].map(([label, value, key]) => (
                    <div className="kpi" key={key}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                      <small>
                        {analytics.kpis.changes[key as string] === null
                          ? '—'
                          : `${analytics.kpis.changes[key as string]}% vs prior`}
                      </small>
                    </div>
                  ))
                ) : (
                  <p className="muted">Loading analytics...</p>
                )}
              </div>
              <h3>Calls per day</h3>
              {daily.length ? (
                <div className="bar-chart">
                  {daily.map((day) => (
                    <div className="bar-item" key={day.date}>
                      <div
                        className="bar"
                        style={{
                          height: `${Math.max(day.count * 24, 8)}px`,
                        }}
                        title={`${day.count} calls`}
                      />
                      <small>{day.date.slice(5)}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No calls in this week.</p>
              )}
            </div>
            <div className="panel">
              <p className="eyebrow">Distribution</p>
              <h2>Top intents</h2>
              {intents.length ? (
                <ul className="intent-list">
                  {intents.map((item) => (
                    <li key={item.intent}>
                      <span>{item.intent ?? 'other'}</span>
                      <strong>{item.percentage}%</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No intents in this week.</p>
              )}
            </div>
          </section>
          <section className="panel summary-card">
            <p className="eyebrow">Latest call summary</p>
            {summary ? (
              <>
                <p>{summary.summary ?? 'No summary available.'}</p>
                <ul>
                  {summary.actions.map((action) => (
                    <li key={action.id}>
                      {action.type} · {action.status}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="muted">No call summary available.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}

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

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
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
  const [selectedCall, setSelectedCall] = useState<CallDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  async function refreshCalls() {
    return fetchJson<{ calls: Call[] }>('/api/calls')
      .then((data) => setCalls(data.calls))
      .catch((requestError: unknown) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to load calls',
        );
      });
  }

  useEffect(() => {
    void refreshCalls().finally(() => setLoading(false));

    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let source: EventSource | undefined;

    const connect = () => {
      source = new EventSource('/api/calls/stream');
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
  }, [selectedCall?.id]);

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
      <header className="header">
        <div>
          <p className="eyebrow">AI Voice Agent</p>
          <h1>Call history</h1>
        </div>
        <span className="badge">{live ? 'Live' : 'Reconnecting'}</span>
      </header>

      {error && <p className="error">{error}</p>}

      <section className="layout">
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
                      {formatDate(appointment.startsAt)} · {appointment.status}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}

import type { CallStatus, TranscriptRole } from '@prisma/client';

type TimeValue = string | number | undefined;

type ArtifactTranscriptMessage = {
  role: TranscriptRole;
  text: string;
};

type StoredTranscriptMessage = ArtifactTranscriptMessage;

const resolvedReasons = new Set([
  'hangup',
  'assistant-ended-call',
  'assistant-ended-call-after-message-spoken',
  'assistant-ended-call-with-hangup-task',
  'assistant-said-end-call-phrase',
  'customer-ended-call',
]);

const abandonedReasons = new Set([
  'customer-busy',
  'customer-did-not-answer',
  'customer-did-not-give-microphone-permission',
  'customer-ended-call-before-warm-transfer',
  'customer-ended-call-after-warm-transfer-attempt',
  'customer-ended-call-during-transfer',
  'exceeded-max-duration',
  'silence-timed-out',
]);

export function parseVapiDate(value: TimeValue): Date | null {
  if (value === undefined) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function calculateDurationSec(
  startedAt: Date | null,
  endedAt: Date | null,
): number | null {
  if (!startedAt || !endedAt) {
    return null;
  }

  const durationMs = endedAt.getTime() - startedAt.getTime();
  return durationMs < 0 ? null : Math.round(durationMs / 1000);
}

export function mapEndedReasonToStatus(
  endedReason: string | undefined,
): CallStatus {
  if (!endedReason) {
    return 'failed';
  }

  const normalized = endedReason.trim().toLowerCase();
  if (normalized === 'assistant-forwarded-call') {
    return 'transferred';
  }
  if (resolvedReasons.has(normalized)) {
    return 'resolved';
  }
  if (abandonedReasons.has(normalized)) {
    return 'abandoned';
  }

  return 'failed';
}

function transcriptKey(message: ArtifactTranscriptMessage): string {
  return `${message.role}\u0000${message.text}`;
}

export function findMissingArtifactMessages(
  stored: StoredTranscriptMessage[],
  artifact: ArtifactTranscriptMessage[],
): ArtifactTranscriptMessage[] {
  const remainingStored = new Map<string, number>();

  for (const message of stored) {
    const key = transcriptKey(message);
    remainingStored.set(key, (remainingStored.get(key) ?? 0) + 1);
  }

  return artifact.filter((message) => {
    const key = transcriptKey(message);
    const remaining = remainingStored.get(key) ?? 0;
    if (remaining === 0) {
      return true;
    }

    remainingStored.set(key, remaining - 1);
    return false;
  });
}

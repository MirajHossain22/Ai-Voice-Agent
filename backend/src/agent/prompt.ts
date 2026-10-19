import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const promptPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'system-prompt.md',
);

export function loadSystemPrompt(recordingNotice: string): string {
  return readFileSync(promptPath, 'utf8').replaceAll(
    '{{RECORDING_NOTICE}}',
    recordingNotice,
  );
}

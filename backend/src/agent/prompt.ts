import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function resolvePromptPath(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const localPath = resolve(currentDir, 'system-prompt.md');
  if (existsSync(localPath)) {
    return localPath;
  }
  return resolve(currentDir, '..', '..', 'src', 'agent', 'system-prompt.md');
}

export function loadSystemPrompt(recordingNotice: string): string {
  return readFileSync(resolvePromptPath(), 'utf8').replaceAll(
    '{{RECORDING_NOTICE}}',
    recordingNotice,
  );
}

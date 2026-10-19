import { describe, expect, it } from 'vitest';

import { loadSystemPrompt } from './prompt.js';

describe('system prompt', () => {
  it('substitutes the configured recording notice', () => {
    const prompt = loadSystemPrompt('This is a configured test notice.');

    expect(prompt).toContain('This is a configured test notice.');
    expect(prompt).not.toMatch(/{{[^}]+}}/);
  });
});

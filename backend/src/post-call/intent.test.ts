import { describe, expect, it } from 'vitest';

import { classifyIntent } from './intent.js';

describe('post-call intent classification', () => {
  it.each([
    ['I want to book a demo', 'book_demo'],
    ['How much does it cost?', 'pricing_inquiry'],
    ['I have a support problem', 'support_request'],
    ['What does your service do?', 'general_question'],
    ['I am just calling', 'other'],
  ])('classifies %s', (text, intent) => {
    expect(classifyIntent(text)).toBe(intent);
  });
});

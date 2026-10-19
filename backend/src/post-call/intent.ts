import type { CallIntent } from '@prisma/client';

export function classifyIntent(text: string): CallIntent {
  const normalized = text.toLowerCase();

  if (/\b(book|schedule|appointment|demo)\b/.test(normalized)) {
    return 'book_demo';
  }

  if (/\b(price|pricing|cost|quote)\b/.test(normalized)) {
    return 'pricing_inquiry';
  }

  if (/\b(support|issue|problem|broken|help)\b/.test(normalized)) {
    return 'support_request';
  }

  if (/\b(what|how|where|when|who|which)\b/.test(normalized)) {
    return 'general_question';
  }

  return 'other';
}

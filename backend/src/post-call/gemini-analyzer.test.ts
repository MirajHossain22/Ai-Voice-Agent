import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GeminiPostCallAnalyzer } from './gemini-analyzer.js';

const mockGenerateContent = vi.fn();

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class MockGoogleGenAI {
      public models = {
        generateContent: mockGenerateContent,
      };
    },
  };
});

describe('GeminiPostCallAnalyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns default summary and other intent when transcript is empty', async () => {
    const analyzer = new GeminiPostCallAnalyzer('mock-api-key');
    const result = await analyzer.analyzeTranscript('   ');

    expect(result).toEqual({
      summary: 'No conversation transcript recorded for this call.',
      intent: 'other',
    });
  });

  it('parses valid JSON response from Gemini into summary and intent', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        summary:
          'Caller inquired about enterprise pricing and scheduled a demo.',
        intent: 'book_demo',
      }),
    });

    const analyzer = new GeminiPostCallAnalyzer('mock-api-key');
    const result = await analyzer.analyzeTranscript(
      'caller: Hello, I would like to schedule a demo for our company.',
    );

    expect(result).toEqual({
      summary: 'Caller inquired about enterprise pricing and scheduled a demo.',
      intent: 'book_demo',
    });
  });

  it('falls back gracefully to rule-based intent if Gemini throws an error', async () => {
    mockGenerateContent.mockRejectedValueOnce(
      new Error('API quota exceeded or network failure'),
    );

    const analyzer = new GeminiPostCallAnalyzer('mock-api-key');
    const result = await analyzer.analyzeTranscript(
      'caller: What are your pricing plans for small businesses?',
    );

    expect(result.intent).toBe('pricing_inquiry');
    expect(result.summary).toContain('What are your pricing plans');
  });

  it('falls back gracefully to rule-based intent if Gemini returns invalid schema', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: 'Not JSON at all, just plain text response',
    });

    const analyzer = new GeminiPostCallAnalyzer('mock-api-key');
    const result = await analyzer.analyzeTranscript(
      'caller: I need customer support with my login issue.',
    );

    expect(result.intent).toBe('support_request');
  });
});

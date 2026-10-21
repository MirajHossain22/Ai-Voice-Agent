import { GoogleGenAI } from '@google/genai';
import type { CallIntent } from '@prisma/client';
import { z } from 'zod';

import { classifyIntent as fallbackClassifyIntent } from './intent.js';

const analysisResponseSchema = z.object({
  summary: z.string().trim().min(1),
  intent: z.enum([
    'pricing_inquiry',
    'book_demo',
    'support_request',
    'general_question',
    'other',
  ]),
});

export type PostCallAnalysis = {
  summary: string;
  intent: CallIntent;
};

export class GeminiPostCallAnalyzer {
  private readonly ai: GoogleGenAI;
  private readonly model: string;

  public constructor(apiKey: string, model = 'gemini-2.5-flash') {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  public async analyzeTranscript(
    transcript: string,
  ): Promise<PostCallAnalysis> {
    if (!transcript.trim()) {
      return {
        summary: 'No conversation transcript recorded for this call.',
        intent: 'other',
      };
    }

    try {
      const prompt = `You are an expert post-call analyst for an AI automation agency.
Analyze the following phone conversation transcript between the AI agent and a caller.

Transcript:
"""
${transcript}
"""

Provide:
1. "summary": A clear, concise 1-2 sentence executive summary of what was discussed, what action was taken, and any follow-up items.
2. "intent": The primary reason the caller contacted the agency. Must be exactly one of:
   - "book_demo": Caller wanted to book, schedule, or reschedule a demo or appointment.
   - "pricing_inquiry": Caller asked about prices, costs, rates, packages, or fees.
   - "support_request": Caller requested technical assistance or customer support.
   - "general_question": Caller asked general questions about services or capabilities.
   - "other": Any other topic or unclear intent.

Return valid JSON with keys "summary" and "intent".`;

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const text = response.text?.trim();
      if (!text) {
        throw new Error('Empty response from Gemini');
      }

      const parsed = JSON.parse(text);
      const validated = analysisResponseSchema.parse(parsed);

      return {
        summary: validated.summary,
        intent: validated.intent as CallIntent,
      };
    } catch {
      return {
        summary: transcript.slice(0, 200).trim() || 'Call completed.',
        intent: fallbackClassifyIntent(transcript),
      };
    }
  }
}

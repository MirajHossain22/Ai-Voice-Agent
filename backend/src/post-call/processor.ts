import type { PrismaClient } from '@prisma/client';

import type { AppConfig } from '../config.js';
import { GeminiPostCallAnalyzer } from './gemini-analyzer.js';
import { classifyIntent } from './intent.js';

export async function processPostCall(
  prisma: PrismaClient,
  callId: string,
  config?: AppConfig,
): Promise<void> {
  const messages = await prisma.transcriptMessage.findMany({
    where: { callId },
    select: { role: true, text: true },
    orderBy: { timestamp: 'asc' },
  });

  if (config?.gemini?.apiKey) {
    const formattedTranscript = messages
      .map((message) => `${message.role}: ${message.text}`)
      .join('\n');
    const analyzer = new GeminiPostCallAnalyzer(
      config.gemini.apiKey,
      config.gemini.model,
    );
    const analysis = await analyzer.analyzeTranscript(formattedTranscript);

    await prisma.call.update({
      where: { id: callId },
      data: {
        intent: analysis.intent,
        summary: analysis.summary,
      },
    });
    return;
  }

  const transcript = messages.map((message) => message.text).join(' ');

  await prisma.call.update({
    where: { id: callId },
    data: {
      intent: classifyIntent(transcript),
    },
  });
}

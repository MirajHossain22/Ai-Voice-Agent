import type { PrismaClient } from '@prisma/client';

import { classifyIntent } from './intent.js';

export async function processPostCall(
  prisma: PrismaClient,
  callId: string,
): Promise<void> {
  const messages = await prisma.transcriptMessage.findMany({
    where: { callId },
    select: { text: true },
    orderBy: { timestamp: 'asc' },
  });
  const transcript = messages.map((message) => message.text).join(' ');

  await prisma.call.update({
    where: { id: callId },
    data: {
      intent: classifyIntent(transcript),
    },
  });
}

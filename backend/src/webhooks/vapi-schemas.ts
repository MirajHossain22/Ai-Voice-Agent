import { z } from 'zod';

const toolCallItemSchema = z.object({
  id: z.string().min(1),
  type: z.literal('function'),
  function: z.object({
    name: z.string().min(1),
    arguments: z.unknown(),
  }),
});

const callSchema = z
  .object({
    id: z.string().min(1),
    createdAt: z.union([z.string(), z.number()]).optional(),
    customer: z
      .object({
        number: z.string().min(1).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const messageSchema = z
  .object({
    type: z.string().min(1),
    call: callSchema.optional(),
    status: z.string().optional(),
    role: z.string().optional(),
    transcriptType: z.string().optional(),
    transcript: z.string().optional(),
    endedReason: z.string().optional(),
    toolCallList: z.array(toolCallItemSchema).optional(),
    toolCalls: z.array(toolCallItemSchema).optional(),
    artifact: z
      .object({
        transcript: z.string().optional(),
        messages: z.array(z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const vapiWebhookSchema = z.object({
  message: messageSchema,
});

export type VapiWebhook = z.infer<typeof vapiWebhookSchema>;

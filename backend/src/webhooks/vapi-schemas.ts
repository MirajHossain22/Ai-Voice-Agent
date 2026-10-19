import { z } from 'zod';

const callSchema = z
  .object({
    id: z.string().min(1),
    createdAt: z.string().datetime(),
    customer: z
      .object({
        number: z.string().min(1),
      })
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

import { createAgentTools } from './tools/handlers.js';
import type { ToolRepository } from './tools/types.js';

type ToolCall = {
  id: string;
  function: { name: string; arguments: unknown };
};

type ToolCallResult = {
  name: string;
  toolCallId: string;
  result: string;
};

function failure(code: string, message: string) {
  return { ok: false as const, error: { code, message } };
}

export async function dispatchToolCalls(
  repository: ToolRepository,
  providerCallId: string,
  toolCalls: ToolCall[],
): Promise<{ results: ToolCallResult[] }> {
  const callId = await repository.findLocalCallId(providerCallId);

  if (!callId) {
    return {
      results: toolCalls.map((toolCall) => ({
        name: toolCall.function.name,
        toolCallId: toolCall.id,
        result: JSON.stringify(failure('CALL_NOT_FOUND', 'call was not found')),
      })),
    };
  }

  const tools = createAgentTools(repository, { callId });
  const results: ToolCallResult[] = [];

  for (const toolCall of toolCalls) {
    const handler = tools[toolCall.function.name as keyof typeof tools];
    const result =
      typeof handler === 'function'
        ? await handler(toolCall.function.arguments)
        : failure('UNKNOWN_TOOL', 'tool is not supported');

    results.push({
      name: toolCall.function.name,
      toolCallId: toolCall.id,
      result: JSON.stringify(result),
    });
  }

  return { results };
}

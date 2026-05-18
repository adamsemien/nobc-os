/** SSE event contract between the agent route and the palette agent UI. */

export type AgentStreamEvent =
  | { type: 'thread'; conversationId: string }
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; toolName: string; label: string }
  | { type: 'tool_result'; toolName: string; summary: string; output: unknown }
  | {
      type: 'confirmation_required';
      turnId: string;
      toolName: string;
      input: unknown;
      prompt: string;
    }
  | { type: 'error'; message: string }
  | { type: 'done' };

/** Formats one event as an SSE frame. */
export function sse(event: AgentStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export const SSE_HEADERS: HeadersInit = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
};

/** Human-readable "→ doing X" label shown on a tool-call chip. */
export function toolCallLabel(toolName: string, input: unknown): string {
  const q = (input as { query?: string; question?: string } | null)?.query
    ?? (input as { question?: string } | null)?.question;
  switch (toolName) {
    case 'applications.find':
      return q ? `finding applications matching "${q}"` : 'finding applications';
    case 'applications.get':
      return 'loading application';
    case 'members.find':
      return q ? `finding members matching "${q}"` : 'finding members';
    case 'members.get':
      return 'loading member';
    case 'events.find':
      return q ? `finding events matching "${q}"` : 'finding events';
    case 'events.get':
      return 'loading event';
    case 'intelligence.run_metric':
      return 'running metric';
    case 'intelligence.compose':
      return 'composing insight';
    default:
      return `running ${toolName}`;
  }
}

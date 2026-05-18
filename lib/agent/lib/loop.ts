/** The agent loop. Rebuilds conversation history from AgentTurn rows, runs
 *  one streamText segment, streams SSE to the client, and persists the
 *  resulting turns. Confirmation-required tool calls pause the loop — they
 *  are persisted as AWAITING_CONFIRMATION and resumed by /api/agent/confirm. */
import { anthropic } from '@ai-sdk/anthropic';
import { streamText, stepCountIs, type ModelMessage } from 'ai';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { AGENT_MODEL, AGENT_SYSTEM_PROMPT } from '@/lib/agent/system-prompt';
import { buildToolSet, fromApiName, getConfirmationPrompt, toApiName } from '@/lib/agent/registry';
import type { AgentToolContext } from '@/lib/agent/types';
import { sse, SSE_HEADERS, toolCallLabel, type AgentStreamEvent } from './streaming';
import '@/lib/agent/tools'; // side effect: register every tool

const AGENT_UNAVAILABLE =
  'AI is unavailable right now. Try a direct command or come back in a moment.';

type AgentTurnRow = Prisma.AgentTurnGetPayload<object>;

type AssistantPart =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown };

/** Reconstructs AI-SDK messages from persisted turns. Consecutive assistant
 *  text + tool-call turns are merged into one assistant message so the
 *  user/assistant alternation the model expects holds. */
function buildMessages(turns: AgentTurnRow[]): ModelMessage[] {
  const messages: ModelMessage[] = [];
  let i = 0;

  while (i < turns.length) {
    const turn = turns[i];

    if (turn.role === 'USER') {
      messages.push({ role: 'user', content: turn.content ?? '' });
      i += 1;
      continue;
    }

    const assistantParts: AssistantPart[] = [];
    const toolMessages: ModelMessage[] = [];

    while (i < turns.length && (turns[i].role === 'ASSISTANT' || turns[i].role === 'TOOL_CALL')) {
      const t = turns[i];
      if (t.role === 'ASSISTANT') {
        if (t.content) assistantParts.push({ type: 'text', text: t.content });
      } else if (t.status !== 'AWAITING_CONFIRMATION' && t.status !== 'PENDING') {
        const callId = `call_${t.id}`;
        const apiName = toApiName(t.toolName ?? '');
        assistantParts.push({
          type: 'tool-call',
          toolCallId: callId,
          toolName: apiName,
          input: t.toolInput ?? {},
        });
        const output =
          t.status === 'CANCELLED'
            ? { status: 'user_cancelled' }
            : t.status === 'FAILED'
              ? { error: t.content ?? 'tool failed' }
              : (t.toolOutput ?? {});
        toolMessages.push({
          role: 'tool',
          content: [
            { type: 'tool-result', toolCallId: callId, toolName: apiName, output: { type: 'json', value: output } },
          ],
        } as ModelMessage);
      }
      i += 1;
    }

    if (assistantParts.length) messages.push({ role: 'assistant', content: assistantParts } as ModelMessage);
    messages.push(...toolMessages);
  }

  return messages;
}

function summarizeOutput(output: unknown): string {
  if (output && typeof output === 'object') {
    const o = output as Record<string, unknown>;
    if (typeof o.count === 'number') return `${o.count} result${o.count === 1 ? '' : 's'}`;
    if (o.found === false) return 'not found';
    if (o.ok === false && typeof o.error === 'string') return o.error;
    if (o.ok === true) return 'done';
    if (typeof o.narrative === 'string') return 'insight ready';
  }
  return 'done';
}

/** Runs one agent turn over the conversation's full history and returns an
 *  SSE Response. Persists assistant text and tool turns as it goes. */
export function streamAgentTurn(conversationId: string, ctx: AgentToolContext): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentStreamEvent) => controller.enqueue(encoder.encode(sse(event)));

      try {
        send({ type: 'thread', conversationId });

        const turns = await db.agentTurn.findMany({
          where: { conversationId },
          orderBy: { createdAt: 'asc' },
        });

        const result = streamText({
          model: anthropic(AGENT_MODEL),
          system: AGENT_SYSTEM_PROMPT,
          messages: buildMessages(turns),
          tools: buildToolSet(ctx),
          stopWhen: stepCountIs(8),
        });

        let assistantText = '';
        const calls = new Map<string, { toolName: string; input: unknown }>();
        const resolved = new Set<string>();

        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') {
            assistantText += part.text;
            send({ type: 'text', delta: part.text });
          } else if (part.type === 'tool-call') {
            const toolName = fromApiName(part.toolName);
            calls.set(part.toolCallId, { toolName, input: part.input });
            send({ type: 'tool_call', toolName, label: toolCallLabel(toolName, part.input) });
          } else if (part.type === 'tool-result') {
            const toolName = fromApiName(part.toolName);
            resolved.add(part.toolCallId);
            await db.agentTurn.create({
              data: {
                conversationId,
                role: 'TOOL_CALL',
                toolName,
                toolInput: (part.input ?? {}) as Prisma.InputJsonValue,
                toolOutput: (part.output ?? {}) as Prisma.InputJsonValue,
                status: 'COMPLETED',
              },
            });
            send({
              type: 'tool_result',
              toolName,
              summary: summarizeOutput(part.output),
              output: part.output,
            });
          } else if (part.type === 'tool-error') {
            const toolName = fromApiName(part.toolName);
            resolved.add(part.toolCallId);
            const message = part.error instanceof Error ? part.error.message : String(part.error);
            await db.agentTurn.create({
              data: {
                conversationId,
                role: 'TOOL_CALL',
                toolName,
                toolInput: (part.input ?? {}) as Prisma.InputJsonValue,
                status: 'FAILED',
                content: message,
              },
            });
            send({ type: 'tool_result', toolName, summary: 'failed', output: { error: message } });
          } else if (part.type === 'error') {
            send({ type: 'error', message: AGENT_UNAVAILABLE });
          }
        }

        if (assistantText.trim()) {
          await db.agentTurn.create({
            data: { conversationId, role: 'ASSISTANT', content: assistantText, status: 'COMPLETED' },
          });
        }

        // An unresolved tool call is a confirmation-required tool — pause here.
        for (const [callId, call] of calls) {
          if (resolved.has(callId)) continue;
          const prompt =
            (await getConfirmationPrompt(call.toolName, call.input, ctx)) ?? `Run ${call.toolName}?`;
          const turn = await db.agentTurn.create({
            data: {
              conversationId,
              role: 'TOOL_CALL',
              toolName: call.toolName,
              toolInput: (call.input ?? {}) as Prisma.InputJsonValue,
              status: 'AWAITING_CONFIRMATION',
              confirmationPrompt: prompt,
            },
          });
          send({
            type: 'confirmation_required',
            turnId: turn.id,
            toolName: call.toolName,
            input: call.input,
            prompt,
          });
          break; // only one confirmation at a time
        }

        await db.agentConversation.update({
          where: { id: conversationId },
          data: { lastTurnAt: new Date() },
        });
        send({ type: 'done' });
      } catch (e) {
        console.error('[agent loop] error:', e);
        send({ type: 'error', message: AGENT_UNAVAILABLE });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

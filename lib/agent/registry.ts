/** Agent tool registry — the catalog the agent loop reads from.
 *
 *  Workspace scoping is enforced here at registration: a tool whose handler
 *  never references `workspaceId` is refused at boot. Same hard check as the
 *  metric registry. */
import { tool, type ToolSet } from 'ai';
import { emitEvent } from '@/lib/emit-event';
import type { AgentToolContext, AnyAgentTool } from './types';

const REGISTRY = new Map<string, AnyAgentTool>();

/** Registers a tool. Throws if the handler is not workspace-scoped. */
export function registerTool(tool: AnyAgentTool): void {
  if (!tool.handler.toString().includes('workspaceId')) {
    throw new Error(
      `Agent tool "${tool.name}" handler never references workspaceId — refusing to register.`,
    );
  }
  REGISTRY.set(tool.name, tool); // idempotent — supports dev HMR
}

export function getTool(name: string): AnyAgentTool | undefined {
  return REGISTRY.get(name);
}

export function listTools(): AnyAgentTool[] {
  return [...REGISTRY.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/* ── API-safe name mapping ─────────────────────────────────────────────
 * Anthropic tool names allow only [a-zA-Z0-9_-]. Tool ids use dots and
 * single underscores ('intelligence.run_metric'), so dots map to '__'. */
export function toApiName(name: string): string {
  return name.replaceAll('.', '__');
}
export function fromApiName(apiName: string): string {
  return apiName.replaceAll('__', '.');
}

/** Builds the Vercel AI SDK tool set. Confirmation-required tools are
 *  registered without an `execute` so the loop pauses on them; everything
 *  else auto-executes through executeTool (which also emits audit). */
export function buildToolSet(ctx: AgentToolContext): ToolSet {
  const set: ToolSet = {};
  for (const t of listTools()) {
    set[toApiName(t.name)] = t.requiresConfirmation
      ? tool({ description: t.description, inputSchema: t.inputSchema })
      : tool({
          description: t.description,
          inputSchema: t.inputSchema,
          execute: (input) => executeTool(t.name, input, ctx),
        });
  }
  return set;
}

/** Runs a tool handler. Validates input, then emits an AuditEvent for write
 *  tools (those with a non-empty auditAction). Read tools skip audit. */
export async function executeTool(
  name: string,
  input: unknown,
  ctx: AgentToolContext,
): Promise<unknown> {
  const t = REGISTRY.get(name);
  if (!t) throw new Error(`Unknown agent tool: ${name}`);

  const parsed = t.inputSchema.parse(input);
  const output = await t.handler(parsed, ctx);

  if (t.auditAction) {
    await emitEvent({
      workspaceId: ctx.workspaceId,
      actorId: ctx.operatorId,
      actorType: 'AGENT',
      action: t.auditAction,
      entityType: t.auditEntityType || 'AGENT',
      entityId: t.auditEntityId ? t.auditEntityId(parsed, output) : '-',
      metadata: { tool: t.name, threadId: ctx.threadId },
    });
  }
  return output;
}

/** Returns the human-readable confirmation string, or null if none needed. */
export async function getConfirmationPrompt(
  name: string,
  input: unknown,
  ctx: AgentToolContext,
): Promise<string | null> {
  const t = REGISTRY.get(name);
  if (!t || !t.requiresConfirmation) return null;
  const parsed = t.inputSchema.parse(input);
  return t.confirmationPrompt ? t.confirmationPrompt(parsed, ctx) : `Run ${t.name}?`;
}

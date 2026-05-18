/** Agent tool type system.
 *
 *  Every agent tool is one file in lib/agent/tools/{group}/{slug}.ts that
 *  calls registerTool() at import time. The registry enforces workspace
 *  scoping at registration. Mirrors the metric + command registry pattern. */
import type { z } from 'zod';

export interface AgentToolContext {
  /** Every tool query is scoped to this workspace — no exceptions. */
  workspaceId: string;
  /** Clerk user id of the operator the agent acts on behalf of. */
  operatorId: string;
  /** AgentConversation id for this session. */
  threadId: string;
}

export interface AgentTool<TInput = unknown, TOutput = unknown> {
  /** Dotted id, e.g. 'applications.approve'. */
  name: string;
  /** Shown to Claude — be specific about what it does and when to use it. */
  description: string;
  inputSchema: z.ZodType<TInput>;

  /** When true, the agent loop pauses for operator confirmation before the
   *  handler runs. Required for emails, payments, RSVPs, application reviews. */
  requiresConfirmation: boolean;
  /** Human-readable confirmation string shown in the palette. */
  confirmationPrompt?: (input: TInput, ctx: AgentToolContext) => Promise<string>;

  /** The actual work. Runs after confirmation when one is required. */
  handler: (input: TInput, ctx: AgentToolContext) => Promise<TOutput>;

  /** Audit action, e.g. 'application.approved'. Empty string = no audit
   *  (read tools produce AgentTurn rows but not AuditEvents). */
  auditAction: string;
  /** Audited entity type, e.g. 'APPLICATION'. */
  auditEntityType: string;
  /** Resolves the audited entity id from input + output. */
  auditEntityId?: (input: TInput, output: TOutput) => string;
}

/** Heterogeneous tools share one registry — io types vary per tool, so the
 *  registry erases them. `any` is required here: under strictFunctionTypes a
 *  specific `handler` is not assignable to an `unknown`-typed one. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyAgentTool = AgentTool<any, any>;

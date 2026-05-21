import type { z } from 'zod';

/**
 * The authenticated context every MCP tool runs inside. Both fields are derived
 * from the verified bearer token / session — NEVER from the request body — so a
 * tool can only ever touch the caller's own workspace.
 */
export type McpContext = {
  userId: string;
  workspaceId: string;
};

/**
 * A single MCP tool. `inputSchema` is a Zod schema (validated on every call and
 * surfaced to clients as JSON Schema via `tools/list`). `destructive` marks
 * tools that mutate or remove data and should sit behind the agent's
 * human-in-the-loop confirmation gate (Stage 08 rule #5).
 */
export type McpTool = {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  destructive?: boolean;
  handler: (ctx: McpContext, args: Record<string, unknown>) => Promise<unknown>;
};

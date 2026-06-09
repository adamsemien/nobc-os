import type { z } from 'zod';
import type { OperatorRole } from '@prisma/client';

/**
 * The authenticated context every MCP tool runs inside. All fields are derived
 * from the verified bearer token / session — NEVER from the request body — so a
 * tool can only ever touch the caller's own workspace. `role` is the caller's
 * effective operator role (Clerk-org floor included), used to gate writes.
 */
export type McpContext = {
  userId: string;
  workspaceId: string;
  role: OperatorRole;
};

/**
 * A single MCP tool. `inputSchema` is a Zod schema (validated on every call and
 * surfaced to clients as JSON Schema via `tools/list`). `destructive` marks
 * tools that mutate or remove data and should sit behind the agent's
 * human-in-the-loop confirmation gate (Stage 08 rule #5) — it is a UX hint, NOT
 * an auth signal.
 *
 * `minRole` is the auth floor enforced before the handler runs. The registry
 * DEFAULT-DENIES: a tool with no `minRole` requires STAFF, so a write can never
 * leak through as a read. Read-only tools must explicitly opt down to
 * `READ_ONLY`. Mirrors the REST `requireRole` table (writes STAFF, reads open).
 */
export type McpTool = {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  destructive?: boolean;
  minRole?: OperatorRole;
  handler: (ctx: McpContext, args: Record<string, unknown>) => Promise<unknown>;
};

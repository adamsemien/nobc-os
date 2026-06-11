import { z } from 'zod';
import { OperatorRole } from '@prisma/client';
import { roleAtLeast } from '@/lib/operator-role';
import type { McpContext, McpTool } from './types';
import { memberTools } from './tools/members';
import { applicationTools } from './tools/applications';
import { eventTools } from './tools/events';
import { rsvpTools } from './tools/rsvps';
import { checkinTools } from './tools/checkin';
import { legacyTools } from './legacy-tools';

let cached: Map<string, McpTool> | null = null;

/** Every MCP tool, keyed by name. Built once per server process. */
export function getToolMap(): Map<string, McpTool> {
  if (cached) return cached;
  const all: McpTool[] = [
    ...memberTools,
    ...applicationTools,
    ...eventTools,
    ...rsvpTools,
    ...checkinTools,
    ...legacyTools(),
  ];
  const map = new Map<string, McpTool>();
  for (const tool of all) {
    if (map.has(tool.name)) throw new Error(`Duplicate MCP tool name: ${tool.name}`);
    map.set(tool.name, tool);
  }
  cached = map;
  return map;
}

type JsonSchema = Record<string, unknown>;

function toInputSchema(schema: z.ZodType): JsonSchema {
  const json = z.toJSONSchema(schema) as JsonSchema;
  // MCP `inputSchema` is a bare JSON Schema object; drop the dialect marker.
  delete json.$schema;
  if (json.type !== 'object') {
    // MCP requires an object schema at the top level.
    return { type: 'object', properties: {}, additionalProperties: true };
  }
  return json;
}

/** The `tools/list` payload — name, description, JSON-Schema input contract. */
export function listToolSchemas() {
  return [...getToolMap().values()].map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: toInputSchema(t.inputSchema),
    annotations: t.destructive ? { destructiveHint: true } : undefined,
  }));
}

/** Validate args against the tool's schema and execute it. Throws on unknown
 *  tool, insufficient role, or validation failure (the route maps each to a
 *  JSON-RPC error). */
export async function callTool(
  name: string,
  ctx: McpContext,
  args: unknown,
): Promise<unknown> {
  const tool = getToolMap().get(name);
  if (!tool) throw new ToolNotFoundError(name);

  // Default-deny: a tool with no declared floor requires STAFF, so a write can
  // never leak through as a read. Read-only tools opt down to READ_ONLY.
  const required = tool.minRole ?? OperatorRole.STAFF;
  if (!roleAtLeast(ctx.role, required)) {
    throw new ToolForbiddenError(name, required);
  }

  const parsed = tool.inputSchema.parse(args ?? {});
  return tool.handler(ctx, parsed as Record<string, unknown>);
}

export class ToolNotFoundError extends Error {
  constructor(name: string) {
    super(`Unknown tool: ${name}`);
    this.name = 'ToolNotFoundError';
  }
}

export class ToolForbiddenError extends Error {
  constructor(name: string, required: OperatorRole) {
    super(`Forbidden: tool "${name}" requires ${required}`);
    this.name = 'ToolForbiddenError';
  }
}

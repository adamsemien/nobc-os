import type { McpContext } from './types';
import { callTool, listToolSchemas, ToolForbiddenError, ToolNotFoundError } from './registry';

const SERVER_INFO = { name: 'nobc-os', version: '1.0.0' };
const DEFAULT_PROTOCOL_VERSION = '2025-06-18';

type JsonValue = unknown;
type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: Record<string, JsonValue>;
};

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: JsonValue;
  error?: { code: number; message: string; data?: JsonValue };
};

const ERR = {
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
  FORBIDDEN: -32004,
} as const;

function ok(id: JsonRpcId, result: JsonValue): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}
function fail(id: JsonRpcId, code: number, message: string, data?: JsonValue): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

function isRequest(value: unknown): value is JsonRpcRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { jsonrpc?: unknown }).jsonrpc === '2.0' &&
    typeof (value as { method?: unknown }).method === 'string'
  );
}

/**
 * Handle one JSON-RPC message (MCP over Streamable HTTP, stateless). Returns the
 * response object, or `null` for notifications (messages with no `id`).
 */
async function handleOne(msg: unknown, ctx: McpContext): Promise<JsonRpcResponse | null> {
  if (!isRequest(msg)) {
    return fail(null, ERR.INVALID_REQUEST, 'Invalid JSON-RPC request');
  }

  const id = msg.id ?? null;
  const isNotification = msg.id === undefined;
  const params = (msg.params ?? {}) as Record<string, JsonValue>;

  switch (msg.method) {
    case 'initialize': {
      const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : DEFAULT_PROTOCOL_VERSION;
      return ok(id, {
        protocolVersion: requested,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      });
    }

    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null; // notifications get no response

    case 'ping':
      return ok(id, {});

    case 'tools/list':
      return ok(id, { tools: listToolSchemas() });

    case 'tools/call': {
      const name = params.name;
      if (typeof name !== 'string') {
        return fail(id, ERR.INVALID_PARAMS, 'tools/call requires a string `name`');
      }
      const args = params.arguments;
      try {
        const result = await callTool(name, ctx, args);
        return ok(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        });
      } catch (err) {
        if (err instanceof ToolNotFoundError) {
          return fail(id, ERR.INVALID_PARAMS, err.message);
        }
        // Authorization failures are protocol errors, not tool results — the
        // caller lacks the role, so don't hand the model a retryable result.
        if (err instanceof ToolForbiddenError) {
          return fail(id, ERR.FORBIDDEN, err.message);
        }
        // Tool execution / validation errors are returned as tool results with
        // isError per the MCP spec, so the model can read and react to them.
        const message = err instanceof Error ? err.message : String(err);
        return ok(id, {
          content: [{ type: 'text', text: `Error: ${message}` }],
          isError: true,
        });
      }
    }

    default:
      if (isNotification) return null;
      return fail(id, ERR.METHOD_NOT_FOUND, `Unknown method: ${msg.method}`);
  }
}

/**
 * Handle a parsed JSON-RPC payload (single message or batch) for an
 * authenticated context. Returns the response payload, or `null` when there is
 * nothing to send (e.g. a batch of only notifications).
 */
export async function handleMcpPayload(
  payload: unknown,
  ctx: McpContext,
): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  if (Array.isArray(payload)) {
    const responses = (await Promise.all(payload.map((m) => handleOne(m, ctx)))).filter(
      (r): r is JsonRpcResponse => r !== null,
    );
    return responses.length ? responses : null;
  }
  return handleOne(payload, ctx);
}

import { NextRequest, NextResponse } from 'next/server';
import { authenticateMcp } from '@/lib/mcp/auth';
import { handleMcpPayload } from '@/lib/mcp/server';
import { listToolSchemas } from '@/lib/mcp/registry';

// Prisma + @clerk/backend require the Node.js runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The NoBC OS MCP server (Stage 08, V1 item #17).
 *
 * A Model Context Protocol endpoint over JSON-RPC 2.0 (Streamable HTTP, stateless).
 * Every request must carry a valid bearer token (Clerk session token), verified
 * with Clerk's backend SDK; the workspace is derived from the authenticated
 * identity, never from the request body — the cross-tenant boundary. The Runtype
 * master agent (and any MCP client) drives the platform through the tools here.
 */
function unauthorized() {
  return NextResponse.json(
    { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unauthorized' } },
    { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
  );
}

export async function POST(req: NextRequest) {
  const ctx = await authenticateMcp(req);
  if (!ctx) return unauthorized();

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
      { status: 400 },
    );
  }

  try {
    const response = await handleMcpPayload(payload, ctx);
    if (response === null) {
      // Nothing to return (e.g. a notification) — 202 Accepted per MCP.
      return new NextResponse(null, { status: 202 });
    }
    return NextResponse.json(response);
  } catch (err) {
    console.error('[mcp] dispatch error:', err);
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } },
      { status: 500 },
    );
  }
}

/** Convenience manifest — the authenticated tool surface as JSON Schemas. */
export async function GET(req: NextRequest) {
  const ctx = await authenticateMcp(req);
  if (!ctx) return unauthorized();
  return NextResponse.json({
    server: { name: 'nobc-os', version: '1.0.0', protocol: 'mcp/2025-06-18' },
    tools: listToolSchemas(),
  });
}

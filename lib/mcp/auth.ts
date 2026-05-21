import type { NextRequest } from 'next/server';
import { verifyToken } from '@clerk/backend';
import { auth } from '@clerk/nextjs/server';
import { requireWorkspaceId } from '@/lib/auth';
import type { McpContext } from './types';

/**
 * Authenticate an inbound MCP request and resolve its workspace.
 *
 * Primary path: an `Authorization: Bearer <token>` header carrying a Clerk
 * session token, verified with Clerk's backend SDK (`verifyToken`). Fallback:
 * an active Clerk browser session (cookies) for in-app / Claude-Desktop callers.
 *
 * The Clerk identity gives us the user id; the workspace is then derived from
 * that user's org membership (`requireWorkspaceId`). The workspace is NEVER read
 * from the request body — that is the cross-tenant security boundary.
 *
 * Returns the resolved context, or `null` for any unauthenticated / unresolvable
 * request (the caller turns that into a 401).
 */
export async function authenticateMcp(req: NextRequest): Promise<McpContext | null> {
  const userId = (await userIdFromBearer(req)) ?? (await userIdFromSession());
  if (!userId) return null;

  try {
    const workspaceId = await requireWorkspaceId(userId);
    return { userId, workspaceId };
  } catch {
    // Authenticated, but no resolvable workspace (no org membership).
    return null;
  }
}

async function userIdFromBearer(req: NextRequest): Promise<string | null> {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1].trim();
  if (!token) return null;

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;

  try {
    const payload = await verifyToken(token, { secretKey });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

async function userIdFromSession(): Promise<string | null> {
  try {
    const { userId } = await auth();
    return userId ?? null;
  } catch {
    return null;
  }
}

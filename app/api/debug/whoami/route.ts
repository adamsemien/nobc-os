import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { getOrCreateWorkspaceForUser } from '@/lib/auth';
import { getOperatorRole } from '@/lib/operator-role';

// TEMPORARY DIAGNOSTIC — DELETE AFTER USE.
// Tells us in one shot whether House Phone's empty inbox is a resolver bug
// (resolver returns the wrong workspace) or an API bug (resolver returns the
// right workspace but the conversations route mishandles it): compare the SMS
// count for the RESOLVED workspace against the SMS count for the known data
// workspace.
const DATA_WORKSPACE_ID = 'cmpd6xckn000004jl47xpwghx';

export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  }

  // ADMIN gate anchored to the DATA workspace, NOT the resolved one. If we gated
  // on the resolved workspace and the resolver is the bug, the gate would 403
  // and mask the very evidence we need. getOperatorRole is a direct
  // WorkspaceMember lookup, so it doesn't depend on the resolver.
  const role = await getOperatorRole(userId, DATA_WORKSPACE_ID);
  if (role !== OperatorRole.ADMIN) {
    return NextResponse.json(
      { error: 'admin of data workspace required', roleInDataWorkspace: role },
      { status: 403 },
    );
  }

  let resolvedWorkspaceId: string | null = null;
  let resolverError: string | null = null;
  try {
    const ws = await getOrCreateWorkspaceForUser(userId);
    resolvedWorkspaceId = ws.id;
  } catch (err) {
    resolverError = err instanceof Error ? err.message : String(err);
  }

  const resolvedWorkspaceSmsCount =
    resolvedWorkspaceId === null
      ? null
      : await db.smsConversation.count({ where: { workspaceId: resolvedWorkspaceId } });
  const dataWorkspaceSmsCount = await db.smsConversation.count({
    where: { workspaceId: DATA_WORKSPACE_ID },
  });

  const payload = {
    userId,
    orgId: orgId ?? null,
    resolvedWorkspaceId,
    resolverError,
    resolvedWorkspaceSmsCount,
    dataWorkspaceSmsCount,
  };

  console.log('[debug/whoami]', JSON.stringify(payload));
  return NextResponse.json(payload);
}

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/operator-role';
import { OperatorRole } from '@prisma/client';
import { getSvix } from '@/lib/svix';
import { db } from '@/lib/db';

// Returns a short-lived Svix AppPortal token for the operator to manage their webhooks.
// ADMIN-gated: the token grants full outbound-webhook management and first call provisions
// the Svix app, matching the rest of settings/*.
export async function GET() {
  const gate = await requireRole(OperatorRole.ADMIN);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  const svix = getSvix();
  if (!svix) {
    return NextResponse.json({ error: 'Webhooks not configured' }, { status: 503 });
  }

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, svixAppId: true, name: true },
  });
  if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

  let svixAppId = workspace.svixAppId;

  // Create Svix application if not yet provisioned
  if (!svixAppId) {
    const app = await svix.application.create({ name: workspace.name, uid: workspace.id });
    svixAppId = app.id;
    await db.workspace.update({ where: { id: workspaceId }, data: { svixAppId } });
  }

  const { token } = await svix.authentication.appPortalAccess(svixAppId, {});
  return NextResponse.json({ token });
}

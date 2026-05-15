import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { requireWorkspaceId } from '@/lib/auth';
import { getSvix } from '@/lib/svix';
import { db } from '@/lib/db';

// Returns a short-lived Svix AppPortal token for the operator to manage their webhooks
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);
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

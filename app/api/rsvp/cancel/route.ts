import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { getMemberWorkspaceId } from '@/lib/auth';
import { cancelRsvp } from '@/lib/waitlist';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  let body: { rsvpId: string };
  try { body = (await req.json()) as { rsvpId: string }; }
  catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  try {
    await cancelRsvp(body.rsvpId, workspaceId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 400 });
  }
}

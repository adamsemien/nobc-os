import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { getMemberWorkspaceId } from '@/lib/auth';
import { submitMemberRsvp } from '@/lib/rsvp-submit';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  let body: {
    eventId: string;
    customAnswers?: Record<string, string | boolean | number | null>;
    plusOne?: { name?: string; instagram?: string };
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const result = await submitMemberRsvp(workspaceId, userId, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  if ('waitlisted' in result) {
    return NextResponse.json({ waitlisted: true, position: result.position }, { status: 200 });
  }

  return NextResponse.json({
    rsvpId: result.rsvpId,
    memberQrCode: result.memberQrCode,
    ticketStatus: result.ticketStatus,
  });
}

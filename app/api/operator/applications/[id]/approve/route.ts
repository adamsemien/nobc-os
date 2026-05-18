import { auth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';
import { requireWorkspaceId } from '@/lib/auth';
import { approveApplication } from '@/lib/applications/approve';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);
  const { id } = await params;

  let reviewNote: string | undefined;
  try {
    const body = (await req.json()) as { note?: unknown };
    if (typeof body?.note === 'string') reviewNote = body.note.trim().slice(0, 4000) || undefined;
  } catch { /* optional */ }

  const outcome = await approveApplication({
    applicationId: id,
    workspaceId,
    actorId: userId,
    reviewNote,
  });

  if (!outcome.ok) {
    const map = {
      not_found: { status: 404, error: 'Not found' },
      forbidden: { status: 403, error: 'Forbidden' },
      already_approved: { status: 409, error: 'Already approved' },
    } as const;
    const { status, error } = map[outcome.error];
    return Response.json({ error }, { status });
  }

  return Response.json({ application: outcome.application, member: outcome.member });
}

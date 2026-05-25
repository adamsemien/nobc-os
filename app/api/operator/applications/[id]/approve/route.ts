import { NextRequest } from 'next/server';
import { requireRole } from '@/lib/operator-role';
import { OperatorRole } from '@prisma/client';
import { approveApplication } from '@/lib/applications/approve';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
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

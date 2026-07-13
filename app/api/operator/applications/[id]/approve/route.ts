import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/operator-role';

import { approveApplication } from '@/lib/applications/approve';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requirePermission('application.decide');
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await params;

  let reviewNote: string | undefined;
  let confirmUnsubmitted = false;
  try {
    const body = (await req.json()) as { note?: unknown; confirmUnsubmitted?: unknown };
    if (typeof body?.note === 'string') reviewNote = body.note.trim().slice(0, 4000) || undefined;
    confirmUnsubmitted = body?.confirmUnsubmitted === true;
  } catch { /* optional */ }

  const outcome = await approveApplication({
    applicationId: id,
    workspaceId,
    actorId: userId,
    reviewNote,
    allowUnsubmitted: confirmUnsubmitted,
  });

  if (!outcome.ok) {
    const map = {
      not_found: { status: 404, error: 'Not found' },
      forbidden: { status: 403, error: 'Forbidden' },
      already_approved: { status: 409, error: 'Already approved' },
      not_submitted: { status: 409, error: 'Not submitted' },
    } as const;
    const { status, error } = map[outcome.error];
    return Response.json({ error }, { status });
  }

  return Response.json({ application: outcome.application, member: outcome.member });
}

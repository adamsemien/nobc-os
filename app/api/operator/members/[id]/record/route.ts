import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { z } from 'zod';
import { requireRole } from '@/lib/operator-role';
import { assembleMemberRecord } from '@/lib/member-record';

// PR3 read-path: the full operator-facing member record (core + dimensions +
// customFields/fieldProvenance + engagement timeline + psychographics). Operator-gated
// via requireRole — being an operator (any role) is exactly the condition under which
// the firewalled psychographic profile may be returned, so includePsychographics is
// tied to the gate. Sponsors hold no operator role and cannot reach this route.
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole(OperatorRole.READ_ONLY);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;
  const { id } = await params;

  const parsed = querySchema.safeParse({
    limit: req.nextUrl.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
  }

  const record = await assembleMemberRecord({
    workspaceId,
    memberId: id,
    // Operator gate satisfied → psychographics permitted. The firewall keeps this off
    // every sponsor surface; this is the trusted operator read.
    includePsychographics: true,
    timelineLimit: parsed.data.limit,
  });
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(record);
}

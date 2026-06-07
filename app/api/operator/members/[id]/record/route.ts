import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { z } from 'zod';
import { requireRole, roleAtLeast } from '@/lib/operator-role';
import { assembleMemberRecord } from '@/lib/member-record';

// PR3 read-path: the full operator-facing member record (core + dimensions +
// customFields/fieldProvenance + engagement timeline + psychographics). Any operator
// (READ_ONLY+) may VIEW the record; the firewalled psychographic profile is restricted
// further to STAFF+ — a READ_ONLY operator gets the record without psychographics.
// Sponsors hold no operator role and cannot reach this route at all.
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
    // Psychographics is STAFF+ only. READ_ONLY operators view the record without it; the
    // firewall additionally keeps psychographics off every sponsor surface.
    includePsychographics: roleAtLeast(gate.role, OperatorRole.STAFF),
    timelineLimit: parsed.data.limit,
  });
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(record);
}

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { requireRole } from '@/lib/operator-role';
import { emitEvent } from '@/lib/emit-event';

// Influence Model — Layer 1 referral spine (see _context/16-member-intelligence/INFLUENCE-MODEL.md).
// referredBy is a single self-referential relation already in the schema (Member.referredByMemberId,
// the "MemberReferrals" self-relation). This route reads the spine for a record (referrer up +
// referred members down) and lets a STAFF+ operator set/clear it. Internal operator knowledge only;
// never sponsor-facing. No schema change.

type Person = { id: string; firstName: string; lastName: string; email: string };

const displayName = (m: Person) => `${m.firstName} ${m.lastName}`.trim() || m.email;

// GET — the spine for this record: the one referrer (up) and the members they referred (down).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await requireWorkspaceId(userId);
  const { id } = await params;

  const member = await db.member.findFirst({
    where: { id, workspaceId },
    select: {
      id: true,
      referredByMember: { select: { id: true, firstName: true, lastName: true, email: true } },
      referredMembers: {
        orderBy: { createdAt: 'desc' },
        select: { id: true, firstName: true, lastName: true, email: true, status: true },
      },
    },
  });
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

  return NextResponse.json({
    referrer: member.referredByMember
      ? { id: member.referredByMember.id, fullName: displayName(member.referredByMember), email: member.referredByMember.email }
      : null,
    referred: member.referredMembers.map((r) => ({
      id: r.id,
      fullName: displayName(r),
      email: r.email,
      status: r.status,
    })),
    referredCount: member.referredMembers.length,
  });
}

// PUT — set or clear this member's referrer. STAFF+. Body: { referrerId: string | null }.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const referrerId =
    body && typeof body.referrerId === 'string' && body.referrerId.trim() ? body.referrerId.trim() : null;

  const member = await db.member.findFirst({
    where: { id, workspaceId },
    select: { id: true, fieldProvenance: true, mergedIntoId: true },
  });
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  if (member.mergedIntoId) {
    return NextResponse.json({ error: 'This record is merged and cannot be edited.' }, { status: 409 });
  }

  if (referrerId) {
    if (referrerId === id) {
      return NextResponse.json({ error: 'A member cannot refer themselves.' }, { status: 400 });
    }
    const referrer = await db.member.findFirst({
      where: { id: referrerId, workspaceId },
      select: { id: true },
    });
    if (!referrer) {
      return NextResponse.json({ error: 'Referrer not found in this workspace.' }, { status: 400 });
    }
    // Cycle guard: walk up the referrer's own chain; if it reaches this member, the link
    // would create a loop (A→B→A). Bounded so a pre-existing bad chain can't spin forever.
    let cursor: string | null = referrerId;
    for (let hops = 0; cursor && hops < 50; hops++) {
      const up: { referredByMemberId: string | null } | null = await db.member.findUnique({
        where: { id: cursor },
        select: { referredByMemberId: true },
      });
      const next = up?.referredByMemberId ?? null;
      if (next === id) {
        return NextResponse.json(
          { error: 'That would create a circular referral.' },
          { status: 400 },
        );
      }
      cursor = next;
    }
  }

  // Stamp provenance the same shape the create/PATCH write-paths use (operator_entered, conf 1).
  const syncedAt = new Date().toISOString();
  const fieldProvenance: Record<string, unknown> = {
    ...((member.fieldProvenance as Record<string, unknown> | null) ?? {}),
  };
  if (referrerId) {
    fieldProvenance.referredBy = { value: referrerId, source: 'operator_entered', confidence: 1, syncedAt };
  } else {
    delete fieldProvenance.referredBy;
  }

  await db.member.update({
    where: { id },
    data: {
      referredByMemberId: referrerId,
      fieldProvenance: fieldProvenance as Prisma.InputJsonValue,
    },
  });

  await emitEvent({
    workspaceId,
    actorId: userId,
    action: referrerId ? 'member.referrer_set' : 'member.referrer_cleared',
    entityType: 'MEMBER',
    entityId: id,
    metadata: { referrerId },
  });

  const updated = referrerId
    ? await db.member.findUnique({
        where: { id: referrerId },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : null;

  return NextResponse.json({
    referrer: updated ? { id: updated.id, fullName: displayName(updated), email: updated.email } : null,
  });
}

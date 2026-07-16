import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { emitEvent } from '@/lib/emit-event';

/** Inline-editable Person fields (STAFF). email and clerkUserId are identity
 *  keys — they change only through claim/verification flows, never from the
 *  operator UI, so they are simply not accepted here. */
const EDITABLE_FIELDS = ['firstName', 'lastName', 'phone'] as const;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const person = await db.person.findFirst({ where: { id, workspaceId } });
  if (!person) return NextResponse.json({ error: 'Person not found.' }, { status: 404 });
  if (person.mergedIntoId) {
    return NextResponse.json(
      { error: 'This record was merged — edit the surviving record instead.' },
      { status: 409 },
    );
  }

  const data: Record<string, string | null> = {};
  const changed: Record<string, string | null> = {};
  for (const field of EDITABLE_FIELDS) {
    const raw = (body as Record<string, unknown>)[field];
    if (raw === undefined) continue; // not provided → unchanged
    if (raw !== null && typeof raw !== 'string') {
      return NextResponse.json({ error: `Invalid value for ${field}` }, { status: 422 });
    }
    const next = typeof raw === 'string' ? raw.trim() || null : null;
    if (next !== person[field]) {
      data[field] = next;
      changed[`${field}_from`] = person[field];
      changed[`${field}_to`] = next;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ id: person.id, updated: false });
  }

  await db.person.update({ where: { id: person.id }, data });
  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'person.updated',
    entityType: 'PERSON',
    entityId: person.id,
    metadata: changed,
  });
  return NextResponse.json({ id: person.id, updated: true });
}

/** HARD DELETE (ADMIN) for junk rows. Refuses — clear message, no action —
 *  when the Person has a linked Member, an Application, or sits on either
 *  side of a merge (survivor OR tombstone, D5: merge history must stay).
 *
 *  Child behavior on an allowed delete (prod FK actions):
 *    ContactSource, PersonOrganization → CASCADE (rows deleted)
 *    ChannelSubscription / SuppressionEntry / RSVP → personId SET NULL
 *      (member-keyed consent + destination-keyed suppression survive)
 *    MemberEngagementEvent → personId SET NULL; person-only events (no
 *      memberId) are deleted in the same transaction so no double-null
 *      orphans remain
 *    other Persons' potentialDuplicateOfId → SET NULL (their flag clears)
 *    ConsentArtifact → RESTRICT (guarded above with a 409 — TCPA consent
 *      evidence is never deletable) */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(OperatorRole.ADMIN);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await ctx.params;

  const person = await db.person.findFirst({
    where: { id, workspaceId },
    include: {
      _count: { select: { members: true, applications: true, mergedFrom: true, consentArtifacts: true } },
    },
  });
  if (!person) return NextResponse.json({ error: 'Person not found.' }, { status: 404 });

  if (person.mergedIntoId) {
    return NextResponse.json(
      {
        error: 'This record was merged — it is part of the merge history and cannot be deleted.',
        survivorId: person.mergedIntoId,
      },
      { status: 409 },
    );
  }
  if (person._count.mergedFrom > 0) {
    return NextResponse.json(
      { error: 'Other records were merged into this person — merge history cannot be deleted.' },
      { status: 409 },
    );
  }
  if (person._count.members > 0) {
    return NextResponse.json(
      { error: 'This person has a membership profile. Deletion is blocked — resolve through the membership surface or a merge.' },
      { status: 409 },
    );
  }
  if (person._count.applications > 0) {
    return NextResponse.json(
      { error: 'This person has an application on file — deletion is blocked.' },
      { status: 409 },
    );
  }
  // ConsentArtifact carries onDelete: Restrict — without this guard the delete
  // below would surface a raw Prisma P2003 (500) instead of this clean refusal.
  // Consent evidence outlives tidiness (TCPA retention).
  if (person._count.consentArtifacts > 0) {
    return NextResponse.json(
      { error: 'This person has SMS consent records on file — consent evidence cannot be deleted.' },
      { status: 409 },
    );
  }

  const identity = {
    email: person.email,
    firstName: person.firstName,
    lastName: person.lastName,
    phone: person.phone,
  };

  await db.$transaction([
    db.memberEngagementEvent.deleteMany({ where: { workspaceId, personId: id, memberId: null } }),
    db.person.delete({ where: { id } }),
  ]);

  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'person.deleted',
    entityType: 'PERSON',
    entityId: id,
    metadata: identity,
  });
  return NextResponse.json({ deleted: true });
}

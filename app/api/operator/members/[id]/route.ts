import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { requireRole } from '@/lib/operator-role';
import { emitEvent } from '@/lib/emit-event';
import { applyFieldWrites, patchMemberSchema, type FieldWrite } from '@/lib/member-provenance';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await requireWorkspaceId(userId);
  const { id } = await params;

  const member = await db.member.findFirst({
    where: { id, workspaceId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
      tags: true,
      energyScore: true,
      networkValueScore: true,
      aiSummary: true,
      totalEventsAttended: true,
      lastAttendedDate: true,
      createdAt: true,
      approvedAt: true,
    },
  });
  if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [application, rsvps, watchEntry] = await Promise.all([
    db.application.findFirst({
      where: { workspaceId, email: { equals: member.email, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        archetype: true,
        archetypeScores: true,
        aiScore: true,
        aiReasoning: true,
        aiRecommendation: true,
        city: true,
        neighborhood: true,
        referredBy: true,
        createdAt: true,
        status: true,
      },
    }),
    db.rSVP.findMany({
      where: { workspaceId, memberId: id },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true,
        status: true,
        checkedIn: true,
        checkedInAt: true,
        event: { select: { id: true, title: true, startAt: true, slug: true } },
      },
    }),
    db.watchList.findFirst({
      where: { workspaceId, deletedAt: null, matchEmail: { equals: member.email, mode: 'insensitive' } },
      select: { type: true, note: true, createdAt: true },
    }),
  ]);

  return NextResponse.json({
    member: {
      ...member,
      lastAttendedDate: member.lastAttendedDate?.toISOString() ?? null,
      createdAt: member.createdAt.toISOString(),
      approvedAt: member.approvedAt?.toISOString() ?? null,
    },
    application,
    rsvps: rsvps.map((r) => ({
      id: r.id,
      status: r.status,
      checkedIn: r.checkedIn,
      checkedInAt: r.checkedInAt?.toISOString() ?? null,
      event: {
        id: r.event.id,
        title: r.event.title,
        slug: r.event.slug,
        startAt: r.event.startAt.toISOString(),
      },
    })),
    watch: watchEntry,
  });
}

// Provenance write-path (member-intelligence PR2). Writes member dimension values into
// `customFields` and stamps `fieldProvenance[key] = { value, source, confidence, syncedAt }`.
// STAFF+ only (READ_ONLY operators cannot write). The merge is additive: unwritten keys
// are preserved. Editing a soft-merged duplicate is refused — operators edit the canonical
// record. Sync-sourced writes (verified_enrichment | producer) also append an
// `enrichment_synced` engagement event; operator edits land in the audit log only.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await params;

  const json = await req.json().catch(() => null);
  const parsed = patchMemberSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const member = await db.member.findFirst({
    where: { id, workspaceId },
    select: { id: true, customFields: true, fieldProvenance: true, mergedIntoId: true },
  });
  if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (member.mergedIntoId) {
    return NextResponse.json(
      { error: 'Member has been merged; edit the canonical record' },
      { status: 409 },
    );
  }

  const writes = parsed.data.fields as Record<string, FieldWrite>;
  const syncedAt = new Date().toISOString();
  const { customFields, fieldProvenance } = applyFieldWrites({
    customFields: member.customFields as Record<string, unknown> | null,
    fieldProvenance: member.fieldProvenance as Record<string, unknown> | null,
    writes,
    syncedAt,
  });

  const updated = await db.member.update({
    where: { id: member.id },
    data: {
      customFields: customFields as Prisma.InputJsonValue,
      fieldProvenance: fieldProvenance as Prisma.InputJsonValue,
    },
    select: { id: true, customFields: true, fieldProvenance: true },
  });

  const keys = Object.keys(writes);
  const isSync = Object.values(writes).some(
    (w) => w.source === 'verified_enrichment' || w.source === 'producer',
  );
  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'member.fields_updated',
    entityType: 'member',
    entityId: member.id,
    metadata: { fields: keys.join(','), count: keys.length },
    ...(isSync
      ? { engagement: { memberId: member.id, eventType: 'enrichment_synced' as const } }
      : {}),
  });

  return NextResponse.json({ member: updated });
}

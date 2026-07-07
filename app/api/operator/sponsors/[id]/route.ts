import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { emitEvent } from '@/lib/emit-event';
import { requireRole } from '@/lib/operator-role';
import { OperatorRole, Prisma } from '@prisma/client';

const UpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  contactEmail: z.string().trim().email('Valid email required').nullable().optional(),
  declaredObjectives: z.string().trim().nullable().optional(),
  targetPersonaCriteria: z.record(z.string(), z.unknown()).nullable().optional(),
  rightsFeeCents: z.number().int().nonnegative().nullable().optional(),
  icp: z.string().trim().nullable().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;
  const { id } = await params;

  const sponsor = await db.sponsorBrandProfile.findFirst({ where: { id, workspaceId } });
  if (!sponsor) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(sponsor);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole(OperatorRole.ADMIN);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await params;

  const existing = await db.sponsorBrandProfile.findFirst({ where: { id, workspaceId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
  }
  const d = parsed.data;

  // Only touch fields that were actually provided. Json null needs Prisma.JsonNull,
  // not a bare null, to clear the column.
  const data: Prisma.SponsorBrandProfileUpdateInput = {};
  if (d.name !== undefined) data.name = d.name;
  if (d.contactEmail !== undefined) data.contactEmail = d.contactEmail;
  if (d.declaredObjectives !== undefined) data.declaredObjectives = d.declaredObjectives;
  if (d.rightsFeeCents !== undefined) data.rightsFeeCents = d.rightsFeeCents;
  if (d.icp !== undefined) data.icp = d.icp;
  if (d.targetPersonaCriteria !== undefined) {
    data.targetPersonaCriteria =
      d.targetPersonaCriteria === null ? Prisma.JsonNull : (d.targetPersonaCriteria as Prisma.InputJsonValue);
  }

  const updated = await db.sponsorBrandProfile.update({ where: { id }, data });
  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'sponsor.updated',
    entityType: 'SPONSOR',
    entityId: updated.id,
    metadata: { fields: Object.keys(data).join(',') },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole(OperatorRole.ADMIN);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await params;

  // Guarded hard delete (no soft-delete column on this model). Refuse if the
  // sponsor has linked intelligence artifacts so we never orphan recaps/surveys
  // or trip the required SeriesSponsor FK (the nullable FKs would SetNull, but
  // unlinking historical data silently is worse than a clear 409).
  const sponsor = await db.sponsorBrandProfile.findFirst({
    where: { id, workspaceId },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          generatedAssets: true,
          recapSnapshots: true,
          surveyResponses: true,
          seriesSponsors: true,
          sponsorScopedQuestions: true,
        },
      },
    },
  });
  if (!sponsor) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const c = sponsor._count;
  const linked =
    c.generatedAssets + c.recapSnapshots + c.surveyResponses + c.seriesSponsors + c.sponsorScopedQuestions;
  if (linked > 0) {
    return NextResponse.json(
      {
        error: 'sponsor_has_dependencies',
        detail: 'This sponsor has linked recaps, assets, surveys, series, or registration questions. Unlink those before deleting.',
      },
      { status: 409 },
    );
  }

  await db.sponsorBrandProfile.delete({ where: { id } });
  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'sponsor.deleted',
    entityType: 'SPONSOR',
    entityId: id,
    metadata: { name: sponsor.name },
  });
  return NextResponse.json({ ok: true });
}

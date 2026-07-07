import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { emitEvent } from '@/lib/emit-event';

/** Person↔Organization affiliations (STAFF), used by BOTH the Organization
 *  detail and the Person detail. Both sides are verified in-workspace before
 *  any write — the affiliation row is the only join between them. */
export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  const body = await req.json().catch(() => null);
  const organizationId = typeof body?.organizationId === 'string' ? body.organizationId : '';
  const personId = typeof body?.personId === 'string' ? body.personId : '';
  const role =
    typeof body?.role === 'string' && body.role.trim() ? (body.role.trim() as string) : null;
  const isPrimary = body?.isPrimary === true;
  if (!organizationId || !personId) {
    return NextResponse.json(
      { error: 'organizationId and personId are required' },
      { status: 400 },
    );
  }

  const [organization, person] = await Promise.all([
    db.organization.findFirst({ where: { id: organizationId, workspaceId }, select: { id: true } }),
    db.person.findFirst({ where: { id: personId, workspaceId }, select: { id: true, mergedIntoId: true } }),
  ]);
  if (!organization || !person) {
    return NextResponse.json({ error: 'Not found in this workspace.' }, { status: 404 });
  }
  if (person.mergedIntoId) {
    return NextResponse.json(
      { error: 'This person record was merged — affiliate the surviving record instead.' },
      { status: 409 },
    );
  }

  try {
    const affiliation = await db.personOrganization.create({
      data: { workspaceId, personId, organizationId, role, isPrimary },
      select: { id: true },
    });
    await emitEvent({
      workspaceId,
      actorId: userId,
      action: 'organization.affiliation_added',
      entityType: 'ORGANIZATION',
      entityId: organizationId,
      metadata: { personId, role, isPrimary },
    });
    return NextResponse.json({ id: affiliation.id }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json(
        { error: 'This person is already affiliated with the organization.' },
        { status: 409 },
      );
    }
    console.error(`[affiliations/create] failed (org=${organizationId} person=${personId}):`, err);
    return NextResponse.json({ error: 'Could not add affiliation.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const affiliation = await db.personOrganization.findFirst({
    where: { id, workspaceId },
    select: { id: true, personId: true, organizationId: true },
  });
  if (!affiliation) {
    return NextResponse.json({ error: 'Affiliation not found.' }, { status: 404 });
  }

  await db.personOrganization.delete({ where: { id: affiliation.id } });
  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'organization.affiliation_removed',
    entityType: 'ORGANIZATION',
    entityId: affiliation.organizationId,
    metadata: { personId: affiliation.personId, affiliationId: affiliation.id },
  });
  return NextResponse.json({ deleted: true });
}

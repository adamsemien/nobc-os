import { NextRequest, NextResponse } from 'next/server';
import { OrganizationKind, OperatorRole, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { emitEvent } from '@/lib/emit-event';

/** Normalize a typed domain to a bare hostname: lowercase, no protocol/www/path.
 *  Same rule as the create route — the (workspaceId, domain) unique matches on
 *  the stored value. */
function normalizeDomain(raw: string): string | null {
  const bare = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];
  return bare || null;
}

/** Inline edit (STAFF): name/kind/domain/website/notes — partial update, only
 *  provided fields change. Audit carries per-field from→to. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const input = body as Record<string, unknown>;

  const organization = await db.organization.findFirst({ where: { id, workspaceId } });
  if (!organization) {
    return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });
  }

  const data: Record<string, string | null> = {};
  const changed: Record<string, string | null> = {};
  function stage(field: 'name' | 'kind' | 'domain' | 'website' | 'notes', next: string | null) {
    if (next !== organization![field]) {
      data[field] = next;
      changed[`${field}_from`] = organization![field];
      changed[`${field}_to`] = next;
    }
  }

  if (input.name !== undefined) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'Organization name is required.' }, { status: 400 });
    }
    stage('name', name);
  }
  if (input.kind !== undefined) {
    if (!Object.values(OrganizationKind).includes(input.kind as OrganizationKind)) {
      return NextResponse.json({ error: 'Invalid organization type.' }, { status: 422 });
    }
    stage('kind', input.kind as string);
  }
  if (input.domain !== undefined) {
    stage('domain', typeof input.domain === 'string' ? normalizeDomain(input.domain) : null);
  }
  if (input.website !== undefined) {
    const website = typeof input.website === 'string' ? input.website.trim() || null : null;
    stage('website', website);
  }
  if (input.notes !== undefined) {
    const notes = typeof input.notes === 'string' ? input.notes.trim() || null : null;
    stage('notes', notes);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ id: organization.id, updated: false });
  }

  try {
    await db.organization.update({ where: { id: organization.id }, data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json(
        { error: 'An organization with this domain already exists.' },
        { status: 409 },
      );
    }
    console.error(`[organizations/update] failed (org=${id}):`, err);
    return NextResponse.json({ error: 'Could not update organization.' }, { status: 500 });
  }

  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'organization.updated',
    entityType: 'ORGANIZATION',
    entityId: organization.id,
    metadata: changed,
  });
  return NextResponse.json({ id: organization.id, updated: true });
}

/** Hard delete (ADMIN). Refuses while people are affiliated — remove the
 *  affiliations first, so a delete is always an explicit two-step. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(OperatorRole.ADMIN);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await ctx.params;

  const organization = await db.organization.findFirst({
    where: { id, workspaceId },
    include: { _count: { select: { people: true } } },
  });
  if (!organization) {
    return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });
  }
  if (organization._count.people > 0) {
    return NextResponse.json(
      {
        error: `This organization has ${organization._count.people} affiliated ${organization._count.people === 1 ? 'person' : 'people'} — remove the affiliations first.`,
      },
      { status: 409 },
    );
  }

  await db.organization.delete({ where: { id: organization.id } });
  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'organization.deleted',
    entityType: 'ORGANIZATION',
    entityId: organization.id,
    metadata: { name: organization.name, kind: organization.kind, domain: organization.domain },
  });
  return NextResponse.json({ deleted: true });
}

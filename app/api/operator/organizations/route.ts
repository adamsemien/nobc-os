import { NextRequest, NextResponse } from 'next/server';
import { OrganizationKind, OperatorRole, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { emitEvent } from '@/lib/emit-event';

/** Normalize a typed domain to a bare hostname: lowercase, no protocol/www/path. */
function normalizeDomain(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const bare = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];
  return bare || null;
}

// Organization creation is a STAFF+ action (READ_ONLY operators cannot write).
export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'Organization name is required.' }, { status: 400 });
  }
  const kind: OrganizationKind = Object.values(OrganizationKind).includes(body.kind)
    ? body.kind
    : OrganizationKind.other;
  const domain = normalizeDomain(body.domain);
  const website =
    typeof body.website === 'string' && body.website.trim() ? body.website.trim() : null;
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;

  try {
    const organization = await db.organization.create({
      data: { workspaceId, name, kind, domain, website, notes },
    });

    await emitEvent({
      workspaceId,
      actorId: userId,
      action: 'organization.created',
      entityType: 'ORGANIZATION',
      entityId: organization.id,
      metadata: { name, kind, domain },
    });

    return NextResponse.json({ organization: { id: organization.id } }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json(
        { error: 'An organization with this domain already exists.' },
        { status: 409 },
      );
    }
    console.error('[organizations/create] failed:', err);
    return NextResponse.json({ error: 'Could not create organization.' }, { status: 500 });
  }
}

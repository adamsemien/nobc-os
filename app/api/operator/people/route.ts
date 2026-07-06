import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { emitEvent } from '@/lib/emit-event';
import { resolvePerson } from '@/lib/crm/resolve-person';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function cleanField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** ADD PERSON (STAFF). Goes through resolvePerson — NOT a new mint path. The
 *  strict identity policy applies unchanged: an operator-typed email is
 *  unverified and never links to an existing Person; a collision flags the
 *  pair for the merge queue (surfaced to the UI via flaggedDuplicate). */
export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const firstName = cleanField((body as Record<string, unknown>).firstName);
  const lastName = cleanField((body as Record<string, unknown>).lastName);
  const email = cleanField((body as Record<string, unknown>).email)?.toLowerCase() ?? null;
  const phone = cleanField((body as Record<string, unknown>).phone);

  if (email && !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 422 });
  }
  if (!firstName && !lastName && !email && !phone) {
    return NextResponse.json(
      { error: 'At least a name, an email, or a phone is required.' },
      { status: 422 },
    );
  }

  try {
    const person = await resolvePerson({
      workspaceId,
      email,
      emailVerified: false,
      phone,
      firstName,
      lastName,
      source: 'operator',
    });
    const flaggedDuplicate = Boolean(person.potentialDuplicateOfId);
    await emitEvent({
      workspaceId,
      actorId: userId,
      action: 'person.created',
      entityType: 'PERSON',
      entityId: person.id,
      metadata: { email: person.email, flaggedDuplicate },
    });
    return NextResponse.json({ id: person.id, flaggedDuplicate });
  } catch (err) {
    console.error(`[people/create] failed (workspace=${workspaceId}):`, err);
    return NextResponse.json({ error: 'Could not add person.' }, { status: 500 });
  }
}

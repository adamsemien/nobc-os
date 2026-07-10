import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { emitEvent } from '@/lib/emit-event';
import { applyFieldWrites, patchMemberSchema, type FieldWrite } from '@/lib/member-provenance';
import { isReservedKey } from '@/lib/member-editable';

/** Person-capable custom fields write path (CRM spine Slice 0). Reuses the
 *  entity-agnostic merge logic in lib/member-provenance.ts unchanged. Unlike
 *  the Member PATCH route (app/api/operator/members/[id]/route.ts), there is
 *  no first-class-column partition — Person has no firmographic scalar
 *  columns, so every write lands in customFields. FieldDefinition rows stay
 *  scoped to section: 'member' (shared catalog with Member — accepted debt,
 *  per the Slice 0 plan). */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await ctx.params;

  const json = await req.json().catch(() => null);
  const parsed = patchMemberSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const person = await db.person.findFirst({
    where: { id, workspaceId },
    select: { id: true, customFields: true, fieldProvenance: true, mergedIntoId: true },
  });
  if (!person) return NextResponse.json({ error: 'Person not found.' }, { status: 404 });
  if (person.mergedIntoId) {
    return NextResponse.json(
      { error: 'This record was merged — edit the surviving record instead.' },
      { status: 409 },
    );
  }

  const writes = parsed.data.fields as Record<string, FieldWrite>;
  const keys = Object.keys(writes);

  // Firewall guard, same as the Member route. Person has no readonly scalar
  // columns to also guard against — customFields is the only write surface.
  const reserved = keys.filter(isReservedKey);
  if (reserved.length) {
    return NextResponse.json(
      { error: `Reserved field(s) cannot be edited: ${reserved.join(', ')}` },
      { status: 400 },
    );
  }

  const syncedAt = new Date().toISOString();
  const { customFields, fieldProvenance } = applyFieldWrites({
    customFields: person.customFields as Record<string, unknown> | null,
    fieldProvenance: person.fieldProvenance as Record<string, unknown> | null,
    writes,
    syncedAt,
  });

  const updated = await db.person.update({
    where: { id: person.id },
    data: {
      customFields: customFields as Prisma.InputJsonValue,
      fieldProvenance: fieldProvenance as Prisma.InputJsonValue,
    },
    select: { id: true, customFields: true, fieldProvenance: true },
  });

  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'person.fields_updated',
    entityType: 'PERSON',
    entityId: person.id,
    metadata: { fields: keys.join(','), count: keys.length },
  });

  return NextResponse.json({ person: updated });
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole, requirePermission } from '@/lib/operator-role';
import { emitEvent } from '@/lib/emit-event';
import { isReservedKey, slugifyFieldKey } from '@/lib/member-editable';

// F5 — member custom-field definitions (member-intelligence PR3 Slice 2). Activates the
// dormant FieldDefinition model as the member-field registry. Member fields live under
// section='member' (kept separate from the application-form QuestionDefinition registry).
//
//  - GET  (STAFF+): list active member field definitions for the workspace.
//  - PATCH (ADMIN): batch upsert + soft-delete (isActive=false preserves stored values).
//
// Reserved/firewall keys (archetype/psychographic) are rejected here AND on the write-path,
// so an operator can never define a field that shadows psychographic data.

const MEMBER_SECTION = 'member';
const FIELD_TYPES = ['text', 'textarea', 'select', 'url', 'checkbox'] as const;

const FieldSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(80),
  type: z.enum(FIELD_TYPES),
  options: z.array(z.string().trim().min(1)).max(50).optional(),
  sponsorVisible: z.boolean().default(false),
});

const BodySchema = z.object({
  fields: z.array(FieldSchema).min(0).max(100),
});

export async function GET() {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  const fields = await db.fieldDefinition.findMany({
    where: { workspaceId, section: MEMBER_SECTION, isActive: true },
    orderBy: { order: 'asc' },
    select: {
      id: true,
      stableKey: true,
      name: true,
      type: true,
      options: true,
      sponsorVisible: true,
      order: true,
    },
  });

  return NextResponse.json({ fields });
}

export async function PATCH(req: NextRequest) {
  const gate = await requirePermission('settings.edit');
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 422 });
  }

  // Firewall: a field whose key resolves to a reserved/psychographic token is refused.
  const reserved = parsed.data.fields.filter((f) => isReservedKey(slugifyFieldKey(f.name)));
  if (reserved.length) {
    return NextResponse.json(
      { error: `Reserved field name(s) not allowed: ${reserved.map((f) => f.name).join(', ')}` },
      { status: 400 },
    );
  }

  const existing = await db.fieldDefinition.findMany({
    where: { workspaceId, section: MEMBER_SECTION },
    select: { id: true, stableKey: true },
  });
  const existingById = new Map(existing.map((e) => [e.id, e]));
  const incomingIds = new Set(parsed.data.fields.map((f) => f.id).filter((x): x is string => !!x));
  const usedKeys = new Set(existing.map((e) => e.stableKey));

  function mintKey(name: string): string {
    const base = slugifyFieldKey(name);
    let key = base;
    let i = 1;
    while (usedKeys.has(key)) key = `${base}_${i++}`;
    usedKeys.add(key);
    return key;
  }

  await db.$transaction(async (tx) => {
    // Soft-delete fields removed from the incoming set (preserve stored member values).
    const removed = existing.filter((e) => !incomingIds.has(e.id));
    if (removed.length) {
      await tx.fieldDefinition.updateMany({
        where: { id: { in: removed.map((e) => e.id) } },
        data: { isActive: false },
      });
    }

    for (let i = 0; i < parsed.data.fields.length; i++) {
      const f = parsed.data.fields[i];
      const options = f.type === 'select' ? (f.options ?? []) : [];
      if (f.id && existingById.has(f.id)) {
        await tx.fieldDefinition.update({
          where: { id: f.id },
          data: { name: f.name, type: f.type, options, sponsorVisible: f.sponsorVisible, order: i, isActive: true },
        });
      } else {
        await tx.fieldDefinition.create({
          data: {
            workspaceId,
            section: MEMBER_SECTION,
            stableKey: mintKey(f.name),
            name: f.name,
            type: f.type,
            options,
            sponsorVisible: f.sponsorVisible,
            order: i,
            isActive: true,
          },
        });
      }
    }
  });

  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'settings.member_fields_updated',
    entityType: 'workspace',
    entityId: workspaceId,
    metadata: { count: parsed.data.fields.length },
  });

  return NextResponse.json({ ok: true });
}

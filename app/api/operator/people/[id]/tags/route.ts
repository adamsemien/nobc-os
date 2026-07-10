import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole, TagEntityType } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { emitEvent } from '@/lib/emit-event';

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tag';
}

/** Person-capable tags write path (CRM spine Slice 0) — the first human-UI
 *  write path for the polymorphic Tag/EntityTag model. Previously the only
 *  code constructing EntityTag rows was agent/MCP tooling
 *  (lib/mcp/legacy-tools.ts's tag.create + tag.apply), never a human control,
 *  and never for entityType: 'person'. Find-or-create the Tag by its
 *  workspace-unique slug, then upsert the EntityTag join row — same shape as
 *  legacy-tools.ts. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const name = typeof (body as Record<string, unknown> | null)?.name === 'string'
    ? ((body as Record<string, unknown>).name as string).trim()
    : '';
  if (!name) return NextResponse.json({ error: 'Tag name is required.' }, { status: 400 });

  const person = await db.person.findFirst({ where: { id, workspaceId } });
  if (!person) return NextResponse.json({ error: 'Person not found.' }, { status: 404 });
  if (person.mergedIntoId) {
    return NextResponse.json(
      { error: 'This record was merged — edit the surviving record instead.' },
      { status: 409 },
    );
  }

  const slug = slugify(name);
  const tag = await db.tag.upsert({
    where: { workspaceId_slug: { workspaceId, slug } },
    create: { workspaceId, name, slug },
    update: {},
  });

  await db.entityTag.upsert({
    where: {
      tagId_entityType_entityId: { tagId: tag.id, entityType: TagEntityType.person, entityId: person.id },
    },
    create: {
      workspaceId,
      tagId: tag.id,
      entityType: TagEntityType.person,
      entityId: person.id,
      appliedBy: userId,
    },
    update: { appliedBy: userId },
  });

  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'person.tag_applied',
    entityType: 'PERSON',
    entityId: person.id,
    metadata: { tagId: tag.id, name: tag.name },
  });

  return NextResponse.json({ tag: { id: tag.id, name: tag.name, color: tag.color } });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const tagId = typeof (body as Record<string, unknown> | null)?.tagId === 'string'
    ? ((body as Record<string, unknown>).tagId as string)
    : '';
  if (!tagId) return NextResponse.json({ error: 'tagId is required.' }, { status: 400 });

  const person = await db.person.findFirst({ where: { id, workspaceId } });
  if (!person) return NextResponse.json({ error: 'Person not found.' }, { status: 404 });

  const res = await db.entityTag.deleteMany({
    where: { workspaceId, tagId, entityType: TagEntityType.person, entityId: person.id },
  });

  if (res.count > 0) {
    await emitEvent({
      workspaceId,
      actorId: userId,
      action: 'person.tag_removed',
      entityType: 'PERSON',
      entityId: person.id,
      metadata: { tagId },
    });
  }

  return NextResponse.json({ removed: res.count });
}

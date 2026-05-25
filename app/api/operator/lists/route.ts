import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { requireRole } from '@/lib/operator-role';
import { OperatorRole } from '@prisma/client';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await requireWorkspaceId(userId);

  const type = req.nextUrl.searchParams.get('type');
  const search = req.nextUrl.searchParams.get('q')?.toLowerCase();

  const entries = await db.watchList.findMany({
    where: {
      workspaceId,
      deletedAt: null,
      ...(type === 'PURPLE' || type === 'BLOCKED' ? { type } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });

  const filtered = search
    ? entries.filter(
        (e: typeof entries[number]) =>
          e.matchEmail?.toLowerCase().includes(search) ||
          e.matchPhone?.includes(search) ||
          e.matchInstagram?.toLowerCase().includes(search) ||
          e.note?.toLowerCase().includes(search),
      )
    : entries;

  return NextResponse.json({ entries: filtered });
}

const PostSchema = z.object({
  type: z.enum(['PURPLE', 'BLOCKED']),
  matchEmail: z.string().email().optional().nullable(),
  matchPhone: z.string().max(30).optional().nullable(),
  matchInstagram: z.string().max(100).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
}).refine(
  d => d.matchEmail || d.matchPhone || d.matchInstagram,
  { message: 'At least one match field required' },
);

export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const entry = await db.watchList.create({
    data: {
      workspaceId,
      type: parsed.data.type,
      matchEmail: parsed.data.matchEmail ?? null,
      matchPhone: parsed.data.matchPhone ?? null,
      matchInstagram: parsed.data.matchInstagram ?? null,
      note: parsed.data.note ?? null,
      createdBy: userId,
    },
  });

  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId: userId,
      action: `watchlist.${parsed.data.type.toLowerCase()}.added`,
      entityType: 'WatchList',
      entityId: entry.id,
    },
  });

  return NextResponse.json({ entry }, { status: 201 });
}

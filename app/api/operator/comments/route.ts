import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { requireRole } from '@/lib/operator-role';
import { OperatorRole } from '@prisma/client';
import { notifyMentions, maybeFireSlack } from '@/lib/comments-notify';

const ENTITY_TYPES = ['application', 'member', 'event', 'rsvp'] as const;

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await requireWorkspaceId(userId);

  const entityType = req.nextUrl.searchParams.get('entityType');
  const entityId = req.nextUrl.searchParams.get('entityId');
  if (!entityType || !entityId) {
    return NextResponse.json({ error: 'entityType and entityId required' }, { status: 400 });
  }

  const comments = await db.operatorComment.findMany({
    where: { workspaceId, entityType, entityId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json({ comments });
}

const PostSchema = z.object({
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.string().min(1).max(60),
  body: z.string().trim().min(1).max(4000),
  mentions: z.array(z.string().min(1).max(60)).max(20).optional(),
});

export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  let payload: unknown;
  try { payload = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = PostSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const client = await clerkClient();
  const author = await client.users.getUser(userId).catch(() => null);
  const authorName =
    author?.fullName ||
    [author?.firstName, author?.lastName].filter(Boolean).join(' ') ||
    author?.primaryEmailAddress?.emailAddress ||
    'Operator';

  const comment = await db.operatorComment.create({
    data: {
      workspaceId,
      authorId: userId,
      authorName,
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      body: parsed.data.body,
      mentions: parsed.data.mentions ?? [],
    },
  });

  if (comment.mentions.length > 0) {
    await notifyMentions({
      workspaceId,
      comment,
      authorName,
    });
  }
  await maybeFireSlack({
    workspaceId,
    type: 'comment',
    title: `${authorName} commented on ${comment.entityType}`,
    body: comment.body.slice(0, 280),
    link: linkFor(comment.entityType, comment.entityId),
  });

  return NextResponse.json({ comment }, { status: 201 });
}

function linkFor(entityType: string, entityId: string): string {
  if (entityType === 'application') return `/operator/applications/${entityId}`;
  if (entityType === 'member') return `/operator/members/${entityId}`;
  if (entityType === 'event') return `/operator/events/${entityId}`;
  return `/operator`;
}

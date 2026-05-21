import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { emitEvent } from '@/lib/emit-event';
import type { McpTool } from '../types';

function fullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

const getMembersSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().describe('Max members to return (default 50)'),
  offset: z.number().int().min(0).optional().describe('Number of members to skip (pagination)'),
  status: z
    .enum(['approved', 'pending', 'all'])
    .optional()
    .describe('Filter by membership status (default approved)'),
  searchQuery: z.string().optional().describe('Case-insensitive match on name or email'),
});

const getMemberSchema = z
  .object({
    id: z.string().optional().describe('Member id'),
    email: z.string().optional().describe('Member email (alternative to id)'),
  })
  .refine((v) => v.id || v.email, { message: 'Provide either id or email' });

const tagMemberSchema = z.object({
  id: z.string().describe('Member id'),
  add: z.array(z.string()).optional().describe('Tags to add'),
  remove: z.array(z.string()).optional().describe('Tags to remove'),
});

export const memberTools: McpTool[] = [
  {
    name: 'nobc_get_members',
    description:
      'List members in the workspace. Filter by status (approved | pending | all) and an optional name/email search. Returns id, name, email, archetype, approvedAt, totalEventsAttended.',
    inputSchema: getMembersSchema,
    handler: async (ctx, rawArgs) => {
      const args = getMembersSchema.parse(rawArgs);
      const take = args.limit ?? 50;
      const skip = args.offset ?? 0;
      const status = args.status ?? 'approved';

      const where: Prisma.MemberWhereInput = { workspaceId: ctx.workspaceId };
      if (status === 'approved') where.approved = true;
      else if (status === 'pending') where.status = 'PENDING';

      if (args.searchQuery && args.searchQuery.trim()) {
        const q = args.searchQuery.trim();
        where.OR = [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ];
      }

      const members = await db.member.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          approvedAt: true,
          totalEventsAttended: true,
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      });

      // Archetype lives on the member's Application — batch-resolve by memberId.
      const ids = members.map((m) => m.id);
      const apps = ids.length
        ? await db.application.findMany({
            where: { workspaceId: ctx.workspaceId, memberId: { in: ids } },
            select: { memberId: true, archetype: true },
          })
        : [];
      const archetypeByMember = new Map(apps.map((a) => [a.memberId, a.archetype]));

      const total = await db.member.count({ where });

      return {
        members: members.map((m) => ({
          id: m.id,
          name: fullName(m.firstName, m.lastName),
          email: m.email,
          archetype: archetypeByMember.get(m.id) ?? null,
          approvedAt: m.approvedAt,
          totalEventsAttended: m.totalEventsAttended,
        })),
        total,
        limit: take,
        offset: skip,
      };
    },
  },
  {
    name: 'nobc_get_member',
    description:
      'Get a single member by id or email. Returns the full member record plus their application answers, archetype, AI score, and RSVP history.',
    inputSchema: getMemberSchema,
    handler: async (ctx, rawArgs) => {
      const args = getMemberSchema.parse(rawArgs);
      const member = args.email
        ? await db.member.findUnique({
            where: { workspaceId_email: { workspaceId: ctx.workspaceId, email: args.email } },
          })
        : await db.member.findFirst({ where: { id: args.id, workspaceId: ctx.workspaceId } });

      if (!member) return { found: false };

      const application = await db.application.findFirst({
        where: {
          workspaceId: ctx.workspaceId,
          OR: [{ memberId: member.id }, { email: member.email }],
        },
        include: { answers: { select: { questionKey: true, answer: true } } },
        orderBy: { createdAt: 'desc' },
      });

      const rsvps = await db.rSVP.findMany({
        where: { workspaceId: ctx.workspaceId, memberId: member.id },
        select: {
          id: true,
          ticketStatus: true,
          checkedIn: true,
          checkedInAt: true,
          event: { select: { id: true, title: true, slug: true, startAt: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return {
        found: true,
        member,
        archetype: application?.archetype ?? null,
        aiScore: application?.aiScore ?? null,
        aiRecommendation: application?.aiRecommendation ?? null,
        applicationAnswers: application?.answers ?? [],
        rsvpHistory: rsvps,
      };
    },
  },
  {
    name: 'nobc_tag_member',
    description:
      'Add and/or remove freeform tags on a member. Args: id (required), add (string[]), remove (string[]). Writes an audit event.',
    inputSchema: tagMemberSchema,
    destructive: false,
    handler: async (ctx, rawArgs) => {
      const args = tagMemberSchema.parse(rawArgs);
      const member = await db.member.findFirst({
        where: { id: args.id, workspaceId: ctx.workspaceId },
        select: { id: true, tags: true },
      });
      if (!member) throw new Error('Member not found in this workspace');

      const set = new Set(member.tags);
      for (const t of args.add ?? []) set.add(t);
      for (const t of args.remove ?? []) set.delete(t);
      const tags = [...set];

      const updated = await db.member.update({
        where: { id: member.id },
        data: { tags },
        select: { id: true, tags: true },
      });

      await emitEvent({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        actorType: 'AGENT',
        action: 'member.tagged',
        entityType: 'MEMBER',
        entityId: member.id,
        metadata: { add: (args.add ?? []).join(','), remove: (args.remove ?? []).join(','), via: 'mcp' },
      });

      return updated;
    },
  },
];

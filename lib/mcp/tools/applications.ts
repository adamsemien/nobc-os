import { z } from 'zod';
import { randomBytes } from 'crypto';
import { MemberStatus, OperatorRole, type ApplicationStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { emitEvent } from '@/lib/emit-event';
import { resolvePerson } from '@/lib/crm/resolve-person';
import type { McpContext, McpTool } from '../types';

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'HOLD', 'WAITLISTED', 'DECLINED'] as const;

const getApplicationsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().describe('Max applications to return (default 50)'),
  offset: z.number().int().min(0).optional().describe('Number to skip (pagination)'),
  status: z
    .enum([...STATUSES, 'all'])
    .optional()
    .describe('Filter by status (default PENDING). "all" returns every status.'),
});

const getApplicationSchema = z.object({ id: z.string().describe('Application id') });

const approveSchema = z.object({
  applicationId: z.string().describe('Application id'),
  note: z.string().optional().describe('Optional internal review note'),
});

const rejectSchema = z.object({
  applicationId: z.string().describe('Application id'),
  reason: z.string().optional().describe('Optional rejection reason (stored on the record)'),
  note: z.string().optional().describe('Optional internal review note'),
});

const waitlistSchema = z.object({
  applicationId: z.string().describe('Application id'),
  note: z.string().optional().describe('Optional internal review note'),
});

/** Shared approve path — also used by the legacy `approve_application` alias. */
export async function approveApplication(ctx: McpContext, applicationId: string, note?: string) {
  const app = await db.application.findFirst({
    where: { id: applicationId, workspaceId: ctx.workspaceId },
  });
  if (!app) throw new Error('Application not found or not in this workspace');
  if (app.status === 'APPROVED') throw new Error('Already approved');

  const memberQrCode = randomBytes(8).toString('hex');
  const now = new Date();
  const [firstName, ...rest] = app.fullName.trim().split(' ');
  const lastName = rest.join(' ') || '';

  const existingMember = await db.member.findUnique({
    where: { workspaceId_email: { workspaceId: ctx.workspaceId, email: app.email } },
    select: { id: true },
  });

  const [updatedApp, member] = await db.$transaction([
    db.application.update({
      where: { id: applicationId },
      data: { status: 'APPROVED', reviewedAt: now, reviewedBy: ctx.userId, reviewNote: note ?? null },
    }),
    db.member.upsert({
      where: { workspaceId_email: { workspaceId: ctx.workspaceId, email: app.email } },
      create: {
        workspaceId: ctx.workspaceId,
        clerkUserId: `mcp:${app.id}`,
        email: app.email,
        firstName,
        lastName,
        phone: app.phone ?? undefined,
        status: MemberStatus.APPROVED,
        approved: true,
        approvedAt: now,
        memberQrCode,
      },
      update: {
        status: MemberStatus.APPROVED,
        approved: true,
        approvedAt: now,
        memberQrCode: { set: memberQrCode },
      },
    }),
  ]);

  // Person spine (Phase 2A): attach the approved human to a Person. The typed
  // application email is UNVERIFIED — resolvePerson never links it to an
  // existing Person; a collision mints a flagged potential duplicate instead.
  // Non-fatal: approval must never fail on spine bookkeeping.
  try {
    if (!member.personId) {
      const person = await resolvePerson({
        workspaceId: ctx.workspaceId,
        email: app.email,
        emailVerified: false,
        phone: app.phone,
        firstName,
        lastName,
        source: 'application',
        sourceExternalId: app.id,
      });
      await db.member.update({ where: { id: member.id }, data: { personId: person.id } });
      if (!app.personId) {
        await db.application.update({ where: { id: app.id }, data: { personId: person.id } });
      }
    } else if (!app.personId) {
      await db.application.update({
        where: { id: app.id },
        data: { personId: member.personId },
      });
    }
  } catch (err) {
    console.error('[mcp.approveApplication] person spine attach failed:', err);
  }

  await emitEvent({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    actorType: 'AGENT',
    action: 'application.approved',
    entityType: 'APPLICATION',
    entityId: applicationId,
    metadata: { memberId: member.id, via: 'mcp', note: note ?? null },
  });

  if (!existingMember) {
    await emitEvent({
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      actorType: 'AGENT',
      action: 'member.created',
      entityType: 'MEMBER',
      entityId: member.id,
      metadata: { applicationId, email: app.email, via: 'mcp' },
    });
  }

  return { application: updatedApp, member };
}

async function setApplicationStatus(
  ctx: McpContext,
  applicationId: string,
  status: ApplicationStatus,
  action: string,
  extra: { reason?: string; note?: string },
) {
  const app = await db.application.findFirst({
    where: { id: applicationId, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!app) throw new Error('Application not found or not in this workspace');

  const updated = await db.application.update({
    where: { id: applicationId },
    data: {
      status,
      reviewedAt: new Date(),
      reviewedBy: ctx.userId,
      rejectionReason: extra.reason ?? null,
      reviewNote: extra.note ?? null,
    },
  });

  await emitEvent({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    actorType: 'AGENT',
    action,
    entityType: 'APPLICATION',
    entityId: applicationId,
    metadata: { reason: extra.reason ?? null, via: 'mcp' },
  });

  return updated;
}

export const applicationTools: McpTool[] = [
  {
    name: 'nobc_get_applications',
    minRole: OperatorRole.READ_ONLY,
    description:
      'List applications. Filter by status (PENDING | APPROVED | REJECTED | HOLD | WAITLISTED | DECLINED | all; default PENDING). Returns id, applicantName, email, status, aiScore, archetype, submittedAt.',
    inputSchema: getApplicationsSchema,
    handler: async (ctx, rawArgs) => {
      const args = getApplicationsSchema.parse(rawArgs);
      const take = args.limit ?? 50;
      const skip = args.offset ?? 0;
      const status = args.status ?? 'PENDING';

      const where = {
        workspaceId: ctx.workspaceId,
        ...(status === 'all' ? {} : { status: status as ApplicationStatus }),
      };

      const [apps, total] = await Promise.all([
        db.application.findMany({
          where,
          select: {
            id: true,
            fullName: true,
            email: true,
            status: true,
            aiScore: true,
            aiRecommendation: true,
            archetype: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take,
          skip,
        }),
        db.application.count({ where }),
      ]);

      return {
        applications: apps.map((a) => ({
          id: a.id,
          applicantName: a.fullName,
          email: a.email,
          status: a.status,
          aiScore: a.aiScore,
          aiRecommendation: a.aiRecommendation,
          archetype: a.archetype,
          submittedAt: a.createdAt,
        })),
        total,
        limit: take,
        offset: skip,
      };
    },
  },
  {
    name: 'nobc_get_application',
    minRole: OperatorRole.READ_ONLY,
    description: 'Get a single application by id, including all question answers and AI scoring.',
    inputSchema: getApplicationSchema,
    handler: async (ctx, rawArgs) => {
      const args = getApplicationSchema.parse(rawArgs);
      const app = await db.application.findFirst({
        where: { id: args.id, workspaceId: ctx.workspaceId },
        include: { answers: true },
      });
      return app ?? { found: false };
    },
  },
  {
    name: 'nobc_approve_application',
    description:
      'Approve an application: marks it APPROVED, upserts the member record, and logs audit events. Destructive — gate behind operator confirmation.',
    inputSchema: approveSchema,
    destructive: true,
    handler: async (ctx, rawArgs) => {
      const args = approveSchema.parse(rawArgs);
      return approveApplication(ctx, args.applicationId, args.note);
    },
  },
  {
    name: 'nobc_reject_application',
    description:
      'Reject an application (status REJECTED) with an optional reason. Destructive — gate behind operator confirmation.',
    inputSchema: rejectSchema,
    destructive: true,
    handler: async (ctx, rawArgs) => {
      const args = rejectSchema.parse(rawArgs);
      return setApplicationStatus(ctx, args.applicationId, 'REJECTED', 'application.rejected', {
        reason: args.reason,
        note: args.note,
      });
    },
  },
  {
    name: 'nobc_waitlist_application',
    description: 'Move an application to the WAITLISTED status. Logs an audit event.',
    inputSchema: waitlistSchema,
    destructive: true,
    handler: async (ctx, rawArgs) => {
      const args = waitlistSchema.parse(rawArgs);
      return setApplicationStatus(ctx, args.applicationId, 'WAITLISTED', 'application.waitlisted', {
        note: args.note,
      });
    },
  },
];

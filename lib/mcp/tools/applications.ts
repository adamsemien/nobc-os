import { z } from 'zod';
import { OperatorRole, type ApplicationStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { emitEvent } from '@/lib/emit-event';
import { approveApplication as approveApplicationCanonical } from '@/lib/applications/approve';
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

/** Thin MCP adapter over THE canonical approve path (lib/applications/approve.ts)
 *  — also used by the legacy `approve_application` alias. The duplicated local
 *  implementation is deleted: MCP now shares the exact code path the operator
 *  API route and the agent tool run (member resolution + in-place promotion,
 *  Person spine, consent sync, Door 1 comp confirm, wallet pass, welcome
 *  email, audit events). */
export async function approveApplication(ctx: McpContext, applicationId: string, note?: string) {
  const outcome = await approveApplicationCanonical({
    applicationId,
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    actorType: 'AGENT',
    reviewNote: note,
  });
  if (!outcome.ok) {
    if (outcome.error === 'already_approved') throw new Error('Already approved');
    if (outcome.error === 'not_submitted') {
      // Hard block, no override: approving a never-submitted draft requires a
      // human clicking "Approve anyway" in the operator UI, not an agent call.
      throw new Error(
        'This application was never submitted (draft only) - approve it from the operator UI if intended',
      );
    }
    throw new Error('Application not found or not in this workspace');
  }
  return { application: outcome.application, member: outcome.member };
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

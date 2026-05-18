import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { emitEvent } from '@/lib/emit-event';
import { MemberStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { mcpMetrics, runMetric } from '@/lib/intelligence';
import type { MetricFilters } from '@/lib/intelligence';
import { composeInsight } from '@/lib/intelligence/composer';

// Lightweight MCP-style tool dispatcher for the NoBC OS operator agent.
// Exposes a fixed set of read + critical write tools over a simple JSON-RPC-like interface.
// Full MCP SDK streaming transport is deferred to V1.5; this handles the V1 tool call surface.

type ToolCall = {
  tool: string;
  args: Record<string, unknown>;
};

type ToolHandler = {
  description: string;
  handler: (workspaceId: string, args: Record<string, unknown>, userId: string) => Promise<unknown>;
};

const TOOLS = {
  list_members: {
    description: 'List approved members in the workspace',
    handler: async (workspaceId: string, args: Record<string, unknown>) => {
      const limit = Math.min(Number(args.limit ?? 50), 100);
      return db.member.findMany({
        where: { workspaceId, approved: true },
        select: { id: true, firstName: true, lastName: true, email: true, tags: true, totalEventsAttended: true, approvedAt: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    },
  },
  get_member: {
    description: 'Get a single member by ID or email',
    handler: async (workspaceId: string, args: Record<string, unknown>) => {
      const where = args.email
        ? { workspaceId_email: { workspaceId, email: String(args.email) } }
        : { id: String(args.id) };
      return db.member.findUnique({ where });
    },
  },
  list_events: {
    description: 'List upcoming published events',
    handler: async (workspaceId: string) => {
      return db.event.findMany({
        where: { workspaceId, status: 'PUBLISHED', startAt: { gte: new Date() } },
        select: { id: true, slug: true, title: true, startAt: true, capacity: true, accessMode: true, _count: { select: { rsvps: true } } },
        orderBy: { startAt: 'asc' },
        take: 20,
      });
    },
  },
  get_event: {
    description: 'Get event details and RSVP count',
    handler: async (workspaceId: string, args: Record<string, unknown>) => {
      return db.event.findFirst({
        where: { workspaceId, id: String(args.id) },
        include: { _count: { select: { rsvps: true } } },
      });
    },
  },
  list_rsvps: {
    description: 'List RSVPs for an event',
    handler: async (workspaceId: string, args: Record<string, unknown>) => {
      return db.rSVP.findMany({
        where: { workspaceId, eventId: String(args.eventId) },
        select: {
          id: true, ticketStatus: true, checkedIn: true, checkedInAt: true,
          member: { select: { firstName: true, lastName: true, email: true } },
        },
      });
    },
  },
  list_applications: {
    description: 'List pending applications',
    handler: async (workspaceId: string, args: Record<string, unknown>) => {
      const status = String(args.status ?? 'PENDING');
      return db.application.findMany({
        where: { workspaceId, status: status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'HOLD' },
        select: { id: true, fullName: true, email: true, status: true, aiRecommendation: true, aiScore: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    },
  },
  get_application: {
    description: 'Get a single application by ID',
    handler: async (workspaceId: string, args: Record<string, unknown>) => {
      return db.application.findFirst({
        where: { workspaceId, id: String(args.id) },
        include: { answers: true },
      });
    },
  },
  // Write tools
  add_to_red_list: {
    description: 'Add an email to the workspace red list',
    handler: async (workspaceId: string, args: Record<string, unknown>) => {
      return db.redList.create({
        data: {
          workspaceId,
          email: String(args.email),
          reason: args.reason ? String(args.reason) : undefined,
        },
      });
    },
  },

  // ── New tools (Task 5) ────────────────────────────────────────────────

  get_rsvp: {
    description: 'Get a single RSVP with payment status, member, and event details',
    handler: async (workspaceId: string, args: Record<string, unknown>) => {
      return db.rSVP.findFirst({
        where: { workspaceId, id: String(args.rsvpId) },
        include: {
          member: { select: { id: true, firstName: true, lastName: true, email: true } },
          event: { select: { id: true, title: true, slug: true, startAt: true } },
        },
      });
    },
  },

  approve_application: {
    description: 'Approve an application, create/update the member record, and log an audit event',
    handler: async (workspaceId: string, args: Record<string, unknown>, userId: string) => {
      const id = String(args.applicationId);
      const note = args.note ? String(args.note) : undefined;

      const app = await db.application.findFirst({ where: { id, workspaceId } });
      if (!app) throw new Error('Application not found or not in this workspace');
      if (app.status === 'APPROVED') throw new Error('Already approved');

      const memberQrCode = randomBytes(8).toString('hex');
      const now = new Date();
      const [firstName, ...rest] = app.fullName.trim().split(' ');
      const lastName = rest.join(' ') || '';

      const existingMember = await db.member.findUnique({
        where: { workspaceId_email: { workspaceId, email: app.email } },
        select: { id: true },
      });

      const [updatedApp, member] = await db.$transaction([
        db.application.update({
          where: { id },
          data: { status: 'APPROVED', reviewedAt: now, reviewedBy: userId, reviewNote: note ?? null },
        }),
        db.member.upsert({
          where: { workspaceId_email: { workspaceId, email: app.email } },
          create: {
            workspaceId,
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

      await emitEvent({
        workspaceId,
        actorId: userId,
        action: 'application.approved',
        entityType: 'APPLICATION',
        entityId: id,
        metadata: { memberId: member.id, via: 'mcp', note: note ?? null },
      });

      if (!existingMember) {
        await emitEvent({
          workspaceId,
          actorId: userId,
          action: 'member.created',
          entityType: 'MEMBER',
          entityId: member.id,
          metadata: { applicationId: id, email: app.email, via: 'mcp' },
        });
      }

      return { application: updatedApp, member };
    },
  },

  reject_application: {
    description: 'Reject an application and log an audit event',
    handler: async (workspaceId: string, args: Record<string, unknown>, userId: string) => {
      const id = String(args.applicationId);
      const note = args.note ? String(args.note) : undefined;
      const reason = args.reason ? String(args.reason) : undefined;

      const app = await db.application.findFirst({ where: { id, workspaceId } });
      if (!app) throw new Error('Application not found or not in this workspace');

      const updatedApp = await db.application.update({
        where: { id },
        data: {
          status: 'REJECTED',
          reviewedAt: new Date(),
          reviewedBy: userId,
          rejectionReason: reason ?? null,
          reviewNote: note ?? null,
        },
      });

      await emitEvent({
        workspaceId,
        actorId: userId,
        action: 'application.rejected',
        entityType: 'APPLICATION',
        entityId: id,
        metadata: { reason: reason ?? null, via: 'mcp' },
      });

      return updatedApp;
    },
  },

  create_event: {
    description: 'Create a new draft event in the workspace',
    handler: async (workspaceId: string, args: Record<string, unknown>, userId: string) => {
      const title = String(args.title ?? 'Untitled Event');
      const slug = String(args.slug ?? title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
      const startAt = args.startAt ? new Date(String(args.startAt)) : new Date();

      const event = await db.event.create({
        data: {
          workspaceId,
          title,
          slug,
          startAt,
          endAt: args.endAt ? new Date(String(args.endAt)) : null,
          location: args.location ? String(args.location) : null,
          description: args.description ? String(args.description) : null,
          capacity: args.capacity ? Number(args.capacity) : null,
          status: 'DRAFT',
        },
      });

      await emitEvent({
        workspaceId,
        actorId: userId,
        action: 'event.created',
        entityType: 'EVENT',
        entityId: event.id,
        metadata: { title, via: 'mcp' },
      });

      return event;
    },
  },

  publish_event: {
    description: 'Set an event status to PUBLISHED',
    handler: async (workspaceId: string, args: Record<string, unknown>, userId: string) => {
      const eventId = String(args.eventId);
      const existing = await db.event.findFirst({ where: { id: eventId, workspaceId } });
      if (!existing) throw new Error('Event not found or not in this workspace');

      const updated = await db.event.update({ where: { id: eventId }, data: { status: 'PUBLISHED' } });

      await emitEvent({
        workspaceId,
        actorId: userId,
        action: 'event.published',
        entityType: 'EVENT',
        entityId: eventId,
        metadata: { previousStatus: existing.status, via: 'mcp' },
      });

      return updated;
    },
  },

  cancel_event: {
    description: 'Set an event status to CANCELLED',
    handler: async (workspaceId: string, args: Record<string, unknown>, userId: string) => {
      const eventId = String(args.eventId);
      const existing = await db.event.findFirst({ where: { id: eventId, workspaceId } });
      if (!existing) throw new Error('Event not found or not in this workspace');

      const updated = await db.event.update({ where: { id: eventId }, data: { status: 'CANCELLED' } });

      await emitEvent({
        workspaceId,
        actorId: userId,
        action: 'event.cancelled',
        entityType: 'EVENT',
        entityId: eventId,
        metadata: { previousStatus: existing.status, via: 'mcp' },
      });

      return updated;
    },
  },

  issue_comp_ticket: {
    description: 'Issue a complimentary RSVP to an attendee by email',
    handler: async (workspaceId: string, args: Record<string, unknown>, userId: string) => {
      const eventId = String(args.eventId);
      const email = String(args.email);
      const firstName = String(args.firstName ?? '');
      const lastName = String(args.lastName ?? '');
      const compType = args.compType ? String(args.compType) : 'comp';

      const event = await db.event.findFirst({ where: { id: eventId, workspaceId } });
      if (!event) throw new Error('Event not found or not in this workspace');

      // Find or create a guest member record
      let member = await db.member.findUnique({
        where: { workspaceId_email: { workspaceId, email } },
        select: { id: true },
      });
      if (!member) {
        member = await db.member.create({
          data: {
            workspaceId,
            clerkUserId: `comp:${email}`,
            email,
            firstName,
            lastName,
            status: MemberStatus.GUEST,
            memberQrCode: randomBytes(8).toString('hex'),
          },
          select: { id: true },
        });

        await emitEvent({
          workspaceId,
          actorId: userId,
          action: 'member.created',
          entityType: 'MEMBER',
          entityId: member.id,
          metadata: { email, via: 'mcp_comp' },
        });
      }

      const existing = await db.rSVP.findFirst({
        where: { workspaceId, eventId, memberId: member.id },
        select: { id: true, ticketStatus: true },
      });
      if (existing && (existing.ticketStatus === 'confirmed' || existing.ticketStatus === 'comp')) {
        return { rsvp: existing, alreadyExists: true };
      }

      const rsvp = await db.rSVP.upsert({
        where: { workspaceId_eventId_memberId: { workspaceId, eventId, memberId: member.id } },
        create: {
          workspaceId,
          eventId,
          memberId: member.id,
          status: 'CONFIRMED',
          ticketStatus: 'confirmed',
          isComp: true,
          compType,
          origin: 'mcp_comp',
        },
        update: {
          status: 'CONFIRMED',
          ticketStatus: 'confirmed',
          isComp: true,
          compType,
        },
      });

      await emitEvent({
        workspaceId,
        actorId: userId,
        action: 'rsvp.created',
        entityType: 'RSVP',
        entityId: rsvp.id,
        metadata: { isComp: true, compType, email, via: 'mcp' },
      });

      return { rsvp, alreadyExists: false };
    },
  },

  promote_from_waitlist: {
    description: 'Promote a waitlisted RSVP to confirmed',
    handler: async (workspaceId: string, args: Record<string, unknown>, userId: string) => {
      const rsvpId = String(args.rsvpId);

      const rsvp = await db.rSVP.findFirst({
        where: { id: rsvpId, workspaceId },
        select: { id: true, ticketStatus: true, eventId: true, memberId: true },
      });
      if (!rsvp) throw new Error('RSVP not found or not in this workspace');
      if (rsvp.ticketStatus !== 'waitlisted' && rsvp.ticketStatus !== 'pending_approval') {
        throw new Error(`RSVP is not on the waitlist (current status: ${rsvp.ticketStatus})`);
      }

      const updated = await db.rSVP.update({
        where: { id: rsvpId },
        data: { status: 'CONFIRMED', ticketStatus: 'confirmed' },
      });

      await emitEvent({
        workspaceId,
        actorId: userId,
        action: 'rsvp.confirmed',
        entityType: 'RSVP',
        entityId: rsvpId,
        metadata: { promotedFromWaitlist: true, eventId: rsvp.eventId, via: 'mcp' },
      });

      return updated;
    },
  },
};

/** Auto-registers every mcpExposed metric in the Intelligence registry as an
 *  MCP tool `intelligence.{metric.id}`. No per-tool boilerplate — adding a
 *  metric file makes it callable by the agent for free. */
function intelligenceTools(): Record<string, ToolHandler> {
  const out: Record<string, ToolHandler> = {};
  for (const metric of mcpMetrics()) {
    out[`intelligence.${metric.id}`] = {
      description: `${metric.name} — ${metric.businessQuestion}`,
      handler: async (workspaceId: string, args: Record<string, unknown>) => {
        const dr = args.dateRange as { from?: string; to?: string } | undefined;
        return runMetric(metric.id, {
          workspaceId,
          dateRange:
            dr?.from && dr?.to ? { from: new Date(dr.from), to: new Date(dr.to) } : undefined,
          filters: (args.filters as MetricFilters | undefined) ?? undefined,
          comparePeriod: 'previous',
        });
      },
    };
  }
  out['intelligence.compose'] = {
    description: 'Compose a custom insight — a natural-language question becomes selected metrics plus a synthesized narrative',
    handler: async (workspaceId: string, args: Record<string, unknown>) => {
      const dr = args.dateRange as { from?: string; to?: string } | undefined;
      return composeInsight(String(args.question ?? ''), {
        workspaceId,
        dateRange: dr?.from && dr?.to ? { from: new Date(dr.from), to: new Date(dr.to) } : undefined,
        filters: (args.filters as MetricFilters | undefined) ?? undefined,
        comparePeriod: 'previous',
      });
    },
  };
  return out;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);

  let body: ToolCall;
  try {
    body = (await req.json()) as ToolCall;
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { tool, args = {} } = body;
  const allTools = { ...TOOLS, ...intelligenceTools() } as Record<string, ToolHandler>;
  const handler = allTools[tool];
  if (!handler) {
    return NextResponse.json(
      { error: `Unknown tool: ${tool}`, available: Object.keys(allTools) },
      { status: 400 },
    );
  }

  try {
    const result = await handler.handler(workspaceId, args, userId);
    return NextResponse.json({ result });
  } catch (err) {
    console.error('[mcp] tool error:', err);
    return NextResponse.json({ error: 'Tool execution failed', detail: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

// Expose tool manifest — static tools plus auto-registered intelligence.* tools
export async function GET() {
  const all = { ...TOOLS, ...intelligenceTools() } as Record<string, ToolHandler>;
  const tools = Object.entries(all).map(([name, t]) => ({ name, description: t.description }));
  return NextResponse.json({ tools });
}

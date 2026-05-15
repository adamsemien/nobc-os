import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

// Lightweight MCP-style tool dispatcher for the NoBC OS operator agent.
// Exposes a fixed set of read + critical write tools over a simple JSON-RPC-like interface.
// Full MCP SDK streaming transport is deferred to V1.5; this handles the V1 tool call surface.

type ToolCall = {
  tool: string;
  args: Record<string, unknown>;
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
};

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
  const handler = TOOLS[tool as keyof typeof TOOLS];
  if (!handler) {
    return NextResponse.json(
      { error: `Unknown tool: ${tool}`, available: Object.keys(TOOLS) },
      { status: 400 },
    );
  }

  try {
    const result = await handler.handler(workspaceId, args);
    return NextResponse.json({ result });
  } catch (err) {
    console.error('[mcp] tool error:', err);
    return NextResponse.json({ error: 'Tool execution failed' }, { status: 500 });
  }
}

// Expose tool manifest
export async function GET() {
  const tools = Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description }));
  return NextResponse.json({ tools });
}

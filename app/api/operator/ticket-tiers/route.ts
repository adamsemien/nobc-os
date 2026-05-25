import { auth } from '@clerk/nextjs/server';
import { OperatorRole } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceId } from '@/lib/auth';
import { requireRole } from '@/lib/operator-role';
import {
  createTicketTier,
  listTicketTiers,
  TicketingError,
  ticketingErrorStatus,
} from '@/lib/ticketing/tiers';
import { CreateTierSchema, toCreateTierInput } from '@/lib/ticketing/tier-schema';

/** GET /api/operator/ticket-tiers?eventId=… | ?seriesId=… — list tiers in scope. */
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);
  const eventId = req.nextUrl.searchParams.get('eventId') ?? undefined;
  const seriesId = req.nextUrl.searchParams.get('seriesId') ?? undefined;

  try {
    const tiers = await listTicketTiers(workspaceId, { eventId, seriesId });
    return NextResponse.json({ tiers });
  } catch (err) {
    if (err instanceof TicketingError) {
      return NextResponse.json({ error: err.message }, { status: ticketingErrorStatus(err.code) });
    }
    throw err;
  }
}

/** POST /api/operator/ticket-tiers — create a tier (XOR-scoped to event or series). */
export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const parsed = CreateTierSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  try {
    const tier = await createTicketTier(workspaceId, userId, toCreateTierInput(parsed.data));
    return NextResponse.json({ tier }, { status: 201 });
  } catch (err) {
    if (err instanceof TicketingError) {
      return NextResponse.json({ error: err.message }, { status: ticketingErrorStatus(err.code) });
    }
    throw err;
  }
}

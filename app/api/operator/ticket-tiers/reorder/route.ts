import { OperatorRole } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/operator-role';
import { reorderTicketTiers, TicketingError, ticketingErrorStatus } from '@/lib/ticketing/tiers';
import { ReorderTiersSchema } from '@/lib/ticketing/tier-schema';

/** POST /api/operator/ticket-tiers/reorder — rewrite sortOrder to match tierIds order. */
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

  const parsed = ReorderTiersSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  try {
    const tiers = await reorderTicketTiers(workspaceId, userId, parsed.data.tierIds);
    return NextResponse.json({ tiers });
  } catch (err) {
    if (err instanceof TicketingError) {
      return NextResponse.json({ error: err.message }, { status: ticketingErrorStatus(err.code) });
    }
    throw err;
  }
}

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceId } from '@/lib/auth';
import { reorderTicketTiers, TicketingError, ticketingErrorStatus } from '@/lib/ticketing/tiers';
import { ReorderTiersSchema } from '@/lib/ticketing/tier-schema';

/** POST /api/operator/ticket-tiers/reorder — rewrite sortOrder to match tierIds order. */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);

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

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceId } from '@/lib/auth';
import {
  closeTicketTier,
  updateTicketTier,
  TicketingError,
  ticketingErrorStatus,
} from '@/lib/ticketing/tiers';
import { UpdateTierSchema, toUpdateTierInput } from '@/lib/ticketing/tier-schema';

/** PATCH /api/operator/ticket-tiers/[id] — update a tier (scope is immutable). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const parsed = UpdateTierSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  try {
    const tier = await updateTicketTier(workspaceId, userId, id, toUpdateTierInput(parsed.data));
    return NextResponse.json({ tier });
  } catch (err) {
    if (err instanceof TicketingError) {
      return NextResponse.json({ error: err.message }, { status: ticketingErrorStatus(err.code) });
    }
    throw err;
  }
}

/** DELETE /api/operator/ticket-tiers/[id] — soft-close a tier (manuallyClosed). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);
  const { id } = await params;

  try {
    const tier = await closeTicketTier(workspaceId, userId, id);
    return NextResponse.json({ tier });
  } catch (err) {
    if (err instanceof TicketingError) {
      return NextResponse.json({ error: err.message }, { status: ticketingErrorStatus(err.code) });
    }
    throw err;
  }
}

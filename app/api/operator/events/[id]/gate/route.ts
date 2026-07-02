/** Operator gate CRUD for an event (Stage 17, M3 Builder).
 *
 *  GET    -> the event's gate + materialized tree (read: any resolved operator)
 *  PUT    -> create-or-update the gate from an authoring spec (STAFF)
 *  DELETE -> remove the gate (STAFF; nodes + sessions cascade, proofs detach)
 *
 *  PUT is the Builder's save path. The engine's updateGate is an id-stable
 *  diff, so specs round-trip node ids: kept nodes keep their proofs, removed
 *  nodes lose theirs. Validation failures return 422 with the validator's
 *  error strings (operator-facing copy - guests never see this surface).
 */
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { requireRole } from '@/lib/operator-role';
import { GateAuthoringError, getGateEngine } from '@/lib/gate-engine';
import type { GateNodeSpec } from '@/lib/gate-engine';

const ConditionSpecSchema = z.object({
  kind: z.literal('CONDITION'),
  id: z.string().optional(),
  conditionType: z.string().min(1),
  config: z.unknown().optional(),
  required: z.boolean().optional(),
  weight: z.number().int().optional(),
});

type GroupSpecInput = z.infer<typeof ConditionSpecSchema> | {
  kind: 'GROUP';
  id?: string;
  rule: 'ALL' | 'ANY_N' | 'WEIGHTED';
  requiredCount?: number;
  weightThreshold?: number;
  required?: boolean;
  weight?: number;
  children: GroupSpecInput[];
};

const NodeSpecSchema: z.ZodType<GroupSpecInput> = z.lazy(() =>
  z.union([
    ConditionSpecSchema,
    z.object({
      kind: z.literal('GROUP'),
      id: z.string().optional(),
      rule: z.enum(['ALL', 'ANY_N', 'WEIGHTED']),
      requiredCount: z.number().int().optional(),
      weightThreshold: z.number().int().optional(),
      required: z.boolean().optional(),
      weight: z.number().int().optional(),
      children: z.array(NodeSpecSchema),
    }),
  ]),
);

const PutSchema = z.object({
  name: z.string().max(200).nullable().optional(),
  spec: NodeSpecSchema,
});

async function findEvent(workspaceId: string, eventId: string) {
  return db.event.findFirst({
    where: { id: eventId, workspaceId },
    select: { id: true },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await requireWorkspaceId(userId);
  const { id } = await params;

  const event = await findEvent(workspaceId, id);
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const gate = await getGateEngine().getGateForResource({
    workspaceId,
    resource: { type: 'EVENT', id },
  });
  return NextResponse.json({ gate });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gateCheck = await requireRole(OperatorRole.STAFF);
  if (!gateCheck.ok) return gateCheck.response;
  const { workspaceId } = gateCheck;
  const { id } = await params;

  const event = await findEvent(workspaceId, id);
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: z.infer<typeof PutSchema>;
  try {
    body = PutSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const spec = body.spec as GateNodeSpec;

  const engine = getGateEngine();
  try {
    const existing = await engine.getGateForResource({
      workspaceId,
      resource: { type: 'EVENT', id },
    });
    if (existing) {
      await engine.updateGate({
        workspaceId,
        gateId: existing.gateId,
        name: body.name,
        spec,
      });
    } else {
      await engine.createGate({
        workspaceId,
        resource: { type: 'EVENT', id },
        name: body.name ?? undefined,
        spec,
      });
    }
  } catch (err) {
    if (err instanceof GateAuthoringError) {
      return NextResponse.json({ errors: err.errors }, { status: 422 });
    }
    console.error('[operator/gate] save failed', {
      eventId: id,
      workspaceId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Could not save the gate' }, { status: 500 });
  }

  // Reload so the Builder gets fresh node ids in the same round trip.
  const gate = await engine.getGateForResource({
    workspaceId,
    resource: { type: 'EVENT', id },
  });
  return NextResponse.json({ gate });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gateCheck = await requireRole(OperatorRole.STAFF);
  if (!gateCheck.ok) return gateCheck.response;
  const { workspaceId } = gateCheck;
  const { id } = await params;

  const engine = getGateEngine();
  const existing = await engine.getGateForResource({
    workspaceId,
    resource: { type: 'EVENT', id },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await engine.deleteGate({ workspaceId, gateId: existing.gateId });
  return NextResponse.json({ deleted: true });
}

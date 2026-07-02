/** Gate access links for an event (Stage 17, M3 Builder).
 *
 *  POST -> mint a shareable /gate/[token] link for the event's gate (STAFF).
 *  GET  -> recent traversals: who opened a link, whether they identified,
 *          and whether the gate opened for them (read: any resolved operator).
 *
 *  Raw GateSessionStatus values ride the operator wire (same convention as
 *  event.status); the Builder UI maps them to display copy before rendering.
 */
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { requireRole } from '@/lib/operator-role';
import { getGateEngine } from '@/lib/gate-engine';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await requireWorkspaceId(userId);
  const { id } = await params;

  const gate = await getGateEngine().getGateForResource({
    workspaceId,
    resource: { type: 'EVENT', id },
  });
  if (!gate) return NextResponse.json({ sessions: [] });

  const rows = await db.gateSession.findMany({
    where: { workspaceId, gateId: gate.gateId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      token: true,
      status: true,
      createdAt: true,
      member: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  return NextResponse.json({
    sessions: rows.map((row) => ({
      id: row.id,
      token: row.token,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      member: row.member
        ? {
            name: `${row.member.firstName} ${row.member.lastName}`.trim(),
            email: row.member.email,
          }
        : null,
    })),
  });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gateCheck = await requireRole(OperatorRole.STAFF);
  if (!gateCheck.ok) return gateCheck.response;
  const { workspaceId } = gateCheck;
  const { id } = await params;

  const engine = getGateEngine();
  const gate = await engine.getGateForResource({
    workspaceId,
    resource: { type: 'EVENT', id },
  });
  if (!gate) {
    return NextResponse.json({ error: 'This event has no gate yet' }, { status: 404 });
  }

  const session = await engine.createSession({ workspaceId, gateId: gate.gateId });
  return NextResponse.json({ token: session.token, path: `/gate/${session.token}` });
}

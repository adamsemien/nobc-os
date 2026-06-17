import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { OperatorRole, Prisma } from '@prisma/client';

// Sponsor CRUD. Reads are STAFF, writes are ADMIN. workspaceId always comes from
// the auth gate, never from the URL or client body (workspace scoping is the
// security boundary). website/logoUrl from the original brief do not exist on
// SponsorBrandProfile and are intentionally omitted; logoAssetId is an Asset FK,
// not a URL, so it is not exposed here.
const CreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  contactEmail: z.string().trim().email('Valid email required').optional().nullable(),
  declaredObjectives: z.string().trim().optional().nullable(),
  // Structured persona Json — the slide-over sends { notes }, the recap editor sends
  // the full { archetypes, industries, ... }. parsePersona tolerates any object.
  targetPersonaCriteria: z.record(z.string(), z.unknown()).optional().nullable(),
  rightsFeeCents: z.number().int().nonnegative().optional().nullable(),
  icp: z.string().trim().optional().nullable(),
});

export async function GET() {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  const sponsors = await db.sponsorBrandProfile.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(sponsors);
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.ADMIN);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
  }
  const d = parsed.data;

  const sponsor = await db.sponsorBrandProfile.create({
    data: {
      workspaceId,
      name: d.name,
      contactEmail: d.contactEmail ?? null,
      declaredObjectives: d.declaredObjectives ?? null,
      targetPersonaCriteria: d.targetPersonaCriteria
        ? (d.targetPersonaCriteria as Prisma.InputJsonValue)
        : undefined,
      rightsFeeCents: d.rightsFeeCents ?? null,
      icp: d.icp ?? null,
    },
  });
  return NextResponse.json(sponsor, { status: 201 });
}

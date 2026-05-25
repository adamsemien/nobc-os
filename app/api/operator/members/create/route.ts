import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { MemberStatus, OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { generateMemberQrCode } from '@/lib/member-qr';
import { emitEvent } from '@/lib/emit-event';

// Manual member creation can only set these three statuses from the operator UI.
const ALLOWED_STATUSES: MemberStatus[] = [
  MemberStatus.APPROVED,
  MemberStatus.GUEST,
  MemberStatus.PENDING,
];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Manual member creation is a STAFF+ action (READ_ONLY operators cannot write).
export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
  const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const phone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null;
  const aiSummary =
    typeof body.aiSummary === 'string' && body.aiSummary.trim() ? body.aiSummary.trim() : null;
  const status: MemberStatus = ALLOWED_STATUSES.includes(body.status)
    ? body.status
    : MemberStatus.GUEST;
  const tags: string[] = Array.isArray(body.tags)
    ? Array.from(
        new Set(
          (body.tags as unknown[]).map((t) => String(t).trim()).filter((t): t is string => !!t),
        ),
      )
    : [];

  if (!firstName || !lastName || !email) {
    return NextResponse.json(
      { error: 'First name, last name, and email are required.' },
      { status: 400 },
    );
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  // Duplicate check within this workspace (matches the @@unique([workspaceId, email]) constraint).
  const existing = await db.member.findUnique({
    where: { workspaceId_email: { workspaceId, email } },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: 'A member with this email already exists' },
      { status: 409 },
    );
  }

  const isApproved = status === MemberStatus.APPROVED;
  const member = await db.member.create({
    data: {
      workspaceId,
      // No Clerk account for a manually-added member; mint a synthetic, unique id
      // (the approval path uses the same pattern with `applicant:<id>`).
      clerkUserId: `manual:${randomUUID()}`,
      email,
      firstName,
      lastName,
      phone,
      status,
      tags,
      aiSummary,
      // Every member-creation path must mint a QR via this helper (see lib/member-qr.ts).
      memberQrCode: generateMemberQrCode(),
      approved: isApproved,
      approvedAt: isApproved ? new Date() : null,
    },
  });

  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'member.created',
    entityType: 'MEMBER',
    entityId: member.id,
    metadata: { email, status, source: 'manual' },
  });

  return NextResponse.json(
    {
      member: {
        id: member.id,
        firstName: member.firstName,
        lastName: member.lastName,
        fullName: `${member.firstName} ${member.lastName}`.trim() || member.email,
        email: member.email,
        status: member.status,
        createdAt: member.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}

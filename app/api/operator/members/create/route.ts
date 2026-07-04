import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { MemberStatus, OperatorRole, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { generateMemberQrCode } from '@/lib/member-qr';
import { emitEvent } from '@/lib/emit-event';
import { syncMemberChannelConsent } from '@/lib/comms/consent-sync';

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
  // Optional referrer — the self-referential member-to-member spine (Member.referredByMemberId).
  const referredByMemberId =
    typeof body.referredByMemberId === 'string' && body.referredByMemberId.trim()
      ? body.referredByMemberId.trim()
      : null;
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

  // Validate the referrer is a real member in THIS workspace (workspace scoping is the
  // security boundary) before linking the self-relation.
  if (referredByMemberId) {
    const referrer = await db.member.findFirst({
      where: { id: referredByMemberId, workspaceId },
      select: { id: true },
    });
    if (!referrer) {
      return NextResponse.json({ error: 'Referrer not found in this workspace.' }, { status: 400 });
    }
  }

  // Stamp provenance on every operator-filled field (manual create = operator_entered,
  // confidence 1). Same record shape the PATCH write-path stamps.
  const syncedAt = new Date().toISOString();
  const stamp = (value: unknown) => ({ value, source: 'operator_entered', confidence: 1, syncedAt });
  const fieldProvenance: Record<string, unknown> = {
    firstName: stamp(firstName),
    lastName: stamp(lastName),
    email: stamp(email),
    ...(phone ? { phone: stamp(phone) } : {}),
    ...(referredByMemberId ? { referredBy: stamp(referredByMemberId) } : {}),
    ...(aiSummary ? { aiSummary: stamp(aiSummary) } : {}),
  };

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
      referredByMemberId,
      fieldProvenance: fieldProvenance as Prisma.InputJsonValue,
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
    metadata: { email, status, source: 'manual', note: 'Added manually by operator.' },
  });

  // Consent floor (CRM substrate, Phase 1): seed ChannelSubscription rows. Manual
  // create captures no marketing consent today, so this yields PENDING rows (honest);
  // an explicit operator-asserts-consent action (OPERATOR_ADDED) can elevate later.
  void syncMemberChannelConsent({ workspaceId, memberId: member.id, context: 'operator_manual' });

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

import { NextRequest, NextResponse, after } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { ApplySchema, answerQuestions } from '@/lib/apply-config';
import { tagApplication } from '@/lib/ai/tag-application';
import { attachEventRsvpAfterApply } from '@/lib/apply-event-rsvp';
import { resolveMember } from '@/lib/member-identity';
import { emitEvent } from '@/lib/emit-event';
import { structuredConsentWrites, getConsentIp } from '@/lib/apply-consent';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Invalid request.' },
      { status: 400 },
    );
  }

  const parsed = ApplySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { status: 'error', message: 'Please fill in all required fields.' },
      { status: 400 },
    );
  }
  const data = parsed.data as {
    email: string;
    phone?: string;
    city?: string;
    referredBy?: string;
    consentEmail?: boolean;
    consentSms?: boolean;
    rsvpEventId?: string;
    [key: string]: unknown;
  };
  const email = data.email;

  const workspace = await db.workspace.findUnique({ where: { slug } });
  if (!workspace) {
    return NextResponse.json(
      { status: 'error', message: 'Not found.' },
      { status: 404 },
    );
  }

  const existing = await db.application.findFirst({
    where: {
      workspaceId: workspace.id,
      email,
      status: { in: ['PENDING', 'APPROVED', 'HOLD'] },
    },
  });
  if (existing) {
    return NextResponse.json({ status: 'already_applied' });
  }

  const fullName = ((data as Record<string, unknown>).fullName as string ?? '').trim();

  const redListedMember = await db.member.findFirst({
    where: { workspaceId: workspace.id, email, redListed: true },
  });
  const redListedEntry = await db.redList.findFirst({
    where: {
      workspaceId: workspace.id,
      OR: [
        { email: email },
        fullName ? { namePattern: { contains: fullName.split(' ')[0], mode: 'insensitive' } } : {},
      ],
    },
  });
  if (redListedMember || redListedEntry) {
    await db.application.create({
      data: {
        workspaceId: workspace.id,
        // Link to the known person when we already have one; never mint a new
        // Member for a held/red-listed applicant.
        memberId: redListedMember?.id ?? null,
        email,
        fullName,
        phone: data.phone,
        city: data.city,
        referredBy: data.referredBy,
        consentEmail: data.consentEmail ?? false,
        consentSms: data.consentSms ?? false,
        // PHASE B dual-write: structured consent derived from the same booleans;
        // single-shot create (no prior row) so timestamps stamp on true.
        ...structuredConsentWrites({
          consentEmail: data.consentEmail ?? false,
          consentSms: data.consentSms ?? false,
          now: new Date(),
          ip: getConsentIp(req),
          userAgent: req.headers.get('user-agent'),
        }),
        status: 'HOLD',
        duplicateFlag: true,
        aiTags: [],
      },
    });
    return NextResponse.json({ status: 'success' });
  }

  // Link identity at submission: resolve (or mint) the GUEST Member before the
  // application transaction so the applicant record is continuous from submit.
  const applicantMember = await resolveMember({
    workspaceId: workspace.id,
    email,
    name: fullName,
    phone: data.phone ?? undefined,
    source: 'apply_slug',
  });

  const application = await db.$transaction(async (tx) => {
    const app = await tx.application.create({
      data: {
        workspaceId: workspace.id,
        memberId: applicantMember.id,
        email,
        fullName,
        phone: data.phone,
        city: data.city,
        referredBy: data.referredBy,
        consentEmail: data.consentEmail ?? false,
        consentSms: data.consentSms ?? false,
        // PHASE B dual-write: structured consent derived from the same booleans;
        // single-shot create (no prior row) so timestamps stamp on true.
        ...structuredConsentWrites({
          consentEmail: data.consentEmail ?? false,
          consentSms: data.consentSms ?? false,
          now: new Date(),
          ip: getConsentIp(req),
          userAgent: req.headers.get('user-agent'),
        }),
        status: 'PENDING',
        aiTags: [],
      },
    });

    await Promise.all(
      answerQuestions.map(q =>
        tx.applicationAnswer.create({
          data: {
            applicationId: app.id,
            questionKey: q.key,
            answer: String(data[q.key as keyof typeof data] ?? ''),
          },
        }),
      ),
    );

    return app;
  });

  after(
    tagApplication(application.id).catch(err => {
      console.error('[apply] tagApplication failed:', err);
    }),
  );

  // Emit application.submitted — fire-and-forget, don't block response
  emitEvent({
    workspaceId: workspace.id,
    action: 'application.submitted',
    entityType: 'APPLICATION',
    entityId: application.id,
    metadata: { email, fullName },
  }).catch(err => console.error('[apply] application.submitted emit failed:', err));

  const { userId } = await auth();
  if (userId && data.rsvpEventId) {
    await attachEventRsvpAfterApply({
      workspaceId: workspace.id,
      clerkUserId: userId,
      eventId: data.rsvpEventId,
      email,
      fullName,
      phone: data.phone,
      actorIdForAudit: userId,
    });
  }

  return NextResponse.json({ status: 'success' });
}

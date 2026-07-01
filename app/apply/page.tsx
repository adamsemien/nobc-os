import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import MembershipForm from './_components/MembershipForm';
import ApplyAccountGate from './_components/ApplyAccountGate';
import { LegalFooter } from '@/app/_components/LegalFooter';
import { resolvePendingApplicationForAccount } from '@/lib/apply-account-link';
import { ApplicantStatusView } from '@/app/m/_components/ApplicantStatus';
import { db } from '@/lib/db';

export const metadata: Metadata = {
  title: 'apply - no bad company',
  openGraph: {
    title: 'apply - no bad company',
    description: 'membership by application. ten minutes. we read every word.',
    images: [{ url: '/og-apply.svg', width: 1200, height: 630 }],
  },
};

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const hasDraftId = typeof id === 'string' && id.length > 0;

  // A draft id in the URL drives the form's existing resume path (anonymous cookie
  // OR account ownership). Render the form unchanged.
  if (hasDraftId) {
    return (
      <Suspense fallback={<div style={{ background: '#f9f7f2', minHeight: '100vh' }} />}>
        <MembershipForm />
        <LegalFooter />
      </Suspense>
    );
  }

  // No draft id: route the signed-in caller by application state. Every branch
  // READS state only — no NEW DB write. (The PR1 resolver below may stamp
  // clerkUserId on its email-claim slow path; that pre-existing write is the
  // cross-device resume link and is intentionally kept. The member-detection read
  // is pure — no claim/stamp — and a presentational ApplicantStatusView is
  // rendered with router-computed props, so this path never triggers
  // ApplicantStatus's self-contained member-claim fallback.)
  const { userId } = await auth();
  if (userId) {
    // (c)/(d) — an in-progress (draft) or submitted PENDING application.
    const existing = await resolvePendingApplicationForAccount(userId);
    if (existing) {
      const row = await db.application.findUnique({
        where: { id: existing.id },
        select: { status: true, aiScore: true },
      });
      // (c) Draft, not yet submitted (aiScore unset) — resume the form.
      if (row?.aiScore === null) redirect(`/apply?id=${existing.id}`);
      // (d) Submitted (aiScore set at scoring) — "Application received." No form,
      // no reapply.
      return (
        <Suspense fallback={<div style={{ background: '#f9f7f2', minHeight: '100vh' }} />}>
          <ApplicantStatusView app={row} />
          <LegalFooter />
        </Suspense>
      );
    }

    // No PENDING application. One pure read by clerkUserId resolves the rest:
    //  (e) APPROVED member → the member home.
    //  decided (REJECTED / WAITLISTED / HOLD) → graceful "thank you", never the
    //      door — an invitation-only club must not invite a declined applicant to
    //      reapply.
    //  none → fall through to the account + consent gate (b).
    // The legacy fully-anonymous-approved row (clerkUserId never stamped) is an
    // accepted known gap that self-heals on /m; we do NOT add a write to close it.
    const prior = await db.application.findFirst({
      where: { clerkUserId: userId },
      orderBy: { createdAt: 'desc' },
      select: { status: true, aiScore: true },
    });
    if (prior?.status === 'APPROVED') redirect('/m');
    if (prior) {
      return (
        <Suspense fallback={<div style={{ background: '#f9f7f2', minHeight: '100vh' }} />}>
          <ApplicantStatusView app={prior} />
          <LegalFooter />
        </Suspense>
      );
    }
  }

  // (a) signed-out, or (b) signed-in with no application — the account + consent
  // gate (the door). The anonymous *start* is gated behind an account first.
  return (
    <Suspense fallback={<div style={{ background: '#f9f7f2', minHeight: '100vh' }} />}>
      <ApplyAccountGate />
      <LegalFooter />
    </Suspense>
  );
}

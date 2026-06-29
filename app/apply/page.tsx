import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import MembershipForm from './_components/MembershipForm';
import ApplyAccountGate from './_components/ApplyAccountGate';
import { LegalFooter } from '@/app/_components/LegalFooter';
import { resolvePendingApplicationForAccount } from '@/lib/apply-account-link';

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

  // No draft id: a signed-in applicant with an in-progress draft resumes it
  // (cross-device safe — the PR1 resolver matches by clerkUserId, or by verified
  // email then claims it). Everyone else gets the account + consent gate. The
  // anonymous *start* is intentionally unreachable now: an account comes first.
  const { userId } = await auth();
  if (userId) {
    const existing = await resolvePendingApplicationForAccount(userId);
    if (existing) redirect(`/apply?id=${existing.id}`);
  }

  return (
    <Suspense fallback={<div style={{ background: '#f9f7f2', minHeight: '100vh' }} />}>
      <ApplyAccountGate />
      <LegalFooter />
    </Suspense>
  );
}

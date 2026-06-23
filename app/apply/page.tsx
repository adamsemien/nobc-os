import type { Metadata } from 'next';
import { Suspense } from 'react';
import MembershipForm from './_components/MembershipForm';
import { LegalFooter } from '@/app/_components/LegalFooter';

export const metadata: Metadata = {
  title: 'apply - no bad company',
  openGraph: {
    title: 'apply - no bad company',
    description: 'membership by application. ten minutes. we read every word.',
    images: [{ url: '/og-apply.svg', width: 1200, height: 630 }],
  },
};

export default function ApplyPage() {
  return (
    <Suspense fallback={<div style={{ background: '#f9f7f2', minHeight: '100vh' }} />}>
      <MembershipForm />
      <LegalFooter />
    </Suspense>
  );
}

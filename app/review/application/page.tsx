import type { Metadata } from 'next';
import { Fraunces, Spline_Sans_Mono } from 'next/font/google';
import { db } from '@/lib/db';
import { ReviewClient } from './ReviewClient';

// Internal dark-link tool — Clerk-gated by the middleware matcher ('/review(.*)'),
// linked from nowhere, and kept out of search indexes.
export const metadata: Metadata = {
  title: 'NoBC · Application Review',
  robots: { index: false, follow: false },
};

// The saved review state must be read per-request, never at build time.
export const dynamic = 'force-dynamic';

// The reference design loads Fraunces (with optical sizing) + Spline Sans Mono
// from Google Fonts; next/font self-hosts the same families here.
const fraunces = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['opsz'],
  variable: '--font-arv-serif',
});

const splineSansMono = Spline_Sans_Mono({
  subsets: ['latin'],
  variable: '--font-arv-mono',
});

export default async function ApplicationReviewPage() {
  const row = await db.applicationReviewState.findUnique({ where: { key: 'main' } });
  // Empty table → the client seeds from the in-code SEED; first save creates the row.
  const initialData: unknown = row?.data ?? null;

  return (
    <div className={`${fraunces.variable} ${splineSansMono.variable}`}>
      <ReviewClient initialData={initialData} />
    </div>
  );
}

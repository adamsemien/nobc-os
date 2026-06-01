/**
 * Public brand-lift survey — `/survey/[token]`.
 *
 * Server component. Resolves the SurveyResponse by token (the credential), renders the phase's
 * question set with {sponsor} interpolated, or a thank-you once submitted. No PII shown.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { questionsFor } from '@/lib/intelligence/survey';
import { ShareHeader } from '@/app/_components/share/ShareHeader';
import { ShareFooter } from '@/app/_components/share/ShareFooter';
import { SurveyForm } from './SurveyForm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'A quick word — No Bad Company',
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sr = await db.surveyResponse.findUnique({
    where: { token },
    select: { phase: true, submittedAt: true, eventId: true, sponsorBrand: { select: { name: true } } },
  });
  if (!sr) notFound();

  const sponsorName = sr.sponsorBrand?.name ?? 'our partner';
  const event = await db.event.findFirst({ where: { id: sr.eventId }, select: { title: true } });
  const eventTitle = event?.title ?? 'No Bad Company';

  const body = sr.submittedAt ? (
    <p className="mx-auto mt-12 max-w-md text-center text-[18px] italic leading-[1.6] text-[var(--apply-muted)] font-[family-name:var(--font-cormorant)]">
      Thank you — your response is in. It stays anonymous in anything we share.
    </p>
  ) : (
    <SurveyForm
      token={token}
      intro={sr.phase === 'PRE' ? `Two quick questions before ${eventTitle}.` : `A few quick questions about ${eventTitle}.`}
      questions={questionsFor(sr.phase === 'PRE' ? 'PRE' : 'POST').map((q) => ({
        key: q.key,
        prompt: q.prompt.replace('{sponsor}', sponsorName),
        type: q.type,
        required: q.required ?? false,
      }))}
    />
  );

  return (
    <div className="flex min-h-screen flex-col bg-events-paper text-[var(--apply-ink)]">
      <ShareHeader title={eventTitle} kicker="A quick word" />
      <main className="mx-auto w-full max-w-xl flex-1 px-6 pb-24 pt-2">{body}</main>
      <ShareFooter companyName={null} />
    </div>
  );
}

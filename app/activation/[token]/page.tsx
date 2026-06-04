/**
 * Public sponsor booth surface — `/activation/[token]` (Phase 2a activation loop).
 *
 * Server component. Resolves the shared booth token, renders the sponsor-scoped form (any
 * sponsor-scoped EventCustomQuestions for this event + the default booth set) and posts each
 * interaction to /api/activation/[token]. Reuses the brand-lift SurveyForm.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { ACTIVATION_QUESTIONS, resolveBoothToken } from '@/lib/intelligence/activation';
import { ShareHeader } from '@/app/_components/share/ShareHeader';
import { ShareFooter } from '@/app/_components/share/ShareFooter';
import { SurveyForm } from '@/app/survey/[token]/SurveyForm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'At the table — No Bad Company',
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const booth = await resolveBoothToken(token);
  if (!booth) notFound();

  const custom = await db.eventCustomQuestion.findMany({
    where: { workspaceId: booth.workspaceId, eventId: booth.eventId, sponsorBrandId: booth.sponsorBrandId },
    orderBy: { order: 'asc' },
    select: { id: true, label: true },
  });

  const questions = [
    ...custom.map((c) => ({ key: `cq_${c.id}`, prompt: c.label, type: 'text' as const, required: false })),
    ...ACTIVATION_QUESTIONS.map((q) => ({
      key: q.key,
      prompt: q.prompt.replace('{sponsor}', booth.sponsorName),
      type: q.type,
      required: q.required ?? false,
    })),
  ];

  return (
    <div className="flex min-h-screen flex-col bg-events-paper text-[var(--apply-ink)]">
      <ShareHeader title={booth.sponsorName} kicker="At the table" />
      <main className="mx-auto w-full max-w-xl flex-1 px-6 pb-24 pt-2">
        <SurveyForm
          token={token}
          endpoint={`/api/activation/${encodeURIComponent(token)}`}
          intro={`A moment with ${booth.sponsorName} at ${booth.eventTitle}.`}
          questions={questions}
        />
      </main>
      <ShareFooter companyName={booth.sponsorName} />
    </div>
  );
}

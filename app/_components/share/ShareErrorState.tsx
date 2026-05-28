/**
 * Graceful invalid/expired share state. Editorial-minimal, no nav, no leak of
 * whether the token "ever existed" — the same chrome regardless of reason.
 */
import Link from 'next/link';
import { ShareHeader } from './ShareHeader';

const COPY: Record<string, { kicker: string; title: string; body: string }> = {
  NOT_FOUND: {
    kicker: 'No longer available',
    title: 'This share is unavailable',
    body: 'The link may have been deleted or it never existed. If you were expecting access, ask the sender for a fresh link.',
  },
  EXPIRED: {
    kicker: 'Expired',
    title: 'This share has expired',
    body: 'The window to view these files has closed. Ask the sender for a new link if you still need access.',
  },
  FOLDER_DELETED: {
    kicker: 'No longer available',
    title: 'This share is unavailable',
    body: 'The underlying files have been removed. Ask the sender to share an updated selection.',
  },
};

export function ShareErrorState({ reason }: { reason: 'NOT_FOUND' | 'EXPIRED' | 'FOLDER_DELETED' }) {
  const copy = COPY[reason] ?? COPY.NOT_FOUND;
  return (
    <div className="flex min-h-screen flex-col bg-events-paper text-[var(--apply-ink)]">
      <ShareHeader title={copy.title} kicker={copy.kicker} />
      <main className="mx-auto w-full max-w-xl flex-1 px-6 pb-20 pt-2 text-center">
        <p className="mx-auto mt-6 max-w-md text-[14px] leading-[1.8] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
          {copy.body}
        </p>
        <div className="my-10 h-px w-full bg-[var(--apply-rule)]" aria-hidden />
        <Link
          href="mailto:team@thenobadcompany.com"
          className="text-[13px] text-[var(--apply-muted)] underline-offset-4 transition-colors hover:text-[var(--nobc-red)] hover:underline font-[family-name:var(--font-dm-sans)]"
        >
          team@thenobadcompany.com
        </Link>
      </main>
    </div>
  );
}

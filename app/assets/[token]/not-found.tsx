/**
 * Local 404 for the sponsor share route. Rendered by Next.js when a page-level
 * `notFound()` is thrown — terminal failure modes (NOT_FOUND / EXPIRED /
 * FOLDER_DELETED) collapse to this state. Editorial-minimal, branded chrome.
 */
import Link from 'next/link';
import { ShareHeader } from '@/app/_components/share/ShareHeader';
import { ShareFooter } from '@/app/_components/share/ShareFooter';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-events-paper text-[var(--apply-ink)]">
      <ShareHeader title="This share link is no longer available" kicker="Sponsor Delivery" />
      <main className="mx-auto w-full max-w-xl flex-1 px-6 pb-20 pt-2 text-center">
        <p className="mx-auto mt-6 max-w-md text-[14px] leading-[1.8] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
          The link may have expired, been removed, or never existed. If you believe this is an error, contact your sender.
        </p>
        <div className="my-10 h-px w-full bg-[var(--apply-rule)]" aria-hidden />
        <Link
          href="mailto:team@thenobadcompany.com"
          className="text-[13px] text-[var(--apply-muted)] underline-offset-4 transition-colors hover:text-[var(--nobc-red)] hover:underline font-[family-name:var(--font-dm-sans)]"
        >
          team@thenobadcompany.com
        </Link>
      </main>
      <ShareFooter />
    </div>
  );
}

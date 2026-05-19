'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, ScanLine, MonitorPlay } from 'lucide-react';

export function EventActionBar({
  eventId,
  slug,
  status,
}: {
  eventId: string;
  slug: string;
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function setStatus(next: 'PUBLISHED' | 'CANCELLED' | 'DRAFT') {
    setError(null);
    try {
      const res = await fetch(`/api/operator/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(typeof error === 'string' ? error : 'Could not update event');
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update event');
    }
  }

  const showPublish = status !== 'PUBLISHED';
  const showCancel = status === 'PUBLISHED';

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2">
      <a
        href={`/check-in/${slug}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-primary hover:text-primary"
      >
        <ScanLine className="h-3.5 w-3.5" aria-hidden />
        Check In →
      </a>
      <Link
        href={`/operator/events/${eventId}/room`}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
      >
        <MonitorPlay className="h-3.5 w-3.5" aria-hidden />
        The Room →
      </Link>

      <span className="mx-1 hidden h-5 w-px bg-border sm:inline-block" aria-hidden />

      {showPublish ? (
        <button
          type="button"
          onClick={() => setStatus('PUBLISHED')}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-success/40 bg-success-soft px-3 py-1.5 text-xs font-semibold text-success transition-colors hover:bg-success/15 disabled:opacity-50"
        >
          {pending ? 'Working…' : 'Publish'}
        </button>
      ) : null}
      {showCancel ? (
        <button
          type="button"
          onClick={() => setStatus('CANCELLED')}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-danger/40 bg-danger-soft px-3 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-danger/15 disabled:opacity-50"
        >
          {pending ? 'Working…' : 'Cancel event'}
        </button>
      ) : null}

      <Link
        href={`/operator/events/${eventId}?tab=settings`}
        className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-primary hover:text-primary"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        Edit
      </Link>

      {error ? (
        <span className="w-full text-xs text-danger">{error}</span>
      ) : null}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import { formatDateOnly } from '@/lib/operator-application-display';

type Props = {
  applicationId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'HOLD';
  reviewedAt: string | null;
};

export function ApplicationDecisionBar({
  applicationId,
  status,
  reviewedAt,
}: Props) {
  const router = useRouter();
  const actionable = status === 'PENDING' || status === 'HOLD';
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setError(null);
    setBusy('approve');
    try {
      const r = await fetch(`/api/operator/applications/${applicationId}/approve`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!r.ok) throw new Error('request failed');
      router.push('/operator/applications');
      router.refresh();
    } catch {
      setError('Could not approve. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    setError(null);
    setBusy('reject');
    try {
      const r = await fetch(`/api/operator/applications/${applicationId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      if (!r.ok) throw new Error('request failed');
      router.push('/operator/applications');
      router.refresh();
    } catch {
      setError('Could not reject. Try again.');
    } finally {
      setBusy(null);
    }
  }

  const reviewedLabel = formatDateOnly(reviewedAt ?? undefined);

  if (!actionable) {
    return (
      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t px-4 py-4 sm:px-6"
        style={{
          borderColor: 'var(--nobc-hairline)',
          background: 'var(--nobc-ivory)',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="mx-auto max-w-6xl">
          {status === 'APPROVED' && (
            <p className="text-center text-sm" style={{ color: 'var(--nobc-ink)' }}>
              Approved
              {reviewedLabel ? ` on ${reviewedLabel}` : ''}.
            </p>
          )}
          {status === 'REJECTED' && (
            <p className="text-center text-sm" style={{ color: 'var(--nobc-ink)' }}>
              Rejected
              {reviewedLabel ? ` on ${reviewedLabel}` : ''}.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-20 border-t px-4 py-4 sm:px-6"
      style={{
        borderColor: 'var(--nobc-hairline)',
        background: 'var(--nobc-ivory)',
        boxShadow: '0 -8px 24px var(--nobc-hairline)',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
      }}
    >
      <div className="mx-auto max-w-6xl space-y-3">
        {error ? (
          <p className="text-center text-sm" style={{ color: 'var(--nobc-red)' }}>
            {error}
          </p>
        ) : null}
        {rejectOpen ? (
          <div className="space-y-2">
            <label className="block text-xs tracking-wide" style={{ color: 'var(--nobc-dark)' }}>
              Optional note (shown internally)
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
                className="mt-1 w-full resize-y border px-3 py-2 text-sm outline-none focus:ring-2"
                style={{
                  borderRadius: '4px',
                  borderColor: 'var(--nobc-hairline)',
                  color: 'var(--nobc-ink)',
                  background: 'var(--nobc-ivory)',
                  fontFamily: 'inherit',
                }}
              />
            </label>
          </div>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={approve}
            disabled={busy !== null}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 px-5 text-base font-medium text-white disabled:opacity-60 sm:min-w-[10rem] sm:w-auto"
            style={{ borderRadius: '4px', background: 'var(--nobc-red)' }}
          >
            {busy === 'approve' ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
            Approve
          </button>
          {!rejectOpen ? (
            <button
              type="button"
              onClick={() => {
                setRejectOpen(true);
                setError(null);
              }}
              disabled={busy !== null}
              className="inline-flex min-h-12 w-full items-center justify-center px-5 text-base font-medium disabled:opacity-60 sm:min-w-[10rem] sm:w-auto"
              style={{
                borderRadius: '4px',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: 'var(--nobc-ink)',
                color: 'var(--nobc-ink)',
                background: 'transparent',
              }}
            >
              Reject
            </button>
          ) : (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:w-auto">
              <button
                type="button"
                onClick={() => {
                  setRejectOpen(false);
                  setReason('');
                }}
                disabled={busy !== null}
                className="inline-flex min-h-12 flex-1 items-center justify-center px-4 text-sm font-medium disabled:opacity-60"
                style={{
                  borderRadius: '4px',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: 'var(--nobc-hairline)',
                  color: 'var(--nobc-dark)',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={reject}
                disabled={busy !== null}
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 px-4 text-sm font-medium text-white disabled:opacity-60"
                style={{ borderRadius: '4px', background: 'var(--nobc-ink)' }}
              >
                {busy === 'reject' ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
                Confirm reject
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ConsentReadOnlyRow({ label, checked }: { label: string; checked: boolean }) {
  return (
    <li className="flex items-start gap-3 py-2">
      <span
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border"
        style={{
          borderRadius: '4px',
          borderColor: 'var(--nobc-hairline)',
          color: checked ? 'var(--nobc-red)' : 'var(--nobc-dark)',
        }}
        aria-hidden
      >
        {checked ? <Check className="h-4 w-4" strokeWidth={2.5} /> : null}
      </span>
      <span className="text-sm leading-relaxed" style={{ color: 'var(--nobc-ink)' }}>
        {label}
      </span>
    </li>
  );
}

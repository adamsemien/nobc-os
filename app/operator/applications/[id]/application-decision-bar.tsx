'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import { formatDateOnly } from '@/lib/operator-application-display';
import { logQAAction } from '@/lib/dev/qa-action-log';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

type Props = {
  applicationId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'HOLD';
  reviewedAt: string | null;
  submittedAt: string | null;
};

export function ApplicationDecisionBar({
  applicationId,
  status,
  reviewedAt,
  submittedAt,
}: Props) {
  const router = useRouter();
  const actionable = status === 'PENDING' || status === 'HOLD';
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmUnsubmitted, setConfirmUnsubmitted] = useState(false);
  const [confirmUnsubmittedReject, setConfirmUnsubmittedReject] = useState(false);

  async function approve(confirmed?: boolean) {
    if (submittedAt === null && !confirmed) {
      setConfirmUnsubmitted(true);
      return;
    }
    setError(null);
    setBusy('approve');
    try {
      const r = await fetch(`/api/operator/applications/${applicationId}/approve`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmUnsubmitted: confirmed === true }),
      });
      if (!r.ok) throw new Error('request failed');
      logQAAction('approved application');
      router.push('/operator/applications');
      router.refresh();
    } catch {
      setError('Could not approve. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function reject(confirmed?: boolean) {
    if (submittedAt === null && !confirmed) {
      setConfirmUnsubmittedReject(true);
      return;
    }
    setError(null);
    setBusy('reject');
    try {
      const r = await fetch(`/api/operator/applications/${applicationId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          reason: reason.trim() || undefined,
          confirmUnsubmitted: confirmed === true,
        }),
      });
      if (!r.ok) throw new Error('request failed');
      logQAAction('rejected application');
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
          borderColor: 'var(--border)',
          background: 'var(--bg)',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="mx-auto max-w-6xl">
          {status === 'APPROVED' && (
            <p className="text-center text-sm" style={{ color: 'var(--text-primary)' }}>
              Approved
              {reviewedLabel ? ` on ${reviewedLabel}` : ''}.
            </p>
          )}
          {status === 'REJECTED' && (
            <p className="text-center text-sm" style={{ color: 'var(--text-primary)' }}>
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
        borderColor: 'var(--border)',
        background: 'var(--bg)',
        boxShadow: '0 -8px 24px var(--border)',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
      }}
    >
      <div className="mx-auto max-w-6xl space-y-3">
        {error ? (
          <p className="text-center text-sm" style={{ color: 'var(--primary)' }}>
            {error}
          </p>
        ) : null}
        {rejectOpen ? (
          <div className="space-y-2">
            <label className="block text-xs tracking-wide" style={{ color: 'var(--text-secondary)' }}>
              Optional note (shown internally)
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
                className="mt-1 w-full resize-y border px-3 py-2 text-sm outline-none focus:ring-2"
                style={{
                  borderRadius: '4px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                  background: 'var(--bg)',
                  fontFamily: 'inherit',
                }}
              />
            </label>
          </div>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          {!rejectOpen && (
            <button
              type="button"
              onClick={() => approve()}
              disabled={busy !== null}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 px-5 text-base font-medium text-white disabled:opacity-60 sm:min-w-[10rem] sm:w-auto"
              style={{ borderRadius: '4px', background: 'var(--primary)' }}
            >
              {busy === 'approve' ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
              Approve
            </button>
          )}
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
                borderColor: 'var(--text-primary)',
                color: 'var(--text-primary)',
                background: 'transparent',
              }}
            >
              Reject
            </button>
          ) : (
            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  setRejectOpen(false);
                  setReason('');
                }}
                disabled={busy !== null}
                className="inline-flex min-h-12 items-center justify-center px-6 text-sm font-medium disabled:opacity-60 sm:w-auto"
                style={{
                  borderRadius: '4px',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: 'var(--border)',
                  color: 'var(--text-secondary)',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => reject()}
                disabled={busy !== null}
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 px-5 text-base font-medium text-white disabled:opacity-60"
                style={{ borderRadius: '4px', background: 'var(--primary)' }}
              >
                {busy === 'reject' ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
                Confirm Rejection
              </button>
            </div>
          )}
        </div>
      </div>
      {confirmUnsubmitted ? (
        <ConfirmModal
          title="Approve an application that was never submitted?"
          subtitle="This application was never submitted - it has not been AI-scored and some fields may be incomplete. Approving now still creates a full member record."
          confirmLabel="Approve anyway"
          confirmTone="danger"
          busy={busy === 'approve'}
          onCancel={() => setConfirmUnsubmitted(false)}
          onConfirm={() => {
            setConfirmUnsubmitted(false);
            void approve(true);
          }}
        />
      ) : null}
      {confirmUnsubmittedReject ? (
        <ConfirmModal
          title="Reject an application that was never submitted?"
          subtitle="This application was never submitted - it has not been AI-scored. Rejecting now sends a rejection email to someone who never applied."
          confirmLabel="Reject anyway"
          confirmTone="danger"
          busy={busy === 'reject'}
          onCancel={() => setConfirmUnsubmittedReject(false)}
          onConfirm={() => {
            setConfirmUnsubmittedReject(false);
            void reject(true);
          }}
        />
      ) : null}
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
          borderColor: 'var(--border)',
          color: checked ? 'var(--primary)' : 'var(--text-secondary)',
        }}
        aria-hidden
      >
        {checked ? <Check className="h-4 w-4" strokeWidth={2.5} /> : null}
      </span>
      <span className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
        {label}
      </span>
    </li>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowLeft, Check, Loader2, Mail, MapPin, Phone, X, XCircle } from 'lucide-react';
import { APPLY_QUESTIONS } from '@/lib/apply-config';

export type ApplicationsQueueItem = {
  id: string;
  fullName: string;
  email: string;
  city: string | null;
  phone: string | null;
  submittedAt: string;
  aiTags: string[];
  aiScore: number | null;
  aiRecommendation:
    | 'strong_yes'
    | 'yes'
    | 'unclear'
    | 'no'
    | 'strong_no'
    | null;
  aiReasoning: string | null;
  answers: Record<string, string>;
};

const ANSWER_ORDER = new Map(
  APPLY_QUESTIONS.filter(q => q.storage === 'answer').map((q, i) => [q.key, i]),
);

function labelForQuestionKey(key: string): string {
  return APPLY_QUESTIONS.find(q => q.key === key)?.label ?? key;
}

function formatRecommendationLabel(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function formatSubmitted(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

function formatSubmittedShort(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

function recommendationBadgeVars(
  rec: ApplicationsQueueItem['aiRecommendation'],
): { background: string; color: string } | null {
  switch (rec) {
    case 'strong_yes':
      return {
        background: 'var(--op-rec-strong-yes-bg)',
        color: 'var(--op-rec-strong-yes-fg)',
      };
    case 'yes':
      return {
        background: 'var(--op-rec-yes-bg)',
        color: 'var(--op-rec-yes-fg)',
      };
    case 'unclear':
      return {
        background: 'var(--op-rec-unclear-bg)',
        color: 'var(--op-rec-unclear-fg)',
      };
    case 'no':
      return {
        background: 'var(--op-rec-no-bg)',
        color: 'var(--op-rec-no-fg)',
      };
    case 'strong_no':
      return {
        background: 'var(--op-rec-strong-no-bg)',
        color: 'var(--op-rec-strong-no-fg)',
      };
    default:
      return null;
  }
}

function orderedAnswerEntries(answers: Record<string, string>): [string, string][] {
  const keys = Object.keys(answers);
  keys.sort((a, b) => (ANSWER_ORDER.get(a) ?? 999) - (ANSWER_ORDER.get(b) ?? 999));
  return keys.map(k => [k, answers[k] ?? '']);
}

type Props = {
  applications: ApplicationsQueueItem[];
};

export function ApplicationsQueue({ applications: initialApplications }: Props) {
  const [applications, setApplications] = useState(initialApplications);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialApplications[0]?.id ?? null,
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'approve' | 'reject' | null>(null);
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    setApplications(initialApplications);
  }, [initialApplications]);

  useEffect(() => {
    if (applications.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId(prev => {
      if (prev && applications.some(a => a.id === prev)) return prev;
      return applications[0].id;
    });
  }, [applications]);

  const selected = useMemo(
    () => applications.find(a => a.id === selectedId) ?? null,
    [applications, selectedId],
  );

  const removeAndNotify = useCallback((id: string, message: string) => {
    setApplications(prev => prev.filter(a => a.id !== id));
    setFlash({ type: 'success', message });
    setSheetOpen(false);
    window.setTimeout(() => setFlash(null), 4000);
  }, []);

  const postAction = useCallback(
    async (id: string, path: 'approve' | 'reject') => {
      setFlash(null);
      setPendingAction(path);
      try {
        const res = await fetch(`/api/operator/applications/${id}/${path}`, {
          method: 'POST',
          credentials: 'include',
          ...(path === 'reject'
            ? {
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
              }
            : {}),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `Request failed (${res.status})`);
        }
        removeAndNotify(
          id,
          path === 'approve' ? 'Application approved.' : 'Application rejected.',
        );
      } catch (e) {
        const message =
          e instanceof Error ? e.message : 'Something went wrong. Try again.';
        setFlash({ type: 'error', message });
      } finally {
        setPendingAction(null);
      }
    },
    [removeAndNotify],
  );

  const headingFont: CSSProperties = {
    fontFamily: 'var(--font-playfair-display), Georgia, serif',
  };

  if (applications.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-text-secondary">
        No applications in this view.
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:min-h-[calc(100vh-10rem)]">
      {flash ? (
        <div
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            flash.type === 'success'
              ? 'border-border bg-surface text-text-primary'
              : 'border-border bg-surface text-text-secondary'
          }`}
          style={
            flash.type === 'error'
              ? {
                  borderRadius: '8px',
                  borderLeftWidth: '4px',
                  borderLeftStyle: 'solid',
                  borderLeftColor: 'var(--op-reject)',
                }
              : { borderRadius: '8px' }
          }
        >
          {flash.message}
        </div>
      ) : null}

      <div className="grid min-h-0 min-w-0 flex-1 gap-5 overflow-hidden lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] lg:gap-8">
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden border-border lg:border-r lg:pr-1">
          <ul className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pb-4 pr-0.5">
            {applications.map(app => {
              const active = app.id === selectedId;
              const badge = recommendationBadgeVars(app.aiRecommendation);
              const score = app.aiScore ?? 0;
              return (
                <li key={app.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(app.id);
                      if (
                        typeof window !== 'undefined' &&
                        window.matchMedia('(max-width: 1023px)').matches
                      ) {
                        setSheetOpen(true);
                      }
                    }}
                    className={`min-w-0 w-full rounded-lg border px-3 py-3 text-left transition-colors lg:px-4 ${
                      active
                        ? 'border-border bg-surface-elevated shadow-sm ring-1 ring-border'
                        : 'border-transparent bg-surface hover:bg-surface-elevated'
                    }`}
                    style={{ borderRadius: '8px' }}
                  >
                    <p className="truncate font-medium text-text-primary" style={headingFont}>
                      {app.fullName}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      {[app.city, formatSubmittedShort(app.submittedAt)].filter(Boolean).join(' · ')}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {badge && app.aiRecommendation ? (
                        <span
                          className="inline-flex max-w-full items-center rounded border border-border px-2.5 py-1 text-[11px] font-semibold leading-tight shadow-sm ring-1 ring-border/60"
                          style={{
                            borderRadius: '6px',
                            background: badge.background,
                            color: badge.color,
                          }}
                        >
                          <span className="truncate">{formatRecommendationLabel(app.aiRecommendation)}</span>
                        </span>
                      ) : (
                        <span className="inline-flex rounded border border-dashed border-border bg-muted px-2.5 py-1 text-[11px] font-medium text-text-secondary">
                          No AI review yet
                        </span>
                      )}
                    </div>
                    <div
                      className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                      style={{ borderRadius: '4px' }}
                      aria-label="AI fit score"
                    >
                      <div
                        className="h-full rounded-full bg-primary transition-[width]"
                        style={{
                          borderRadius: '4px',
                          width: `${Math.round(Math.min(1, Math.max(0, score)) * 100)}%`,
                        }}
                      />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="hidden min-h-0 min-w-0 flex-col overflow-hidden lg:flex">
          {selected ? (
            <DetailPanel
              app={selected}
              headingFont={headingFont}
              pendingAction={pendingAction}
              onApprove={() => postAction(selected.id, 'approve')}
              onReject={() => postAction(selected.id, 'reject')}
            />
          ) : null}
        </div>
      </div>

      {sheetOpen && selected ? (
        <div
          className="fixed inset-0 z-50 flex flex-col lg:hidden"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--foreground) 18%, var(--background))',
          }}
        >
          <div className="flex items-center gap-2 border-b border-border bg-surface-elevated px-3 py-3">
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded text-text-primary"
              style={{ borderRadius: '4px' }}
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <span className="text-sm font-medium text-text-primary">Application</span>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded text-text-secondary"
              style={{ borderRadius: '4px' }}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-4">
            <DetailPanel
              app={selected}
              headingFont={headingFont}
              pendingAction={pendingAction}
              onApprove={() => postAction(selected.id, 'approve')}
              onReject={() => postAction(selected.id, 'reject')}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DetailPanel({
  app,
  headingFont,
  pendingAction,
  onApprove,
  onReject,
}: {
  app: ApplicationsQueueItem;
  headingFont: CSSProperties;
  pendingAction: 'approve' | 'reject' | null;
  onApprove: () => void;
  onReject: () => void;
}) {
  const entries = orderedAnswerEntries(app.answers);

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain rounded-lg border border-border bg-surface-elevated p-4 sm:p-6 lg:max-h-[calc(100vh-11rem)]"
      style={{ borderRadius: '8px' }}
    >
      <h2 className="truncate text-2xl font-semibold text-text-primary sm:text-3xl" style={headingFont}>
        {app.fullName}
      </h2>

      {app.aiReasoning ? (
        <div className="mt-5 rounded-lg border border-border bg-muted p-4 shadow-sm sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">AI reasoning</p>
          <p className="mt-3 text-lg font-medium leading-[1.55] text-text-primary sm:text-xl">
            {app.aiReasoning}
          </p>
        </div>
      ) : null}

      <dl className="mt-6 space-y-3 text-sm text-text-secondary">
        <div className="flex items-start gap-2">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden />
          <div>
            <dt className="sr-only">Email</dt>
            <dd>
              <a href={`mailto:${app.email}`} className="text-text-primary underline-offset-2 hover:underline">
                {app.email}
              </a>
            </dd>
          </div>
        </div>
        {app.city ? (
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden />
            <div>
              <dt className="sr-only">City</dt>
              <dd className="text-text-primary">{app.city}</dd>
            </div>
          </div>
        ) : null}
        {app.phone ? (
          <div className="flex items-start gap-2">
            <Phone className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden />
            <div>
              <dt className="sr-only">Phone</dt>
              <dd>
                <a href={`tel:${app.phone}`} className="text-text-primary underline-offset-2 hover:underline">
                  {app.phone}
                </a>
              </dd>
            </div>
          </div>
        ) : null}
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">Submitted</dt>
          <dd className="mt-0.5 text-text-primary">{formatSubmitted(app.submittedAt)}</dd>
        </div>
      </dl>

      {app.aiTags.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {app.aiTags.map(tag => (
            <li
              key={tag}
              className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-text-secondary"
            >
              {tag}
            </li>
          ))}
        </ul>
      ) : null}

      <section className="mt-8 border-t border-border pt-6">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Answers</h3>
        <div className="mt-4 space-y-6">
          {entries.map(([key, value]) => (
            <div key={key} className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted">
                {labelForQuestionKey(key)}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-[15px] font-medium leading-relaxed text-text-primary">
                {value.trim() ? value : '—'}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-auto flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:gap-4">
        <button
          type="button"
          onClick={onApprove}
          disabled={pendingAction !== null}
          className="inline-flex min-h-[3.25rem] flex-1 items-center justify-center gap-2 rounded-md bg-op-approve px-4 text-base font-semibold text-op-approve-fg shadow-sm transition-colors hover:bg-op-approve-hover disabled:opacity-50"
          style={{ borderRadius: '6px' }}
        >
          {pendingAction === 'approve' ? (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
          ) : (
            <Check className="h-5 w-5 shrink-0 opacity-90" strokeWidth={2.25} aria-hidden />
          )}
          <span className="text-center leading-tight">Approve application</span>
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={pendingAction !== null}
          className="inline-flex min-h-[3.25rem] flex-1 items-center justify-center gap-2 rounded-md bg-op-reject px-4 text-base font-semibold text-op-reject-fg shadow-sm transition-colors hover:bg-op-reject-hover disabled:opacity-50"
          style={{ borderRadius: '6px' }}
        >
          {pendingAction === 'reject' ? (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
          ) : (
            <XCircle className="h-5 w-5 shrink-0 opacity-90" strokeWidth={2.25} aria-hidden />
          )}
          <span className="text-center leading-tight">Reject application</span>
        </button>
      </div>
    </div>
  );
}

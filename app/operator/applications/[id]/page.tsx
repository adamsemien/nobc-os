// Full-page application detail — the canonical, deep-linkable record for ONE
// application. Distinct from the /operator/applications split-view (a fast
// keyboard-driven triage queue): this page is the permalink target from the
// Intelligence funnel and global/dev search, and it's the only surface that
// shows the operator comment thread and consent records. Not redundant — keep both.
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { operatorServerFetch } from '@/lib/operator-server-fetch';
import { APPLY_QUESTIONS } from '@/lib/apply-config';
import { ARCHETYPES, type ArchetypeName } from '@/config/archetypes';
import { formatDateTime } from '@/lib/operator-application-display';
import { Breadcrumbs } from '@/app/operator/_components/PageHeader';
import { Avatar } from '@/app/operator/_components/Avatar';
import { CommentThread } from '@/components/comments/CommentThread';
import { StatusBadge, applicationTone } from '@/components/ui';
import {
  ApplicationDecisionBar,
  ConsentReadOnlyRow,
} from './application-decision-bar';

const URL_RE = /\bhttps?:\/\/[^\s)]+/i;
const INSTAGRAM_RE = /(?:instagram\.com\/|^@)([A-Za-z0-9_.]{1,30})/i;

function urlChip(answer: string): { label: string; href: string } | null {
  const ig = INSTAGRAM_RE.exec(answer);
  if (ig) {
    const handle = ig[1];
    return { label: `@${handle}`, href: `https://instagram.com/${handle}` };
  }
  const url = URL_RE.exec(answer);
  if (url) {
    try {
      const u = new URL(url[0]);
      return { label: u.hostname.replace(/^www\./, ''), href: u.toString() };
    } catch {
      /* ignore */
    }
  }
  return null;
}

type DetailPayload = {
  application: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    city: string | null;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'HOLD';
    createdAt: string;
    reviewedAt: string | null;
    rejectionReason: string | null;
    consentEmail: boolean;
    consentSms: boolean;
    referrers: string[];
    substantiveAnswers: { questionKey: string; label: string; answer: string }[];
    consentAnswers: { questionKey: string; label: string; checked: boolean }[];
    aiScore: number | null;
    aiRecommendation: string | null;
    aiReasoning: string | null;
    archetype: string | null;
    archetypeScores: Record<string, number> | null;
    photos: string[];
  };
};

const SCORE_DIMENSIONS = ['influence', 'contribution', 'activation', 'taste'] as const;

function scoreOutOfTen(score: number | null): string {
  if (typeof score !== 'number') return '—';
  return (score * 10).toFixed(1);
}

function scorePercent(score: number | null): string {
  if (typeof score !== 'number') return '—';
  return `${Math.round(score * 100)}%`;
}

function labelForModelField(key: string): string {
  return APPLY_QUESTIONS.find(q => q.key === key)?.label ?? key;
}

function statusBadgeClass(status: DetailPayload['application']['status']): string {
  if (status === 'PENDING' || status === 'HOLD') return 'bg-warning-soft text-warning';
  if (status === 'APPROVED') return 'bg-success-soft text-success';
  return 'bg-danger-soft text-danger';
}

export default async function OperatorApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await operatorServerFetch(`/api/operator/applications/${id}`);

  if (res.status === 404) {
    return (
      <div className="px-4 py-16 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
        Application not found.{' '}
        <Link href="/operator/applications" className="underline" style={{ color: 'var(--primary)' }}>
          Back to list
        </Link>
      </div>
    );
  }

  if (!res.ok) {
    return (
      <div className="px-4 py-16 text-center text-sm" style={{ color: 'var(--primary)' }}>
        Could not load this application.
      </div>
    );
  }

  const { application: app } = (await res.json()) as DetailPayload;
  const reviewedDate =
    app.reviewedAt &&
    new Date(app.reviewedAt).toLocaleDateString('en-US', { dateStyle: 'long' });

  return (
    <div className="px-4 pb-52 pt-8 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Breadcrumbs
          items={[
            { href: '/operator/applications', label: 'Applications' },
            { label: app.fullName },
          ]}
        />

        {/* Prominent page identity header */}
        <div className="mb-8 flex items-center gap-4 border-b pb-6" style={{ borderColor: 'var(--border)' }}>
          {app.photos.length > 0 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={app.photos[0]}
              alt={`${app.fullName} portrait`}
              className="h-14 w-14 shrink-0 rounded-full object-cover"
              style={{ border: '1px solid var(--border)' }}
            />
          ) : (
            <Avatar name={app.fullName} email={app.email} size={56} />
          )}
          <div className="min-w-0">
            <h1
              className="text-3xl font-normal leading-tight sm:text-4xl"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
            >
              {app.fullName}
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
              {app.email}
              {app.city ? ` · ${app.city}` : ''}
              {' · Applied '}{formatDateTime(app.createdAt)}
            </p>
          </div>
          <div className="ml-auto shrink-0">
            <StatusBadge tone={applicationTone(app.status)}>
              {app.status === 'HOLD' ? 'Hold' : app.status.toLowerCase()}
            </StatusBadge>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          {/* LEFT: Application answers — the primary review content */}
          <section className="space-y-8">
            <div>
              <h2
                className="mb-4 text-xs font-semibold uppercase tracking-[0.25em]"
                style={{ color: 'var(--text-secondary)' }}
              >
                Application answers
              </h2>
              <div className="space-y-6">
                {app.substantiveAnswers.map(row => {
                  const chip = urlChip(row.answer);
                  return (
                    <div key={row.questionKey}>
                      <p
                        className="mb-1 text-xs font-semibold uppercase tracking-[0.18em]"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {row.label}
                      </p>
                      <p className="whitespace-pre-wrap text-sm font-normal leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                        {row.answer.trim() ? row.answer : '—'}
                      </p>
                      {chip ? (
                        <a
                          href={chip.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-text-primary transition-colors hover:border-primary hover:text-primary"
                        >
                          {chip.label}
                          <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h2
                className="mb-3 text-xs font-semibold uppercase tracking-[0.25em]"
                style={{ color: 'var(--text-secondary)' }}
              >
                Consents
              </h2>
              <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                <ConsentReadOnlyRow label={labelForModelField('consentEmail')} checked={app.consentEmail} />
                <ConsentReadOnlyRow label={labelForModelField('consentSms')} checked={app.consentSms} />
                {app.consentAnswers.map(row => (
                  <ConsentReadOnlyRow key={row.questionKey} label={row.label} checked={row.checked} />
                ))}
              </ul>
            </div>

            <CommentThread entityType="application" entityId={app.id} />
          </section>

          {/* RIGHT: AI intelligence + contact details + photos */}
          <section className="space-y-6">
            {(app.aiScore !== null || app.archetype) && (
              <div
                className="rounded-md p-4"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <div className="flex flex-wrap items-center gap-3">
                  {app.aiScore !== null && (
                    <div>
                      <p
                        className="text-[10px] uppercase tracking-[0.18em]"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        AI score
                      </p>
                      <p
                        className="text-2xl font-semibold tabular-nums"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {scoreOutOfTen(app.aiScore)}
                        <span
                          className="ml-1 text-sm font-normal"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          / 10 · {scorePercent(app.aiScore)}
                        </span>
                      </p>
                    </div>
                  )}
                  {app.archetype && (
                    <div className="ml-auto">
                      <p
                        className="text-[10px] uppercase tracking-[0.18em]"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Archetype
                      </p>
                      <p
                        className="text-lg font-semibold"
                        style={{ color: 'var(--primary)' }}
                      >
                        {app.archetype}
                      </p>
                    </div>
                  )}
                </div>
                {app.archetype && ARCHETYPES[app.archetype as ArchetypeName] && (
                  <p
                    className="mt-3 text-sm leading-relaxed"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {ARCHETYPES[app.archetype as ArchetypeName].dayStory}
                  </p>
                )}
                {app.aiReasoning && (
                  <p
                    className="mt-3 text-sm italic leading-relaxed"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {app.aiReasoning}
                  </p>
                )}
                {app.archetypeScores && (
                  <div className="mt-4 space-y-2">
                    {SCORE_DIMENSIONS.map((dim) => {
                      const v = app.archetypeScores?.[dim];
                      if (typeof v !== 'number') return null;
                      const pct = Math.round(v * 100);
                      return (
                        <div key={dim} className="flex items-center gap-3">
                          <span
                            className="w-24 text-[11px] uppercase tracking-[0.12em]"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {dim}
                          </span>
                          <div
                            className="h-1.5 flex-1 overflow-hidden rounded-full"
                            style={{ background: 'var(--border)' }}
                          >
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct}%`, background: 'var(--primary)' }}
                            />
                          </div>
                          <span
                            className="w-10 text-right text-xs tabular-nums"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {pct}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <dl className="space-y-3 text-sm" style={{ color: 'var(--text-primary)' }}>
              {app.phone ? (
                <div>
                  <dt className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Phone</dt>
                  <dd className="mt-0.5">
                    <a href={`tel:${app.phone}`} className="underline-offset-2 hover:underline">
                      {app.phone}
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>

            {app.referrers.length > 0 ? (
              <div>
                <h2
                  className="mb-2 text-xs font-semibold uppercase tracking-[0.2em]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Referrers
                </h2>
                <ul className="list-inside list-disc space-y-1 text-sm" style={{ color: 'var(--text-primary)' }}>
                  {app.referrers.map((line, i) => (
                    <li key={`${line}-${i}`}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {app.status === 'APPROVED' && reviewedDate ? (
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Approved on {reviewedDate}
              </p>
            ) : null}
            {app.status === 'REJECTED' ? (
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {reviewedDate ? <p>Rejected on {reviewedDate}.</p> : <p>Rejected.</p>}
                {app.rejectionReason ? (
                  <p className="mt-2 leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                    {app.rejectionReason}
                  </p>
                ) : null}
              </div>
            ) : null}

            {app.photos.length > 0 && (
              <div>
                <h2
                  className="mb-2 text-xs font-semibold uppercase tracking-[0.2em]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Photos
                </h2>
                <div className="flex flex-wrap gap-2">
                  {app.photos.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={url}
                      src={url}
                      alt={`${app.fullName} photo ${i + 1}`}
                      className="h-24 w-24 rounded-md object-cover"
                      style={{ border: '1px solid var(--border)' }}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      <ApplicationDecisionBar applicationId={app.id} status={app.status} reviewedAt={app.reviewedAt} />
    </div>
  );
}

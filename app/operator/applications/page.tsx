import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { auth } from '@clerk/nextjs/server';
import { operatorServerFetch } from '@/lib/operator-server-fetch';
import { requireWorkspaceId } from '@/lib/auth';
import { getWorkspaceTierNames } from '@/lib/workspace-tier-names';
import { PageHeader } from '@/components/ui';
import { LiveCount } from '@/components/counts/LiveCount';
import {
  ApplicationsQueue,
  type ApplicationsQueueItem,
} from './_components/ApplicationsQueue';

type StatusTab = 'pending' | 'approved' | 'rejected' | 'hold' | 'all';

type ApiApplication = {
  id: string;
  fullName: string;
  email: string;
  city: string | null;
  phone: string | null;
  submittedAt: string;
  status: string;
  aiTags: string[];
  aiScore: number | null;
  aiRecommendation: string | null;
  aiReasoning: string | null;
  answers: Record<string, string>;
  archetype: string | null;
  archetypeScores: Record<string, number> | null;
  referredBy: string | null;
};

type StatusCounts = {
  pending: number;
  approved: number;
  rejected: number;
  hold: number;
};

function tabFromSearch(status: string | undefined): StatusTab {
  const s = (status ?? 'pending').toLowerCase();
  if (s === 'approved' || s === 'rejected' || s === 'all' || s === 'hold') return s;
  return 'pending';
}

function toQueueItem(row: ApiApplication): ApplicationsQueueItem {
  const rec = row.aiRecommendation;
  const allowed = new Set(['strong_yes', 'yes', 'unclear', 'no', 'strong_no']);
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    city: row.city,
    phone: row.phone,
    submittedAt: row.submittedAt,
    aiTags: row.aiTags ?? [],
    aiScore: row.aiScore,
    aiReasoning: row.aiReasoning,
    answers: row.answers ?? {},
    archetype: row.archetype ?? null,
    archetypeScores: row.archetypeScores ?? null,
    referredBy: row.referredBy ?? null,
    aiRecommendation:
      rec && allowed.has(rec) ? (rec as ApplicationsQueueItem['aiRecommendation']) : null,
  };
}

const TABS: { label: string; value: StatusTab }[] = [
  { label: 'Pending', value: 'pending' },
  { label: 'Hold', value: 'hold' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'All', value: 'all' },
];

function tabCount(tab: StatusTab, counts: StatusCounts): number | null {
  if (tab === 'pending') return counts.pending;
  if (tab === 'approved') return counts.approved;
  if (tab === 'rejected') return counts.rejected;
  if (tab === 'hold') return counts.hold;
  return null;
}

export default async function OperatorApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusParam } = await searchParams;
  const tab = tabFromSearch(statusParam);
  const res = await operatorServerFetch(
    `/api/operator/applications?status=${encodeURIComponent(tab)}`,
  );

  if (!res.ok) {
    return (
      <div className="px-4 py-16 text-center text-sm text-text-secondary">
        Unable to load applications. Refresh or sign in again.
      </div>
    );
  }

  const data = (await res.json()) as {
    applications: ApiApplication[];
    pendingCount: number;
    counts: StatusCounts;
  };
  const { applications, pendingCount, counts } = data;
  const queueItems = applications.map(toQueueItem);

  const { userId } = await auth();
  const tierNames = userId
    ? await getWorkspaceTierNames(await requireWorkspaceId(userId))
    : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 flex-col">
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              Applications
              <span className="rounded-full bg-primary px-2.5 py-0.5 text-sm font-medium tabular-nums text-primary-foreground">
                <LiveCount path="applications.pending" fallback={pendingCount} />
              </span>
            </span>
          }
          subtitle="Review, score, and decide. Pending first."
          action={
            <a
              href="/apply?demo=true"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              Preview form
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          }
        />

        <nav className="mb-6 flex flex-wrap gap-1 border-b border-border" aria-label="Filter applications">
          {TABS.map(({ label, value }) => {
            const active = tab === value;
            const count = tabCount(value, counts);
            const href =
              value === 'pending' ? '/operator/applications' : `/operator/applications?status=${value}`;
            const isHold = value === 'hold';
            return (
              <Link
                key={value}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'text-text-primary underline decoration-primary underline-offset-4'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                {label}
                {count != null && count > 0 ? (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold tabular-nums ${
                      isHold
                        ? 'bg-warning-soft text-warning'
                        : 'bg-muted text-text-secondary'
                    }`}
                  >
                    {value === 'pending' ? (
                      <LiveCount path="applications.pending" fallback={count} />
                    ) : value === 'hold' ? (
                      <LiveCount path="applications.hold" fallback={count} />
                    ) : value === 'approved' ? (
                      <LiveCount path="applications.approved" fallback={count} />
                    ) : value === 'rejected' ? (
                      <LiveCount path="applications.rejected" fallback={count} />
                    ) : (
                      count
                    )}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        {tab === 'hold' ? (
          <p className="mb-4 rounded border border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
            These applications matched a Red List entry and were placed on hold automatically. Review each one manually before approving or rejecting.
          </p>
        ) : null}

        <ApplicationsQueue key={tab} applications={queueItems} tierNames={tierNames} />
      </div>
    </div>
  );
}

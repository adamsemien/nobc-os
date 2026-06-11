'use client';

/** AudienceSummaryPanel — "Who's coming" / "Who came" CRM S-slice.
 *
 *  Placement: EventOverviewTab, below stat cards.
 *  Fetches: GET /api/operator/events/[id]/audience-summary
 *
 *  Interaction model:
 *    1. Five tappable bucket chips (Regulars / First-timers / Returning / At risk / Big spenders)
 *    2. Tapping a chip expands an inline member list (replaces, doesn't stack)
 *    3. Tapping a member name opens their record in a slide-over
 *       (event context preserved — no full page nav)
 *    4. Slide-over has its own × close; browser back returns to event page
 *
 *  Loading:  Skeleton rows (never a spinner)
 *  Empty:    Warm copy per spec — no cold fallback
 *  Error:    Warm copy — no raw error strings
 *
 *  Hard constraints enforced here:
 *    - No hex literals — semantic tokens via CSS custom properties only
 *    - No "RSVP" in any visible copy — "Access" / statusLabel as-is
 *    - No raw enum rendering — statusLabel comes pre-mapped from API
 *    - Link uses Next.js <Link>, not <a href>
 *    - Tenur seam: `data-tenur-slot` attribute on slide-over detail area;
 *      nothing built for Tenur here
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { Skeleton } from './Skeleton';
import { ArchetypeChip } from './ArchetypeChip';

// ─── Shared response contract (Spine implements) ────────────────────────────

type MemberStub = {
  memberId: string;
  firstName: string | null;
  lastName: string | null;
  statusLabel: string;
  archetype: string | null;
  buckets: string[];
  eventsAttended: number;
  lastSeenLabel: string | null;
};

type AudienceSummary = {
  eventId: string;
  phase: 'upcoming' | 'past';
  total: number;
  buckets: {
    regulars: number;
    firstTimers: number;
    returning: number;
    atRisk: number;
    bigSpenders: number;
  };
  members: MemberStub[];
};

// ─── Bucket metadata ─────────────────────────────────────────────────────────

type BucketKey = 'regulars' | 'firstTimers' | 'returning' | 'atRisk' | 'bigSpenders';

const BUCKET_LABELS: Record<BucketKey, string> = {
  regulars: 'Regulars',
  firstTimers: 'First-timers',
  returning: 'Returning',
  atRisk: 'At risk',
  bigSpenders: 'Big spenders',
};

const BUCKET_ORDER: BucketKey[] = [
  'regulars',
  'firstTimers',
  'returning',
  'atRisk',
  'bigSpenders',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function displayName(m: MemberStub): string {
  const parts = [m.firstName, m.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Member';
}

function membersInBucket(members: MemberStub[], bucket: BucketKey): MemberStub[] {
  return members.filter((m) => m.buckets.includes(bucket));
}

// ─── Slide-over ──────────────────────────────────────────────────────────────

type SlideOverProps = {
  member: MemberStub | null;
  onClose: () => void;
};

function MemberSlideOver({ member, onClose }: SlideOverProps) {
  const isOpen = member !== null;

  // Trap focus + close on Escape
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Focus the panel when it opens
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 40,
          background: 'rgba(0,0,0,0.35)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 240ms ease',
        }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={member ? `Member record: ${displayName(member)}` : 'Member record'}
        tabIndex={-1}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 50,
          width: '100%',
          maxWidth: '460px',
          background: 'var(--card)',
          borderLeft: '1px solid var(--border)',
          boxShadow: 'var(--card-shadow-hover)',
          display: 'flex',
          flexDirection: 'column',
          transform: isOpen ? 'translateX(0)' : 'translateX(110%)',
          transition: 'transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          outline: 'none',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex flex-col gap-0.5">
            <span
              className="text-base font-semibold"
              style={{
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
              }}
            >
              {member ? displayName(member) : ''}
            </span>
            {member && (
              <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                {member.statusLabel}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close member panel"
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-raised"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        {member && (
          <div className="flex-1 overflow-y-auto px-5 py-5">
            {/* Stat strip */}
            <div
              className="mb-5 flex gap-4 rounded-[8px] px-4 py-3"
              style={{ background: 'var(--crm-stat-bg)' }}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--crm-panel-label)' }}>
                  Events
                </span>
                <span className="text-lg font-light" style={{ color: 'var(--crm-panel-value)', fontFamily: 'var(--font-display)' }}>
                  {member.eventsAttended}
                </span>
              </div>
              {member.lastSeenLabel && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--crm-panel-label)' }}>
                    Last seen
                  </span>
                  <span className="text-[13px]" style={{ color: 'var(--crm-panel-value)' }}>
                    {member.lastSeenLabel}
                  </span>
                </div>
              )}
            </div>

            {/* Archetype */}
            {member.archetype && (
              <div className="mb-4 flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--crm-panel-label)' }}>
                  Archetype
                </span>
                <ArchetypeChip archetype={member.archetype} />
              </div>
            )}

            {/* Access groups this member is in */}
            {member.buckets.length > 0 && (
              <div className="mb-5">
                <p className="mb-2 text-[10px] uppercase tracking-widest" style={{ color: 'var(--crm-panel-label)' }}>
                  Audience groups
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {member.buckets.map((b) => (
                    <span
                      key={b}
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px]"
                      style={{
                        background: 'var(--crm-edge-chip-bg)',
                        color: 'var(--crm-edge-chip-fg)',
                        border: '1px solid var(--crm-panel-border)',
                      }}
                    >
                      {BUCKET_LABELS[b as BucketKey] ?? b}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Tenur seam — future relationship-context enrichment */}
            <div data-tenur-slot="member-record-enrichment" />

            {/* Full record link */}
            <div className="mt-6 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
              <Link
                href={`/operator/members/${member.memberId}`}
                className="inline-flex items-center gap-1.5 text-[12px] transition-colors hover:text-primary"
                style={{ color: 'var(--text-secondary)' }}
                onClick={onClose}
              >
                View full record →
              </Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

type Props = { eventId: string };

export function AudienceSummaryPanel({ eventId }: Props) {
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [data, setData] = useState<AudienceSummary | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [activeBucket, setActiveBucket] = useState<BucketKey | null>(null);
  const [selectedMember, setSelectedMember] = useState<MemberStub | null>(null);

  // Fetch on mount
  useEffect(() => {
    setFetchState('loading');
    fetch(`/api/operator/events/${eventId}/audience-summary`)
      .then(async (res) => {
        if (!res.ok) throw new Error('audience_fetch_failed');
        return res.json() as Promise<AudienceSummary>;
      })
      .then((d) => {
        setData(d);
        setFetchState('ok');
      })
      .catch((err) => {
        console.error('[AudienceSummaryPanel] fetch failed', err);
        setFetchState('error');
      });
  }, [eventId]);

  const handleChipClick = useCallback((bucket: BucketKey) => {
    setActiveBucket((prev) => (prev === bucket ? null : bucket));
  }, []);

  const handleMemberClick = useCallback((member: MemberStub) => {
    setSelectedMember(member);
  }, []);

  const handleCloseSlideOver = useCallback(() => {
    setSelectedMember(null);
  }, []);

  const panelTitle = data?.phase === 'past' ? 'Who came' : 'Who\'s coming';

  // Loading skeleton
  if (fetchState === 'loading') {
    return (
      <div
        className="rounded-[var(--radius-base)] border"
        style={{ background: 'var(--crm-panel-bg)', borderColor: 'var(--crm-panel-border)' }}
        aria-label="Loading audience summary"
        aria-busy="true"
      >
        <div className="px-5 py-4">
          <Skeleton className="mb-4 h-5 w-36" />
          <div className="flex flex-wrap gap-2">
            {BUCKET_ORDER.map((b) => (
              <Skeleton key={b} height={32} width={110} style={{ borderRadius: '9999px' }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (fetchState === 'error') {
    return (
      <div
        className="rounded-[var(--radius-base)] border px-5 py-5"
        style={{ background: 'var(--crm-panel-bg)', borderColor: 'var(--crm-panel-border)' }}
      >
        <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
          Couldn&rsquo;t load the audience right now — try refreshing.
        </p>
      </div>
    );
  }

  // Not yet fetched / idle
  if (!data) return null;

  // Empty — no confirmed members yet
  if (data.total === 0) {
    return (
      <div
        className="rounded-[var(--radius-base)] border px-5 py-5"
        style={{ background: 'var(--crm-panel-bg)', borderColor: 'var(--crm-panel-border)' }}
      >
        <p
          className="mb-1 text-[13px] font-medium"
          style={{ color: 'var(--text-primary)' }}
        >
          {panelTitle}
        </p>
        <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
          No confirmed access yet — check back once people are on the list.
        </p>
      </div>
    );
  }

  const activeBucketMembers =
    activeBucket !== null ? membersInBucket(data.members, activeBucket) : [];

  return (
    <>
      <div
        className="rounded-[var(--radius-base)] border"
        style={{ background: 'var(--crm-panel-bg)', borderColor: 'var(--crm-panel-border)' }}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-5 py-4">
          <h2
            className="text-[13px] font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            {panelTitle}
            <span
              className="ml-2 text-[12px] font-normal"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {data.total} total
            </span>
          </h2>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            aria-controls="audience-panel-body"
            className="flex items-center gap-1 text-[11px] transition-colors hover:text-primary"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {collapsed ? (
              <>expand <ChevronDown size={14} /></>
            ) : (
              <>collapse <ChevronUp size={14} /></>
            )}
          </button>
        </div>

        {/* Collapsible body */}
        {!collapsed && (
          <div id="audience-panel-body" className="px-5 pb-5">
            {/* Bucket chips row */}
            <div className="flex flex-wrap gap-2" role="group" aria-label="Audience segments">
              {BUCKET_ORDER.map((bucket) => {
                const count = data.buckets[bucket];
                const isActive = activeBucket === bucket;

                return (
                  <button
                    key={bucket}
                    type="button"
                    onClick={() => handleChipClick(bucket)}
                    aria-pressed={isActive}
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors"
                    style={
                      isActive
                        ? {
                            background: 'var(--crm-row-selected)',
                            borderColor: 'var(--crm-row-selected-border)',
                            color: 'var(--text-primary)',
                          }
                        : {
                            background: 'var(--crm-stat-bg)',
                            borderColor: 'var(--crm-row-divider)',
                            color: 'var(--text-secondary)',
                          }
                    }
                  >
                    <span
                      className="text-[13px] font-semibold tabular-nums"
                      style={{
                        color: isActive ? 'var(--primary)' : 'var(--text-primary)',
                      }}
                    >
                      {count}
                    </span>
                    {BUCKET_LABELS[bucket]}
                  </button>
                );
              })}
            </div>

            {/* Inline member list — replaces on chip change */}
            {activeBucket !== null && (
              <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--crm-row-divider)' }}>
                <p
                  className="mb-3 text-[11px] font-medium uppercase tracking-widest"
                  style={{ color: 'var(--crm-panel-label)' }}
                >
                  {BUCKET_LABELS[activeBucket]}
                </p>

                {activeBucketMembers.length === 0 ? (
                  <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
                    No members in this group yet.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {activeBucketMembers.map((m) => (
                      <li key={m.memberId}>
                        <button
                          type="button"
                          onClick={() => handleMemberClick(m)}
                          className="flex w-full items-center justify-between rounded-[6px] px-3 py-2 text-left transition-colors hover:bg-raised"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="truncate text-[13px] font-medium">
                              {displayName(m)}
                            </span>
                            <ArchetypeChip archetype={m.archetype} />
                          </div>
                          <div className="ml-4 flex shrink-0 flex-col items-end gap-0.5">
                            <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                              {/* statusLabel comes pre-mapped from API — display as-is */}
                              {m.statusLabel}
                            </span>
                            {m.lastSeenLabel && (
                              <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                                {m.lastSeenLabel}
                              </span>
                            )}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Member record slide-over — preserves event context */}
      <MemberSlideOver member={selectedMember} onClose={handleCloseSlideOver} />
    </>
  );
}

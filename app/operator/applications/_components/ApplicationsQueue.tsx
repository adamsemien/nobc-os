'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowLeft, Check, Clock, Loader2, Mail, MapPin, Phone, Search, X, XCircle } from 'lucide-react';
import { APPLY_QUESTIONS } from '@/lib/apply-config';
import { LEGACY_ANSWER_LABELS } from '@/lib/legacy-answer-labels';
import { DEFAULT_TIER_NAMES, type TierNames } from '@/lib/score-display';
import { isPortraitRef, portraitSrc } from '@/lib/apply-photo';
import { archetypeDisplayName } from '@/config/archetypes';
import { EmptyState } from '../../_components/EmptyState';
import { useTheme } from '../../_components/ThemeToggle';
import { Avatar } from '../../_components/Avatar';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { emitCountsRefresh } from '@/components/counts/CountsProvider';
import { logQAAction } from '@/lib/dev/qa-action-log';
import { CommentThread } from '@/components/comments/CommentThread';
import { WaxSealStamp } from './WaxSealStamp';

export type ApplicationsQueueItem = {
  id: string;
  fullName: string;
  email: string;
  city: string | null;
  phone: string | null;
  createdAt: string;
  submittedAt: string | null;
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
  answerLabels?: Record<string, string>;
  archetype: string | null;
  archetypeScores: Record<string, number> | null;
  referredBy: string | null;
  consentEmail: boolean;
  consentSms: boolean;
};

// Human-readable copy for bulk-approve failure reasons — never render the raw
// error code (e.g. 'not_submitted') the API returns.
const BULK_FAILURE_LABELS: Record<string, string> = {
  not_submitted: 'not submitted',
  already_approved: 'already approved',
  already_rejected: 'already rejected',
  not_found: 'not found',
};

const ANSWER_ORDER = new Map(
  APPLY_QUESTIONS.filter(q => q.storage === 'answer').map((q, i) => [q.key, i]),
);

const LEGACY_LABELS: Record<string, string> = {
  'BASICS.CITYNEIGHBORHOOD': 'city / neighborhood',
  'BASICS.CITY': 'city',
  'BASICS.NEIGHBORHOOD': 'neighborhood',
  'BASICS.FROMORIGINALLY': 'from originally',
  'BASICS.BIRTHDAY': 'birthday',
  'BASICS.LINKS': 'links',
  'BASICS.REFERRERS': 'referred by',
  'BASICS.PHONE': 'phone',
  'BASICS.EMAIL': 'email',
  'REAL.WORKINGON': "what they're working on",
  'REAL.OBSESSEDWITH': 'obsessed with',
  'REAL.ALWAYSCALLEDABOUT': 'what people call them about',
  'WORLD.MOSTINTERESTING': 'most interesting people in their life',
  'WORLD.CONNECTEDPEOPLE': 'a time they connected two people',
  'WORLD.COMMUNITYLOYALTY': "community they've stayed loyal to",
  'TASTE.PLACEDETAILS': 'place that gets the details right',
  'TASTE.TRUSTTASTE': 'whose taste they trust',
  'TASTE.RECOMMENDLIKE': "what they recommend like they're paid",
  'TASTE.SPLURGEVSSAVE': 'splurge vs save',
  'RAPID.KARAOKE': 'karaoke go-to',
  'RAPID.COFFEETABLE': 'coffee table',
  'RAPID.BUSYDAY': 'busy during the day',
  'RAPID.SUNDAY': 'sunday morning',
  'RAPID.SOCIALLINK': 'social link they revisit',
  'RAPID.MOSTDONTKNOW': "something most people don't know",
};

// Legacy/external keys (UPPER_SNAKE) that bypass APPLY_QUESTIONS but still
// need human-readable labels in the preview panel.
const QUESTION_LABELS: Record<string, string> = {
  WORK_WEBSITE: 'Website',
  IF_NOT_HERE: "If not here…",
  PASSION_PROJECTS: 'Passion projects',
  WHY_NOBC: 'Why No Bad Company',
  WHAT_YOU_DO: 'What you do',
  WHAT_BRING: 'What you bring',
  SUNDAY_MORNING: 'Sunday morning',
  KARAOKE_ORDER: 'Karaoke order',
  WHERE_FROM: "Where you're from",
  HOME_ADDRESS: 'Location',
  OBSESSED_WITH: 'Obsessed with',
  ALWAYS_CALLED_ABOUT: "What people call you about",
  COMMUNITY_LOYALTY: "Community you've stayed loyal to",
  COFFEE_TABLE: 'Coffee table',
  BUSY_DAY: 'Busy during the day',
  SOCIAL_LINK: 'Social link you revisit',
  MOST_DONT_KNOW: "Something most people don't know",
  PLACE_DETAILS: 'Place that gets the details right',
  TRUST_TASTE: 'Whose taste you trust',
  RECOMMEND_LIKE_PAID: "What you recommend like you're paid",
  SPLURGE_VS_SAVE: 'Splurge vs save',
  CONNECTED_PEOPLE: 'A time you connected two people',
  MOST_INTERESTING: 'Most interesting people in your life',
  LEARNED_THIS_YEAR: 'Learned this year',
  GREAT_ENERGY: 'Where you bring great energy',
  MEET_PEOPLE: 'Who you want to meet',
};

/** Snake/UPPER_SNAKE → "Sentence case" fallback. Used when a key isn't
 *  in APPLY_QUESTIONS, LEGACY_LABELS, or QUESTION_LABELS — keeps the
 *  panel from ever showing a raw DB key. */
function prettyKey(key: string): string {
  const cleaned = key.replace(/^_+/, '').replace(/[._]+/g, ' ').trim();
  if (!cleaned) return key;
  const lower = cleaned.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function labelForKey(key: string): string {
  return (
    APPLY_QUESTIONS.find(q => q.key === key)?.label ??
    LEGACY_LABELS[key] ??
    QUESTION_LABELS[key] ??
    LEGACY_ANSWER_LABELS[key] ??
    prettyKey(key)
  );
}

/** `_photos` and any other underscore-prefixed key is system metadata,
 *  not a Q&A row — never render them in the answers list. */
function isSystemKey(key: string): boolean {
  return key.startsWith('_');
}

/** Keys that have their own UI section (photo strip, referrers chip, consents)
 *  and must never leak into the Q&A answers list as raw JSON/booleans. */
const HIDDEN_ANSWER_KEYS = new Set([
  'photos.urls',
  'personalityUpload',
  'basics.referrers',
  'consentMembershipRead',
  'consentPhotos',
  'consentEmail',
  'consentSms',
]);

/** Parse the JSON-encoded photo array. The live form stores it under
 *  `photos.urls`; older seed rows used the synthetic `_photos` key. Each entry
 *  is a private R2 key (served via the presign proxy) or a full URL
 *  (legacy/demo). Returns up to 5 renderable `<img src>` values. */
function readPhotos(answers: Record<string, string>): string[] {
  const raw = answers['photos.urls'] ?? answers._photos;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPortraitRef).map(portraitSrc).slice(0, 5);
  } catch {
    return [];
  }
}

/** The optional personality-test upload (image or PDF): a private R2 key served
 *  through the presign proxy. null when absent or not a workspace ref. */
function readPersonalityFile(
  answers: Record<string, string>,
): { href: string; isPdf: boolean } | null {
  const raw = answers['personalityUpload'];
  if (!raw || !isPortraitRef(raw)) return null;
  return { href: portraitSrc(raw), isPdf: raw.toLowerCase().endsWith('.pdf') };
}

function parseReferrer(v: string): string {
  if (v.trimStart().startsWith('[')) {
    try {
      const arr = JSON.parse(v) as unknown[];
      const names = arr.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
      if (names.length) return names.join(', ');
    } catch {
      // fall through
    }
  }
  return v;
}

function getReferrers(app: ApplicationsQueueItem): string[] {
  const result: string[] = [];
  if (app.referredBy?.trim()) result.push(app.referredBy.trim());
  // Live form stores referrers as a JSON array under basics.referrers.
  const basicsReferrers = app.answers['basics.referrers'];
  if (basicsReferrers) {
    const cleaned = parseReferrer(basicsReferrers);
    if (cleaned.trim()) result.push(...cleaned.split(', ').filter(Boolean));
  }
  for (const key of ['referrer2', 'referrer3', 'referrer4']) {
    const v = String(app.answers[key] ?? '').trim();
    if (v) result.push(parseReferrer(v));
  }
  return result;
}

function displayAnswerValue(value: string): string {
  if (value.trimStart().startsWith('[')) {
    try {
      const arr = JSON.parse(value) as unknown[];
      const names = arr.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
      if (names.length) return names.join(', ');
    } catch {
      // fall through
    }
  }
  return value;
}

function formatRecommendationLabel(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function formatSubmitted(iso: string | null): string {
  if (!iso) return 'Not submitted';
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

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function recommendationBadgeVars(
  rec: ApplicationsQueueItem['aiRecommendation'],
): { background: string; color: string } | null {
  switch (rec) {
    case 'strong_yes':
      return { background: 'var(--success)', color: 'var(--on-primary)' };
    case 'yes':
      return { background: 'var(--success-soft)', color: 'var(--success)' };
    case 'unclear':
      return { background: 'var(--warning-soft)', color: 'var(--warning)' };
    case 'no':
      return { background: 'var(--danger-soft)', color: 'var(--danger)' };
    case 'strong_no':
      return { background: 'var(--danger)', color: 'var(--on-primary)' };
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
  tierNames?: TierNames;
};

export function ApplicationsQueue({
  applications: initialApplications,
  tierNames = DEFAULT_TIER_NAMES,
}: Props) {
  const [applications, setApplications] = useState(initialApplications);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialApplications[0]?.id ?? null,
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'approve' | 'reject' | 'waitlist' | 'hold' | null>(null);
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [searchRaw, setSearchRaw] = useState('');
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'score' | 'alpha'>('newest');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingBulkAction, setPendingBulkAction] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState<'reject' | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [hideIncomplete, setHideIncomplete] = useState(false);
  const [confirmUnsubmittedApprove, setConfirmUnsubmittedApprove] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const selectedIdRef = useRef(selectedId);
  const visibleAppsRef = useRef<ApplicationsQueueItem[]>([]);
  const postActionRef = useRef<(id: string, path: 'approve' | 'reject' | 'waitlist' | 'hold') => void>(() => {});

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchRaw), 300);
    return () => window.clearTimeout(t);
  }, [searchRaw]);

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

  const visibleApps = useMemo(() => {
    let result = applications;
    if (hideIncomplete) {
      result = result.filter(app => app.submittedAt !== null);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(app =>
        app.fullName.toLowerCase().includes(q) ||
        app.email.toLowerCase().includes(q) ||
        app.city?.toLowerCase().includes(q) ||
        getReferrers(app).join(' ').toLowerCase().includes(q) ||
        Object.values(app.answers).join(' ').toLowerCase().includes(q)
      );
    }
    const sorted = [...result];
    switch (sortOrder) {
      case 'oldest':
        sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case 'score':
        sorted.sort((a, b) => (b.aiScore ?? -1) - (a.aiScore ?? -1));
        break;
      case 'alpha':
        sorted.sort((a, b) => a.fullName.localeCompare(b.fullName));
        break;
      default:
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return sorted;
  }, [applications, hideIncomplete, search, sortOrder]);

  useEffect(() => { visibleAppsRef.current = visibleApps; }, [visibleApps]);

  const selected = useMemo(
    () => applications.find(a => a.id === selectedId) ?? null,
    [applications, selectedId],
  );

  const removeAndNotify = useCallback((id: string, message: string) => {
    setApplications(prev => {
      const next = prev.filter(a => a.id !== id);
      setSelectedId(old => {
        if (old !== id) return old;
        const visibles = visibleAppsRef.current.filter(a => a.id !== id);
        return visibles[0]?.id ?? null;
      });
      return next;
    });
    setReviewNote('');
    setFlash({ type: 'success', message });
    setSheetOpen(false);
    window.setTimeout(() => setFlash(null), 4000);
  }, []);

  const postAction = useCallback(
    async (
      id: string,
      path: 'approve' | 'reject' | 'waitlist' | 'hold',
      opts?: { confirmUnsubmitted?: boolean },
    ) => {
      setFlash(null);
      setPendingAction(path);
      try {
        const res = await fetch(`/api/operator/applications/${id}/${path}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            note: reviewNote,
            confirmUnsubmitted: opts?.confirmUnsubmitted === true,
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `Request failed (${res.status})`);
        }
        const actedName = applications.find(a => a.id === id)?.fullName ?? 'Application';
        const nextName = visibleAppsRef.current.filter(a => a.id !== id)[0]?.fullName ?? null;
        const verb: Record<typeof path, string> = {
          approve: 'approved',
          reject: 'rejected',
          waitlist: 'waitlisted',
          hold: 'moved to hold',
        };
        const message = nextName
          ? `${actedName} ${verb[path]} — now reviewing ${nextName}`
          : `${actedName} ${verb[path]} — no applications left to review`;
        removeAndNotify(id, message);
        emitCountsRefresh();
        logQAAction(`application ${path} (queue)`);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Something went wrong. Try again.';
        setFlash({ type: 'error', message });
      } finally {
        setPendingAction(null);
      }
    },
    [applications, removeAndNotify, reviewNote],
  );

  useEffect(() => { postActionRef.current = postAction; }, [postAction]);

  // A never-submitted draft (submittedAt === null) requires an explicit "approve
  // anyway" confirmation before postAction fires — the server-side guard in
  // approveApplication() is the real boundary, this just avoids a fat-finger.
  const requestApprove = useCallback(
    (id: string) => {
      const app = applications.find(a => a.id === id);
      if (app && app.submittedAt === null) {
        setConfirmUnsubmittedApprove(id);
        return;
      }
      postAction(id, 'approve');
    },
    [applications, postAction],
  );
  const requestApproveRef = useRef(requestApprove);
  useEffect(() => { requestApproveRef.current = requestApprove; }, [requestApprove]);

  const bulkAction = useCallback(async (action: 'approve' | 'reject' | 'hold') => {
    setPendingBulkAction(action);
    const ids = Array.from(selectedIds);
    try {
      const res = await fetch('/api/operator/applications/bulk', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        succeeded?: number;
        failed?: number;
        failures?: { id: string; error?: string }[];
      };
      const succeededIds = ids.filter(id => !(data.failures ?? []).some(f => f.id === id));
      const failCount = data.failed ?? Math.max(0, ids.length - (data.succeeded ?? 0));
      setApplications(prev => prev.filter(a => !succeededIds.includes(a.id)));
      setSelectedIds(new Set());
      logQAAction(`bulk ${action} ${succeededIds.length} application(s)`);
      const label = action === 'approve' ? 'approved' : action === 'hold' ? 'moved to hold' : 'rejected';
      // Never surface a raw error code (e.g. 'not_submitted') — map to a short,
      // human-readable reason when every failure shares one; mixed reasons keep
      // the generic summary rather than building a multi-reason list.
      const failReasons = new Set((data.failures ?? []).map(f => f.error));
      const reasonLabel = failReasons.size === 1
        ? (BULK_FAILURE_LABELS[[...failReasons][0] as string] ?? 'error')
        : null;
      const msg = failCount === 0
        ? `${succeededIds.length} application${succeededIds.length !== 1 ? 's' : ''} ${label}.`
        : `${succeededIds.length} ${label}; ${failCount} failed (${reasonLabel ?? 'already processed or error'}).`;
      setFlash({ type: failCount === 0 ? 'success' : 'error', message: msg });
      emitCountsRefresh();
    } catch {
      setFlash({ type: 'error', message: 'Network error. Try again.' });
    } finally {
      setPendingBulkAction(null);
      window.setTimeout(() => setFlash(null), 4000);
    }
  }, [selectedIds]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (e.key === '/') {
        if (!isInput) { e.preventDefault(); searchRef.current?.focus(); }
        return;
      }
      if (isInput) return;
      const apps = visibleAppsRef.current;
      const cur = selectedIdRef.current;
      const idx = apps.findIndex(a => a.id === cur);
      if (e.key === 'j') { const n = apps[Math.min(idx + 1, apps.length - 1)]; if (n) setSelectedId(n.id); }
      else if (e.key === 'k') { const p = apps[Math.max(idx - 1, 0)]; if (p) setSelectedId(p.id); }
      else if (e.key === 'a' && cur) requestApproveRef.current(cur);
      else if (e.key === 'h' && cur) postActionRef.current(cur, 'hold');
      else if (e.key === 'r' && cur) postActionRef.current(cur, 'reject');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // no deps — uses refs

  const headingFont: CSSProperties = {
    fontFamily: 'var(--font-display)',
  };

  if (applications.length === 0) {
    return (
      <EmptyState
        icon="applications"
        title="nothing pending."
        body="you're caught up."
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
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

      <div className="grid min-h-0 min-w-0 flex-1 gap-5 overflow-hidden lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-8">
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden border-border lg:border-r lg:pr-1">
          {selectedIds.size > 0 && (
            <div
              className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm"
              style={{ borderRadius: '8px' }}
            >
              <span className="text-text-secondary">{selectedIds.size} selected</span>
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => bulkAction('hold')}
                  disabled={!!pendingBulkAction}
                  className="rounded px-2 py-1 text-xs font-medium text-text-secondary hover:bg-muted disabled:opacity-50"
                >
                  Hold
                </button>
                <button
                  onClick={() => bulkAction('approve')}
                  disabled={!!pendingBulkAction}
                  className="rounded px-2 py-1 text-xs font-medium text-success hover:bg-muted disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => setConfirmBulk('reject')}
                  disabled={!!pendingBulkAction}
                  className="rounded px-2 py-1 text-xs font-medium text-danger hover:bg-muted disabled:opacity-50"
                >
                  Reject
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="rounded px-2 py-1 text-xs text-text-muted hover:bg-muted"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          <div className="mb-3 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search applicants..."
                value={searchRaw}
                onChange={e => setSearchRaw(e.target.value)}
                className="w-full rounded-md border border-border bg-surface py-2 pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
                style={{ borderRadius: '6px' }}
              />
            </div>
            <select
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value as typeof sortOrder)}
              className="rounded-md border border-border bg-surface px-2 py-2 text-sm text-text-secondary focus:outline-none"
              style={{ borderRadius: '6px' }}
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="score">Score</option>
              <option value="alpha">A–Z</option>
            </select>
          </div>

          <label className="mb-3 flex items-center gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={hideIncomplete}
              onChange={e => setHideIncomplete(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border accent-primary"
            />
            Hide incomplete
          </label>

          <ul className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pb-4 pr-0.5">
            {visibleApps.map(app => {
              const active = app.id === selectedId;
              const badge = recommendationBadgeVars(app.aiRecommendation);
              const refs = getReferrers(app);
              const isChecked = selectedIds.has(app.id);
              const worth = app.archetypeScores ? memberWorthScores(app.archetypeScores) : null;
              const tier = worth ? memberTier(worth.total, tierNames) : null;
              return (
                <li key={app.id} className="group relative">
                  <div className={`absolute left-2 top-2 z-10 transition-opacity ${isChecked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={e => {
                        e.stopPropagation();
                        setSelectedIds(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(app.id); else next.delete(app.id);
                          return next;
                        });
                      }}
                      className="h-4 w-4 rounded border-border accent-primary"
                      onClick={e => e.stopPropagation()}
                    />
                  </div>
                  <a
                    href={`/operator/applications/${app.id}`}
                    className="absolute right-2 top-2 z-20 inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium opacity-0 transition-opacity group-hover:opacity-100"
                    style={{
                      color: 'var(--text-muted)',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                    }}
                    aria-label={`View ${app.fullName}`}
                    onClick={e => e.stopPropagation()}
                  >
                    View →
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(app.id);
                      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
                        setSheetOpen(true);
                      }
                    }}
                    className={`obs-app-button min-w-0 w-full rounded-lg border px-3 py-3 text-left transition-colors lg:px-4 ${
                      active
                        ? 'obs-app-active border-border bg-surface-elevated shadow-sm ring-1 ring-border'
                        : 'border-transparent bg-surface hover:bg-surface-elevated'
                    }`}
                    style={{ borderRadius: '8px', position: 'relative' }}
                  >
                    <div className="flex items-center gap-2">
                      <Avatar name={app.fullName} email={app.email} size={28} />
                      <p className="obs-app-name truncate font-medium text-text-primary" style={headingFont}>
                        {app.fullName}
                      </p>
                    </div>
                    <span
                      className="obs-score-badge"
                      aria-hidden="true"
                    >
                      {worth ? worth.total : ''}
                    </span>
                    <p className="obs-app-meta mt-0.5 text-xs text-text-muted">
                      {[app.city, formatRelative(app.createdAt)].filter(Boolean).join(' · ')}
                    </p>
                    {app.archetype && (
                      <span
                        className="obs-app-archetype mt-1.5 inline-block rounded border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-text-secondary"
                        style={{ borderRadius: '4px' }}
                      >
                        {archetypeDisplayName(app.archetype)}
                      </span>
                    )}
                    {refs.length > 0 && (
                      <p className="mt-1 truncate text-[11px] text-text-muted">via {refs.join(', ')}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {badge && app.aiRecommendation ? (
                        <span
                          className="inline-flex max-w-full items-center rounded border border-border px-2.5 py-1 text-[11px] font-semibold leading-tight shadow-sm ring-1 ring-border/60"
                          style={{ borderRadius: '6px', background: badge.background, color: badge.color }}
                        >
                          <span className="truncate">{formatRecommendationLabel(app.aiRecommendation)}</span>
                        </span>
                      ) : null}
                      {app.submittedAt === null ? (
                        <span className="inline-flex rounded border border-dashed border-border bg-muted px-2.5 py-1 text-[11px] font-medium text-text-secondary">
                          Not submitted
                        </span>
                      ) : worth ? (
                        <span className="inline-flex items-center gap-1 text-[11px]">
                          <span className="font-semibold tabular-nums text-text-primary">{Math.round((worth.total / 30) * 100)}</span>
                          <span className={`font-medium ${tier!.className}`}>· {tier!.label}</span>
                        </span>
                      ) : (!badge && !app.aiRecommendation ? (
                        <span className="inline-flex rounded border border-dashed border-border bg-muted px-2.5 py-1 text-[11px] font-medium text-text-secondary">
                          No AI review yet
                        </span>
                      ) : null)}
                    </div>
                    <div
                      className="obs-score-bar mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                      style={{ borderRadius: '4px' }}
                      aria-label="AI fit score"
                    >
                      <div
                        className="h-full rounded-full bg-primary transition-[width]"
                        style={{
                          borderRadius: '4px',
                          width: worth ? `${Math.round((worth.total / 30) * 100)}%` : '0%',
                        }}
                      />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="mt-2 select-none text-[10px] text-text-muted opacity-60">
            j/k navigate · a approve · h hold · r reject · / search
          </p>
        </div>

        <div className="hidden min-h-0 min-w-0 flex-col overflow-hidden lg:flex">
          {selected ? (
            <DetailPanel
              app={selected}
              headingFont={headingFont}
              pendingAction={pendingAction}
              flash={flash}
              reviewNote={reviewNote}
              onNoteChange={setReviewNote}
              onApprove={() => requestApprove(selected.id)}
              onReject={() => postAction(selected.id, 'reject')}
              onWaitlist={() => postAction(selected.id, 'waitlist')}
              onHold={() => postAction(selected.id, 'hold')}
              tierNames={tierNames}
            />
          ) : null}
        </div>
      </div>

      {confirmBulk === 'reject' ? (
        <ConfirmModal
          title={`Reject ${selectedIds.size} application${selectedIds.size === 1 ? '' : 's'}?`}
          subtitle="This sends a rejection email and cannot be undone."
          confirmLabel="Reject all"
          confirmTone="danger"
          busy={pendingBulkAction === 'reject'}
          onCancel={() => setConfirmBulk(null)}
          onConfirm={async () => {
            setConfirmBulk(null);
            await bulkAction('reject');
          }}
        />
      ) : null}

      {confirmUnsubmittedApprove ? (
        <ConfirmModal
          title="Approve an application that was never submitted?"
          subtitle="This application was never submitted - it has not been AI-scored and some fields may be incomplete. Approving now still creates a full member record."
          confirmLabel="Approve anyway"
          confirmTone="danger"
          busy={pendingAction === 'approve'}
          onCancel={() => setConfirmUnsubmittedApprove(null)}
          onConfirm={async () => {
            const id = confirmUnsubmittedApprove;
            setConfirmUnsubmittedApprove(null);
            await postAction(id, 'approve', { confirmUnsubmitted: true });
          }}
        />
      ) : null}

      {sheetOpen && selected ? (
        <div
          className="fixed inset-x-0 top-0 z-50 flex h-[100dvh] flex-col lg:hidden"
          style={{ backgroundColor: 'color-mix(in srgb, var(--foreground) 18%, var(--background))' }}
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
          <div className="min-h-0 flex-1 bg-background px-4 py-4">
            <DetailPanel
              app={selected}
              headingFont={headingFont}
              pendingAction={pendingAction}
              flash={flash}
              reviewNote={reviewNote}
              onNoteChange={setReviewNote}
              onApprove={() => requestApprove(selected.id)}
              onReject={() => postAction(selected.id, 'reject')}
              onWaitlist={() => postAction(selected.id, 'waitlist')}
              onHold={() => postAction(selected.id, 'hold')}
              tierNames={tierNames}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Archetype scores are stored 0–100 (see lib/scoring.ts). Some dev-seed rows
 *  stored them as 0–1 fractions; coerce either form to a 0–100 integer so the
 *  UI never renders a raw float and bars fill correctly. Values in (0,1] are
 *  read as fractions. */
function scorePct(raw: number | undefined | null): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
  const scaled = n > 0 && n <= 1 ? n * 100 : n;
  return Math.round(Math.min(100, Math.max(0, scaled)));
}

function memberWorthScores(scores: Record<string, number>): { influence: number; contribution: number; activation: number; total: number } {
  const get = (k: string) => scorePct(scores[k]);
  // Reads both the current cast (Sage/Spark) and the retired cast (Curator/Maker);
  // a row only carries one cast's keys, so the other reads 0 and the 0-30 scale holds.
  const influence = Math.round((get('Connector') + get('Curator') + get('Sage')) / 20);
  const contribution = Math.round((get('Builder') + get('Maker') + get('Spark')) / 20);
  const activation = Math.round((get('Host') + get('Patron')) / 20);
  const total = influence + contribution + activation;
  return { influence, contribution, activation, total };
}

function memberTier(
  total: number,
  names: TierNames = DEFAULT_TIER_NAMES,
): { label: string; className: string } {
  if (total >= 22) return { label: names.top, className: 'text-success' };
  if (total >= 16) return { label: names.mid, className: 'text-text-secondary' };
  return { label: names.low, className: 'text-danger' };
}

function DetailPanel({
  app,
  headingFont,
  pendingAction,
  flash,
  reviewNote,
  onNoteChange,
  onApprove,
  onReject,
  onWaitlist,
  onHold,
  tierNames = DEFAULT_TIER_NAMES,
}: {
  app: ApplicationsQueueItem;
  headingFont: CSSProperties;
  pendingAction: 'approve' | 'reject' | 'waitlist' | 'hold' | null;
  flash: { type: 'success' | 'error'; message: string } | null;
  reviewNote: string;
  onNoteChange: (v: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onWaitlist: () => void;
  onHold: () => void;
  tierNames?: TierNames;
}) {
  const { theme } = useTheme();
  const approveBtnRef = useRef<HTMLButtonElement>(null);
  // Hide system-metadata keys (`_photos`) and keys with their own UI section
  // (photo strip, referrers chip, consents) so they never leak as raw JSON or
  // booleans into the Q&A list.
  const entries = orderedAnswerEntries(app.answers).filter(
    ([k]) => !isSystemKey(k) && !HIDDEN_ANSWER_KEYS.has(k),
  );
  const photos = readPhotos(app.answers);
  const personalityFile = readPersonalityFile(app.answers);

  const [showEasterEgg, setShowEasterEgg] = useState(false);
  const [eggVisible, setEggVisible] = useState(false);
  const [eggLine, setEggLine] = useState(0);
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showScoringKey, setShowScoringKey] = useState(false);

  const handleApprove = () => {
    onApprove();
    if (theme === 'rose') {
      const btn = approveBtnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const colors = ['#c45c3a','#fef0e8','#ede8df','#f7ede3','#c45c3a','#fef0e8','#ede8df','#f7ede3'];
      colors.forEach((color, i) => {
        const el = document.createElement('div');
        const cx = (Math.random() - 0.5) * 120;
        const cy = -(80 + Math.random() * 80);
        el.style.cssText = `
          position:fixed;
          left:${rect.left + rect.width / 2}px;
          top:${rect.top + rect.height / 2}px;
          width:7px;height:7px;
          background:${color};
          pointer-events:none;
          z-index:9999;
          border-radius:1px;
          animation:rose-confetti-burst 1200ms ease-out ${i * 60}ms forwards;
          --cx:${cx}px;--cy:${cy}px;
        `;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1200 + i * 60 + 100);
      });
    }
  };

  const handleNameClick = () => {
    clickCountRef.current += 1;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      clickCountRef.current = 0;
    }, 500);
    if (clickCountRef.current >= 3) {
      clickCountRef.current = 0;
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      setShowEasterEgg(true);
    }
  };

  useEffect(() => {
    if (!showEasterEgg) {
      setEggVisible(false);
      setEggLine(0);
      return;
    }
    const t0 = setTimeout(() => setEggVisible(true), 10);
    const t1 = setTimeout(() => setEggLine(1), 400);
    const t2 = setTimeout(() => setEggLine(2), 1100);
    const t3 = setTimeout(() => setEggLine(3), 1800);
    const t4 = setTimeout(() => {
      setEggVisible(false);
      setTimeout(() => setShowEasterEgg(false), 500);
    }, 3800);
    return () => [t0, t1, t2, t3, t4].forEach(clearTimeout);
  }, [showEasterEgg]);

  return (
    // Independent scroll: panel takes full available height of the parent grid cell
    // and scrolls on its own. `min-h-0` is critical inside a flex/grid parent so the
    // child can actually grow to fill and then clip — without it the scroll silently
    // breaks and the bottom of the answer list disappears under the action footer.
    <div
      className="@container flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-lg border border-border bg-surface-elevated p-4 sm:p-6"
      style={{ borderRadius: '8px' }}
    >
      {showEasterEgg && (
        <div
          onClick={() => setShowEasterEgg(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9998,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32,
            background: eggVisible ? 'rgba(0,0,0,0.95)' : 'rgba(0,0,0,0)',
            transition: 'background 400ms ease',
            cursor: 'pointer',
          }}
        >
          {(['you built something real.', 'no bad company.', '— adam & chloe 🖤'] as const).map((line, i) => (
            <p key={i} style={{
              fontFamily: "'PP Editorial New', Georgia, serif",
              fontStyle: 'italic',
              color: '#ffffff',
              fontSize: 'clamp(20px, 3vw, 36px)',
              margin: 0,
              opacity: eggLine > i ? 1 : 0,
              transition: 'opacity 600ms ease',
            }}>
              {line}
            </p>
          ))}
        </div>
      )}
      <h2
        className="truncate text-2xl font-semibold text-text-primary sm:text-3xl"
        style={{ ...headingFont, cursor: 'default' }}
        onClick={handleNameClick}
      >
        {app.fullName}
      </h2>

      {typeof app.aiScore === 'number' && (
        <div className="mt-5 flex items-baseline gap-3">
          <span
            className="text-3xl font-semibold tabular-nums text-text-primary sm:text-4xl"
            style={headingFont}
          >
            {(app.aiScore * 10).toFixed(1)}
          </span>
          <span className="text-sm text-text-muted">
            / 10 AI score · {Math.round(app.aiScore * 100)}%
          </span>
        </div>
      )}

      {app.aiReasoning ? (
        <div className="mt-5 rounded-lg border border-border bg-muted p-4 shadow-sm sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">AI reasoning</p>
          <p className="mt-3 text-lg font-medium leading-[1.55] text-text-primary sm:text-xl">
            {app.aiReasoning}
          </p>
        </div>
      ) : null}

      <dl className="mt-6 flex flex-col gap-3 text-sm text-text-secondary @lg:flex-row @lg:flex-wrap @lg:items-start @lg:gap-x-10 @lg:gap-y-3">
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

      {(app.archetype || app.archetypeScores) && (
        <div className="mt-5 rounded-lg border border-border bg-muted p-4 sm:p-5" style={{ borderRadius: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">AI profile</p>
            <button
              type="button"
              onClick={() => setShowScoringKey(v => !v)}
              aria-label="How scores work"
              style={{
                width: 14, height: 14, borderRadius: '50%',
                background: 'var(--border)', border: 'none',
                color: 'var(--text-secondary)', cursor: 'pointer',
                fontSize: 9, fontWeight: 700, lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, padding: 0,
              }}
            >?</button>
          </div>
          {showScoringKey && (
            <div
              style={{
                marginTop: 10,
                padding: '10px 12px',
                borderRadius: 6,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                fontSize: 11,
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
              }}
            >
              <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>AI profile — how we score</p>
              <p style={{ marginBottom: 4 }}><span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>archetype</span> — which of the 6 types best describes this person. confidence shown as a percentage.</p>
              <p style={{ marginBottom: 4 }}><span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>influence</span> /10 — social reach, content, what people come to them for</p>
              <p style={{ marginBottom: 4 }}><span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>contribution</span> /10 — how they show up for others, intros, community</p>
              <p style={{ marginBottom: 10 }}><span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>activation</span> /10 — engagement signals, energy, rapid fire answers</p>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>total out of 30</p>
              <p style={{ marginBottom: 2 }}><span style={{ color: 'var(--accent)', fontWeight: 600 }}>22+</span> — charter candidate. rare. move fast.</p>
              <p style={{ marginBottom: 2 }}><span style={{ fontWeight: 500 }}>16–21</span> — standard member. good fit.</p>
              <p style={{ marginBottom: 8 }}><span style={{ color: 'var(--text-tertiary)' }}>below 16</span> — waitlist or pass.</p>
              <p><span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>ai recommendation</span> — strong yes / yes / unclear / no / strong no</p>
            </div>
          )}

          {app.archetype && (
            <p className="mt-2 text-lg font-semibold text-text-primary">{archetypeDisplayName(app.archetype)}</p>
          )}

          {app.archetypeScores && (() => {
            const worth = memberWorthScores(app.archetypeScores!);
            const tier = memberTier(worth.total, tierNames);
            return (
              <>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {([
                    { label: 'Influence', value: worth.influence },
                    { label: 'Contribution', value: worth.contribution },
                    { label: 'Activation', value: worth.activation },
                  ] as const).map(({ label, value }) => (
                    <div key={label} className="rounded border border-border bg-surface p-2" style={{ borderRadius: '6px' }}>
                      <p className="text-xl font-semibold tabular-nums text-text-primary">{value}</p>
                      <p className="text-[10px] text-text-muted">{label}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm tabular-nums text-text-secondary">{Math.round((worth.total / 30) * 100)}</span>
                  <span className={`text-sm font-semibold ${tier.className}`}>· {tier.label}</span>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 @2xl:grid-cols-2">
                  {['Connector', 'Host', 'Builder', 'Patron', 'Sage', 'Spark'].map(name => {
                    const v = scorePct(app.archetypeScores![name]);
                    return (
                      <div key={name} className="flex items-center gap-2">
                        <span className="w-20 shrink-0 text-[10px] text-text-muted">{archetypeDisplayName(name)}</span>
                        <div className="flex-1 overflow-hidden rounded-full bg-border" style={{ height: 4 }}>
                          <div
                            className="h-full rounded-full bg-primary transition-[width]"
                            style={{ width: `${v}%` }}
                          />
                        </div>
                        <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-text-muted">
                          {v}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {theme === 'parchment' && app.archetypeScores && (() => {
        const worth = memberWorthScores(app.archetypeScores!);
        if (worth.total < 22) return null;
        return <WaxSealStamp />;
      })()}

      {photos.length > 0 && (
        <section className="mt-6 border-t border-border pt-6">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Photos</h3>
          <div className="mt-3 flex flex-wrap gap-3">
            {photos.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt={`${app.fullName} photo ${i + 1}`}
                className="h-28 w-28 rounded-md object-cover @xl:h-36 @xl:w-36"
                style={{ border: '1px solid var(--border)' }}
              />
            ))}
          </div>
        </section>
      )}

      {personalityFile && (
        <section className="mt-6 border-t border-border pt-6">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            Personality test
          </h3>
          <div className="mt-3">
            {personalityFile.isPdf ? (
              <a
                href={personalityFile.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-text-primary underline underline-offset-2"
              >
                View PDF →
              </a>
            ) : (
              <a href={personalityFile.href} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={personalityFile.href}
                  alt={`${app.fullName} personality test`}
                  className="h-28 w-28 rounded-md object-cover @xl:h-36 @xl:w-36"
                  style={{ border: '1px solid var(--border)' }}
                />
              </a>
            )}
          </div>
        </section>
      )}

      <section className="mt-8 border-t border-border pt-6">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Answers</h3>
        <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-6 @xl:grid-cols-2">
          {entries
            .filter(([, v]) => v.trim())
            .map(([key, value]) => {
              const label = app.answerLabels?.[key] ?? labelForKey(key);
              const display = displayAnswerValue(value);
              // Long-form prose spans the full panel width; short fields (City,
              // Neighborhood, …) flow two-up so the wide panel isn't half-empty.
              const isLong = display.includes('\n') || display.length > 60;
              // Tracked uppercase reads fine for short field names but gets heavy
              // once a header is a full question sentence (In-A-Room prompts).
              const isLongLabel = label.length > 28;
              return (
                <div key={key} className={`min-w-0${isLong ? ' @xl:col-span-2' : ''}`}>
                  <p
                    className={
                      isLongLabel
                        ? 'text-[11px] font-medium text-text-muted'
                        : 'text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted'
                    }
                  >
                    {label}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-[15px] font-medium leading-relaxed text-text-primary">
                    {display}
                  </p>
                </div>
              );
            })}
          {entries.filter(([, v]) => v.trim()).length === 0 && (
            <p className="text-sm italic text-text-muted @xl:col-span-2">
              No answers recorded for this application.
            </p>
          )}
        </div>
      </section>

      <section className="mt-8 border-t border-border pt-6">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Consents</h3>
        <ul className="mt-3 space-y-2">
          {([
            { label: 'Email me about programming', checked: app.consentEmail },
            { label: 'Text me for urgent event coordination', checked: app.consentSms },
          ] as const).map(({ label, checked }) => (
            <li key={label} className="flex items-center gap-2 text-sm">
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${
                  checked ? 'border-primary bg-primary' : 'border-border'
                }`}
                aria-hidden
              >
                {checked && <Check className="h-3 w-3" strokeWidth={3} style={{ color: 'var(--on-primary)' }} />}
              </span>
              <span className={checked ? 'text-text-primary' : 'text-text-muted'}>{label}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Saved team comments — persisted, attributed, visible to everyone. */}
      <CommentThread entityType="application" entityId={app.id} />

      {/* Decision note — NOT a saved comment. Attached to the next decision
          (approve/reject/waitlist) and recorded with that action; cleared once
          you act. Distinct from the team comments above. */}
      <div className="mt-6">
        <label
          htmlFor="review-note"
          className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted"
        >
          Decision note
        </label>
        <textarea
          id="review-note"
          value={reviewNote}
          onChange={e => onNoteChange(e.target.value)}
          placeholder="Optional — saved with your approve / reject / waitlist decision below."
          rows={2}
          className="mt-2 w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
          style={{ borderRadius: '6px' }}
        />
      </div>

      <div className="sticky bottom-0 z-10 mt-auto flex flex-col gap-3 border-t border-border bg-surface-elevated pt-6">
        {flash ? (
          <div
            role="status"
            className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-primary"
            style={
              flash.type === 'error'
                ? {
                    borderRadius: '8px',
                    borderLeftWidth: '4px',
                    borderLeftStyle: 'solid',
                    borderLeftColor: 'var(--op-reject)',
                  }
                : {
                    borderRadius: '8px',
                    borderLeftWidth: '4px',
                    borderLeftStyle: 'solid',
                    borderLeftColor: 'var(--op-approve)',
                  }
            }
          >
            {flash.message}
          </div>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        <div className="relative flex-1">
          <button
            ref={approveBtnRef}
            type="button"
            onClick={handleApprove}
            disabled={pendingAction !== null}
            className="inline-flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-md bg-op-approve px-4 text-base font-semibold text-op-approve-fg shadow-sm transition-colors hover:bg-op-approve-hover disabled:opacity-50"
            style={{ borderRadius: '6px' }}
          >
            {pendingAction === 'approve' ? (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
            ) : (
              <Check className="h-5 w-5 shrink-0 opacity-90" strokeWidth={2.25} aria-hidden />
            )}
            <span className="text-center leading-tight">Approve application</span>
          </button>
        </div>
        <button
          type="button"
          onClick={onWaitlist}
          disabled={pendingAction !== null}
          className="inline-flex min-h-[3.25rem] flex-1 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 text-base font-semibold text-text-secondary shadow-sm transition-colors hover:bg-surface-elevated disabled:opacity-50"
          style={{ borderRadius: '6px' }}
        >
          {pendingAction === 'waitlist' ? (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
          ) : (
            <Clock className="h-5 w-5 shrink-0 opacity-90" strokeWidth={2.25} aria-hidden />
          )}
          <span className="text-center leading-tight">Waitlist</span>
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
    </div>
  );
}

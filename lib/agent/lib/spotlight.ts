/** Normalizes raw agent tool output into a render-ready Spotlight payload.
 *
 *  Keyed by tool name — each tool has its own output shape. The UI renders
 *  payloads by `kind` and never sniffs raw output. This is a presentation
 *  adapter only: it does not touch the model-facing tool output, and it is
 *  the single place navigation hrefs are constructed. */

export type SpotlightField = { label: string; value: string };

export type SpotlightRow = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  href?: string;
};

export type SpotlightMetric = { name: string; valueLabel?: string; insight?: string };

export type SpotlightPayload =
  | {
      kind: 'record';
      title: string;
      subtitle?: string;
      badge?: string;
      fields: SpotlightField[];
      detail?: SpotlightField[];
      href?: string;
    }
  | { kind: 'record-list'; title: string; rows: SpotlightRow[] }
  | { kind: 'metric'; name: string; valueLabel?: string; insight?: string; href?: string }
  | { kind: 'composition'; narrative: string; metrics: SpotlightMetric[]; href?: string }
  | { kind: 'mutation'; ok: boolean; title: string; detail?: string; href?: string }
  | { kind: 'empty'; message: string };

// ── helpers ────────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** ENUM_VALUE / strong_yes → "Enum value" / "Strong yes". Never show raw enums. */
function humanize(v: unknown): string {
  const s = str(v);
  if (!s) return '—';
  return s.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function fmtDate(v: unknown): string {
  const s = str(v) ?? (typeof v === 'number' ? v : undefined);
  if (s === undefined) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** aiScore is canonical 0–1 — member worth shows as a percentage. */
function worthLabel(v: unknown): string {
  const n = num(v);
  return n == null ? 'unscored' : `${Math.round(n * 100)}%`;
}

/** A metric/composition value is only shown as a headline when it's scalar. */
function fmtScalar(value: unknown, format?: string): string | undefined {
  if (typeof value === 'number') {
    if (format === 'percent') return `${value}%`;
    if (format === 'currency') return `$${Math.round(value).toLocaleString()}`;
    if (format === 'days') return `${value}d`;
    if (format === 'duration') return `${value}m`;
    return value.toLocaleString();
  }
  if (typeof value === 'string') return value;
  return undefined;
}

function compact(fields: SpotlightField[]): SpotlightField[] {
  return fields.filter((f) => f.value && f.value !== '—');
}

// ── per-tool normalizers ───────────────────────────────────────────────

function applicationsFind(o: Obj): SpotlightPayload {
  const rows = arr(o.applications).map((r) => {
    const a = obj(r);
    const id = str(a.id) ?? '';
    return {
      id,
      title: str(a.name) ?? 'Unnamed applicant',
      subtitle: str(a.email),
      meta: humanize(a.status),
      href: id ? `/operator/applications/${id}` : undefined,
    };
  });
  if (rows.length === 0) return { kind: 'empty', message: 'No applications matched.' };
  return { kind: 'record-list', title: `${rows.length} application${rows.length === 1 ? '' : 's'}`, rows };
}

function applicationsGet(o: Obj): SpotlightPayload {
  if (o.found === false) return { kind: 'empty', message: 'That application was not found.' };
  const a = obj(o.application);
  const id = str(a.id) ?? '';
  const location = [str(a.neighborhood), str(a.city)].filter(Boolean).join(', ');
  const detail = arr(a.answers).map((x) => {
    const ans = obj(x);
    return { label: str(ans.question) ?? '—', value: str(ans.answer) ?? '—' };
  });
  return {
    kind: 'record',
    title: str(a.name) ?? 'Applicant',
    subtitle: str(a.email),
    badge: humanize(a.status),
    fields: compact([
      { label: 'Archetype', value: str(a.archetype) ?? '—' },
      { label: 'Member worth', value: worthLabel(a.memberWorth) },
      { label: 'Recommendation', value: humanize(a.aiRecommendation) },
      { label: 'Location', value: location || '—' },
    ]),
    detail: detail.length ? detail : undefined,
    href: id ? `/operator/applications/${id}` : undefined,
  };
}

function membersFind(o: Obj): SpotlightPayload {
  const rows = arr(o.members).map((r) => {
    const m = obj(r);
    const attended = num(m.eventsAttended) ?? 0;
    return {
      id: str(m.id) ?? '',
      title: str(m.name) ?? 'Member',
      subtitle: str(m.email),
      meta: `${attended} event${attended === 1 ? '' : 's'}`,
    };
  });
  if (rows.length === 0) return { kind: 'empty', message: 'No members matched.' };
  return { kind: 'record-list', title: `${rows.length} member${rows.length === 1 ? '' : 's'}`, rows };
}

function membersGet(o: Obj): SpotlightPayload {
  if (o.found === false) return { kind: 'empty', message: 'That member was not found.' };
  const m = obj(o.member);
  const dormant = num(m.dormantDays);
  const detail = arr(m.recentRsvps).map((x) => {
    const r = obj(x);
    return {
      label: str(r.event) ?? '—',
      value: `${humanize(r.status)}${r.checkedIn ? ' · checked in' : ''}`,
    };
  });
  return {
    kind: 'record',
    title: str(m.name) ?? 'Member',
    subtitle: str(m.email),
    badge: humanize(m.status),
    fields: compact([
      { label: 'Events attended', value: String(num(m.eventsAttended) ?? 0) },
      { label: 'Last attended', value: m.lastAttended ? fmtDate(m.lastAttended) : '—' },
      { label: 'Dormant', value: dormant == null ? '—' : `${dormant} day${dormant === 1 ? '' : 's'}` },
    ]),
    detail: detail.length ? detail : undefined,
  };
}

function eventsFind(o: Obj): SpotlightPayload {
  const rows = arr(o.events).map((r) => {
    const e = obj(r);
    const id = str(e.id) ?? '';
    return {
      id,
      title: str(e.title) ?? 'Event',
      subtitle: str(e.location),
      meta: fmtDate(e.startAt),
      href: id ? `/operator/events/${id}` : undefined,
    };
  });
  if (rows.length === 0) return { kind: 'empty', message: 'No events matched.' };
  return { kind: 'record-list', title: `${rows.length} event${rows.length === 1 ? '' : 's'}`, rows };
}

function eventsGet(o: Obj): SpotlightPayload {
  if (o.found === false) return { kind: 'empty', message: 'That event was not found.' };
  const e = obj(o.event);
  const id = str(e.id) ?? '';
  const counts = obj(e.rsvpCounts);
  const detail = Object.entries(counts).map(([k, v]) => ({
    label: humanize(k),
    value: String(num(v) ?? 0),
  }));
  const capacity = num(e.capacity);
  return {
    kind: 'record',
    title: str(e.title) ?? 'Event',
    subtitle: fmtDate(e.startAt),
    badge: humanize(e.status),
    fields: compact([
      { label: 'Location', value: str(e.location) ?? '—' },
      { label: 'Capacity', value: capacity == null ? '—' : String(capacity) },
      { label: 'Access', value: humanize(e.accessMode) },
    ]),
    detail: detail.length ? detail : undefined,
    href: id ? `/operator/events/${id}` : undefined,
  };
}

function intelligenceRunMetric(o: Obj): SpotlightPayload {
  if (o.found === false) return { kind: 'empty', message: 'That metric is not registered.' };
  const metricId = str(o.metricId);
  const category = str(o.category);
  const href =
    category && metricId
      ? `/operator/intelligence?category=${category}#${metricId}`
      : '/operator/intelligence';
  return {
    kind: 'metric',
    name: str(o.metric) ?? 'Metric',
    valueLabel: fmtScalar(o.value, str(o.format)),
    insight: str(o.insight),
    href,
  };
}

function intelligenceCompose(o: Obj): SpotlightPayload {
  const metrics = arr(o.tiles).map((t) => {
    const tile = obj(t);
    return {
      name: str(tile.metric) ?? 'Metric',
      valueLabel: fmtScalar(tile.value),
      insight: str(tile.insight),
    };
  });
  return {
    kind: 'composition',
    narrative: str(o.narrative) ?? 'No narrative was produced.',
    metrics,
    href: '/operator/intelligence?category=insights',
  };
}

/** Shared shape for the write tools: { ok, ...ids/names } or { ok:false, error }. */
function mutation(toolName: string, o: Obj): SpotlightPayload {
  if (o.ok === false) {
    return {
      kind: 'mutation',
      ok: false,
      title: "That action didn't complete.",
      detail: humanize(o.error),
    };
  }
  const name = str(o.name);
  const appId = str(o.applicationId);
  switch (toolName) {
    case 'applications.approve':
      return {
        kind: 'mutation',
        ok: true,
        title: `Approved ${name ?? 'applicant'}`,
        detail: 'Member record created · welcome email sent.',
        href: '/operator/applications',
      };
    case 'applications.reject':
      return {
        kind: 'mutation',
        ok: true,
        title: `Rejected ${name ?? 'applicant'}`,
        detail: 'Decline email sent.',
        href: appId ? `/operator/applications/${appId}` : undefined,
      };
    case 'applications.waitlist':
      return {
        kind: 'mutation',
        ok: true,
        title: `Waitlisted ${name ?? 'applicant'}`,
        detail: 'Waitlist email sent.',
        href: appId ? `/operator/applications/${appId}` : undefined,
      };
    case 'applications.move_to_hold':
      return {
        kind: 'mutation',
        ok: true,
        title: `${name ?? 'Applicant'} moved to hold`,
        detail: 'Internal only — no email sent.',
        href: appId ? `/operator/applications/${appId}` : undefined,
      };
    case 'emails.send_custom':
      return {
        kind: 'mutation',
        ok: true,
        title: `Email sent to ${str(o.to) ?? 'recipient'}`,
        detail: 'From team@thenobadcompany.com.',
      };
    case 'rsvps.comp_ticket':
      return {
        kind: 'mutation',
        ok: true,
        title: `Comped ${str(o.member) ?? 'member'}`,
        detail: str(o.event) ? `Ticket confirmed for ${str(o.event)}.` : 'Ticket confirmed.',
      };
    default:
      return { kind: 'mutation', ok: true, title: 'Done.' };
  }
}

const NORMALIZERS: Record<string, (o: Obj) => SpotlightPayload> = {
  'applications.find': applicationsFind,
  'applications.get': applicationsGet,
  'members.find': membersFind,
  'members.get': membersGet,
  'events.find': eventsFind,
  'events.get': eventsGet,
  'intelligence.run_metric': intelligenceRunMetric,
  'intelligence.compose': intelligenceCompose,
};

const MUTATION_TOOLS = new Set([
  'applications.approve',
  'applications.reject',
  'applications.waitlist',
  'applications.move_to_hold',
  'emails.send_custom',
  'rsvps.comp_ticket',
]);

/** Maps one tool result to a Spotlight payload. Returns null when the output
 *  is unrecognizable — the caller falls back to a plain summary chip. */
export function normalizeAgentResult(toolName: string, output: unknown): SpotlightPayload | null {
  const o = obj(output);
  if (typeof o.error === 'string' && o.ok !== true) {
    return { kind: 'mutation', ok: false, title: 'That tool failed.', detail: humanize(o.error) };
  }
  if (MUTATION_TOOLS.has(toolName)) return mutation(toolName, o);
  const fn = NORMALIZERS[toolName];
  return fn ? fn(o) : null;
}

/** The ordered list of navigation targets a payload exposes — drives keyboard
 *  selection. Empty for payloads with nowhere to go. */
export function spotlightTargets(payload: SpotlightPayload): { label: string; href: string }[] {
  switch (payload.kind) {
    case 'record-list':
      return payload.rows
        .filter((r) => r.href)
        .map((r) => ({ label: r.title, href: r.href as string }));
    case 'record':
    case 'metric':
    case 'composition':
    case 'mutation':
      return payload.href ? [{ label: 'Open', href: payload.href }] : [];
    case 'empty':
      return [];
  }
}

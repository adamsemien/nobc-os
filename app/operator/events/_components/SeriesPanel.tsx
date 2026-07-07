'use client';

/** Series tab on /operator/events. Full management UI for recurring event series:
 *  create (human recurrence builder → RRULE behind the scenes), edit defaults,
 *  delete (instances survive), generate instances from the schedule, add ad-hoc
 *  instances, bulk-publish drafts, and per-series + per-instance attendance/revenue.
 *  Wired to /api/operator/series (workspaceId is derived server-side). */
import { useState } from 'react';
import { RRule } from 'rrule';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import type { SeriesRow } from './EventsPageTabs';
import { GenerateDescriptionButton } from './GenerateDescriptionButton';

type Instance = {
  id: string;
  slug: string;
  title: string;
  startAt: string;
  status: string;
  instanceNumber: number | null;
  capacity: number | null;
  confirmedCount: number;
  revenueCents: number;
};

type AccessMode = 'OPEN' | 'TICKETED';

const inputCls =
  'w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30';

const WEEKDAYS = [
  { key: 'MO', label: 'Mon' },
  { key: 'TU', label: 'Tue' },
  { key: 'WE', label: 'Wed' },
  { key: 'TH', label: 'Thu' },
  { key: 'FR', label: 'Fri' },
  { key: 'SA', label: 'Sat' },
  { key: 'SU', label: 'Sun' },
] as const;

const ORDINALS = [
  { value: 1, label: 'First' },
  { value: 2, label: 'Second' },
  { value: 3, label: 'Third' },
  { value: 4, label: 'Fourth' },
] as const;

type Frequency = 'weekly' | 'biweekly' | 'monthly';
type MonthlyMode = 'weekday' | 'monthday';

type RecurrenceState = {
  frequency: Frequency;
  byDays: string[];
  monthlyMode: MonthlyMode;
  monthlyOrdinal: number;
  monthlyWeekday: string;
  monthlyDay: number;
};

const emptyRecurrence: RecurrenceState = {
  frequency: 'weekly',
  byDays: ['TH'],
  monthlyMode: 'weekday',
  monthlyOrdinal: 1,
  monthlyWeekday: 'TH',
  monthlyDay: 1,
};

/** Assembles an RRULE string from the human builder. Returns null when the
 *  selection is incomplete (e.g. weekly with no days chosen). */
function buildRecurrenceRule(r: RecurrenceState): string | null {
  if (r.frequency === 'weekly' || r.frequency === 'biweekly') {
    if (r.byDays.length === 0) return null;
    const interval = r.frequency === 'biweekly' ? ';INTERVAL=2' : '';
    return `FREQ=WEEKLY${interval};BYDAY=${r.byDays.join(',')}`;
  }
  // monthly
  if (r.monthlyMode === 'weekday') {
    if (!r.monthlyWeekday) return null;
    return `FREQ=MONTHLY;BYDAY=${r.monthlyOrdinal}${r.monthlyWeekday}`;
  }
  if (!r.monthlyDay || r.monthlyDay < 1 || r.monthlyDay > 31) return null;
  return `FREQ=MONTHLY;BYMONTHDAY=${r.monthlyDay}`;
}

/** Plain-English description of an RRULE — never shows the raw rule. */
function humanRecurrence(rule: string): string {
  try {
    return RRule.fromString(rule).toText();
  } catch {
    return '';
  }
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function money(cents: number): string {
  return cents > 0 ? `$${(cents / 100).toFixed(0)}` : '—';
}

function statusCls(status: string): string {
  if (status === 'PUBLISHED') return 'bg-success-soft text-success';
  if (status === 'CANCELLED') return 'bg-danger-soft text-danger';
  return 'bg-muted text-text-muted';
}

export function SeriesPanel({ initialSeries }: { initialSeries: SeriesRow[] }) {
  const [series, setSeries] = useState<SeriesRow[]>(initialSeries);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [instancesById, setInstancesById] = useState<Record<string, Instance[]>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const flashError = (m: string) => {
    setError(m);
    window.setTimeout(() => setError(null), 6000);
  };

  /** Refetch one series' instances and roll their metrics up onto the card. */
  async function refreshSeries(id: string): Promise<Instance[] | null> {
    const res = await fetch(`/api/operator/series/${id}`, { credentials: 'include' });
    if (!res.ok) return null;
    const { instances } = (await res.json()) as { instances: Instance[] };
    setInstancesById((cur) => ({ ...cur, [id]: instances }));
    setSeries((cur) =>
      cur.map((s) =>
        s.id === id
          ? {
              ...s,
              instanceCount: instances.length,
              confirmedCount: instances.reduce((n, i) => n + i.confirmedCount, 0),
              revenueCents: instances.reduce((n, i) => n + i.revenueCents, 0),
            }
          : s,
      ),
    );
    return instances;
  }

  async function toggleActive(id: string, next: boolean) {
    const prev = series;
    setBusyId(id);
    setSeries((cur) => cur.map((s) => (s.id === id ? { ...s, active: next } : s)));
    try {
      const res = await fetch(`/api/operator/series/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ active: next }),
      });
      if (!res.ok) throw new Error(`Update failed (${res.status})`);
    } catch (e) {
      setSeries(prev);
      flashError(e instanceof Error ? e.message : 'Could not update the series.');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (instancesById[id]) return;
    setLoadingId(id);
    try {
      const got = await refreshSeries(id);
      if (!got) throw new Error('Failed to load instances');
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'Could not load instances.');
      setExpandedId(null);
    } finally {
      setLoadingId(null);
    }
  }

  async function handleGenerate(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/operator/series/${id}/generate`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.error === 'string' ? body.error : `Generate failed (${res.status})`);
      }
      await refreshSeries(id);
      setExpandedId(id);
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'Could not generate instances.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/operator/series/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.status === 409) {
        throw new Error('Cannot delete — this series has paid orders. Cancel or refund them first.');
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.error === 'string' ? body.error : `Delete failed (${res.status})`);
      }
      setSeries((cur) => cur.filter((s) => s.id !== id));
      setConfirmDeleteId(null);
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'Could not delete the series.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleBulkPublish(id: string) {
    setBusyId(id);
    try {
      const instances = instancesById[id] ?? (await refreshSeries(id));
      if (!instances) throw new Error('Could not load instances to publish.');
      const drafts = instances.filter((i) => i.status === 'DRAFT');
      if (drafts.length === 0) {
        flashError('No draft instances to publish.');
        return;
      }
      const results = await Promise.all(
        drafts.map((i) =>
          fetch(`/api/operator/events/${i.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ status: 'PUBLISHED' }),
          }).then((r) => r.ok),
        ),
      );
      const published = results.filter(Boolean).length;
      await refreshSeries(id);
      if (published < drafts.length) {
        flashError(`Published ${published} of ${drafts.length} drafts — some failed.`);
      }
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'Could not publish drafts.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-text-muted">
          Recurring event series — set the schedule and defaults once, then generate or add instances.
        </p>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
            New series
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      {creating && (
        <CreateSeriesForm
          onCancel={() => setCreating(false)}
          onCreated={(row) => {
            setSeries((cur) => [row, ...cur]);
            setCreating(false);
          }}
          onError={flashError}
        />
      )}

      {series.length === 0 && !creating ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center">
          <p className="text-sm font-medium text-text-primary">No series yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-text-muted">
            Create a series to schedule recurring events — generate a run of instances from a
            repeating schedule, or add dates ad-hoc.
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
            New series
          </button>
        </div>
      ) : series.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border">
          {series.map((s) => {
            const expanded = expandedId === s.id;
            const instances = instancesById[s.id];
            const busy = busyId === s.id;
            return (
              <div key={s.id} className="border-b border-border last:border-b-0">
                <div className="flex flex-wrap items-center gap-3 bg-surface-elevated px-3 py-3">
                  <button
                    type="button"
                    onClick={() => toggleExpand(s.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    {expanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-text-primary">
                        {s.name}
                      </span>
                      <span className="block truncate text-xs text-text-muted">
                        Repeats {humanRecurrence(s.recurrenceRule) || 'on a custom schedule'}
                      </span>
                    </span>
                  </button>

                  <div className="flex shrink-0 items-center gap-4 text-xs text-text-secondary">
                    <Metric label="Instances" value={String(s.instanceCount)} />
                    <Metric label="Confirmed" value={String(s.confirmedCount)} />
                    <Metric label="Revenue" value={money(s.revenueCents)} />
                  </div>

                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-text-secondary">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={s.active}
                      disabled={busy}
                      onChange={(e) => toggleActive(s.id, e.target.checked)}
                    />
                    Active
                  </label>

                  <div className="flex shrink-0 items-center gap-1">
                    <IconButton
                      label="Generate instances"
                      onClick={() => handleGenerate(s.id)}
                      disabled={busy}
                      busy={busy}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      label="Add instance"
                      onClick={() => {
                        setAddingId(addingId === s.id ? null : s.id);
                        setExpandedId(s.id);
                        if (!instancesById[s.id]) void refreshSeries(s.id);
                      }}
                      disabled={busy}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      label="Publish all drafts"
                      onClick={() => handleBulkPublish(s.id)}
                      disabled={busy}
                    >
                      <UploadCloud className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      label="Edit series"
                      onClick={() => setEditingId(editingId === s.id ? null : s.id)}
                      disabled={busy}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      label="Delete series"
                      onClick={() => setConfirmDeleteId(s.id)}
                      disabled={busy}
                      danger
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                </div>

                {editingId === s.id && (
                  <EditSeriesForm
                    row={s}
                    onCancel={() => setEditingId(null)}
                    onSaved={(patch) => {
                      setSeries((cur) => cur.map((r) => (r.id === s.id ? { ...r, ...patch } : r)));
                      setEditingId(null);
                    }}
                    onError={flashError}
                  />
                )}

                {addingId === s.id && (
                  <AddInstanceForm
                    seriesId={s.id}
                    onCancel={() => setAddingId(null)}
                    onAdded={async () => {
                      await refreshSeries(s.id);
                      setAddingId(null);
                    }}
                    onError={flashError}
                  />
                )}

                {confirmDeleteId === s.id && (
                  <div className="border-t border-border bg-danger-soft/40 px-3 py-3">
                    <p className="text-sm text-text-primary">
                      Delete this series? Existing instances will not be deleted — they&rsquo;ll just
                      be unlinked from the series.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleDelete(s.id)}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-md bg-danger px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-danger/90 disabled:opacity-50"
                      >
                        {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                        Delete series
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={busy}
                        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {expanded && (
                  <div className="border-t border-border bg-surface px-3 py-3">
                    {loadingId === s.id ? (
                      <div className="flex items-center gap-2 py-2 text-xs text-text-muted">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading instances…
                      </div>
                    ) : instances && instances.length > 0 ? (
                      <ul className="space-y-1">
                        {instances.map((inst) => (
                          <li
                            key={inst.id}
                            className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                          >
                            <a
                              href={`/operator/events/${inst.id}`}
                              className="min-w-0 flex-1 truncate text-text-primary underline-offset-2 hover:text-primary hover:underline"
                            >
                              {inst.title}
                            </a>
                            <span className="shrink-0 text-xs text-text-muted">
                              {fmtDateTime(inst.startAt)}
                            </span>
                            <span className="shrink-0 text-xs text-text-secondary">
                              {inst.confirmedCount} conf
                            </span>
                            <span className="shrink-0 text-xs text-text-secondary">
                              {money(inst.revenueCents)}
                            </span>
                            <span
                              className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${statusCls(inst.status)}`}
                            >
                              {{ DRAFT: 'Draft', PUBLISHED: 'Published', CANCELLED: 'Cancelled' }[
                                inst.status
                              ] ?? inst.status.toLowerCase()}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="py-2 text-xs text-text-muted">
                        No instances yet — use Generate to create them from the schedule, or Add
                        instance for a one-off date.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="hidden flex-col items-end sm:flex">
      <span className="font-medium text-text-primary">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-text-muted">{label}</span>
    </span>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  busy,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-text-secondary transition-colors hover:bg-muted disabled:opacity-50 ${
        danger ? 'hover:border-danger/40 hover:text-danger' : 'hover:text-primary'
      }`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : children}
    </button>
  );
}

/** Name / description / access mode / plus-ones — shared by create + edit. */
function SeriesFields({
  name,
  setName,
  description,
  setDescription,
  accessMode,
  setAccessMode,
  plusOnes,
  setPlusOnes,
}: {
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  accessMode: AccessMode;
  setAccessMode: (v: AccessMode) => void;
  plusOnes: boolean;
  setPlusOnes: (v: boolean) => void;
}) {
  return (
    <>
      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">Name</label>
        <input
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Thursday Socials"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">
          Description <span className="text-text-muted">(optional)</span>
        </label>
        <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
        <GenerateDescriptionButton
          context={{ title: name, currentDescription: description, kind: 'series' }}
          onResult={setDescription}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">Default access</label>
        <div className="flex flex-wrap gap-2">
          {([
            { value: 'OPEN', label: 'Open — free, anyone' },
            { value: 'TICKETED', label: 'Ticketed' },
          ] as const).map((o) => {
            const active = accessMode === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => setAccessMode(o.value)}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-surface-elevated text-text-secondary hover:border-primary/40'
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
        <input
          type="checkbox"
          className="h-4 w-4 accent-primary"
          checked={plusOnes}
          onChange={(e) => setPlusOnes(e.target.checked)}
        />
        Plus-ones allowed by default
      </label>
    </>
  );
}

function CreateSeriesForm({
  onCancel,
  onCreated,
  onError,
}: {
  onCancel: () => void;
  onCreated: (row: SeriesRow) => void;
  onError: (m: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [accessMode, setAccessMode] = useState<AccessMode>('OPEN');
  const [plusOnes, setPlusOnes] = useState(false);
  const [rec, setRec] = useState<RecurrenceState>(emptyRecurrence);
  const [startsAt, setStartsAt] = useState('');
  const [count, setCount] = useState('');
  const [busy, setBusy] = useState(false);

  const rule = buildRecurrenceRule(rec);
  const preview = rule ? humanRecurrence(rule) : '';
  const canSubmit = name.trim() && rule && startsAt && !busy;

  function toggleDay(key: string) {
    setRec((r) => ({
      ...r,
      byDays: r.byDays.includes(key) ? r.byDays.filter((d) => d !== key) : [...r.byDays, key],
    }));
  }

  async function submit() {
    if (!rule) return;
    setBusy(true);
    try {
      const res = await fetch('/api/operator/series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          description: description || null,
          recurrenceRule: rule,
          startsAt: new Date(startsAt).toISOString(),
          count: count ? parseInt(count, 10) : undefined,
          defaultAccessMode: accessMode,
          defaultPlusOnesAllowed: plusOnes,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.error === 'string' ? body.error : `Create failed (${res.status})`);
      }
      const { series: created } = (await res.json()) as { series: Omit<SeriesRow, 'instanceCount' | 'confirmedCount' | 'revenueCents'> };
      onCreated({ ...created, instanceCount: 0, confirmedCount: 0, revenueCents: 0 });
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not create the series.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-primary/40 bg-surface-elevated p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-text-primary">New series</p>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md p-1 text-text-muted hover:bg-muted hover:text-text-primary"
          aria-label="Cancel new series"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        <SeriesFields
          name={name}
          setName={setName}
          description={description}
          setDescription={setDescription}
          accessMode={accessMode}
          setAccessMode={setAccessMode}
          plusOnes={plusOnes}
          setPlusOnes={setPlusOnes}
        />

        <div className="rounded-md border border-border p-3">
          <p className="mb-2 text-xs font-medium text-text-secondary">Recurrence</p>
          <div className="flex flex-wrap gap-2">
            {([
              { value: 'weekly', label: 'Weekly' },
              { value: 'biweekly', label: 'Bi-weekly' },
              { value: 'monthly', label: 'Monthly' },
            ] as const).map((o) => {
              const active = rec.frequency === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setRec((r) => ({ ...r, frequency: o.value }))}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-surface-elevated text-text-secondary hover:border-primary/40'
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>

          {(rec.frequency === 'weekly' || rec.frequency === 'biweekly') && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => {
                const active = rec.byDays.includes(d.key);
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => toggleDay(d.key)}
                    className={`h-8 w-10 rounded-md border text-xs font-medium transition-colors ${
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-surface-elevated text-text-secondary hover:border-primary/40'
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          )}

          {rec.frequency === 'monthly' && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-2">
                {([
                  { value: 'weekday', label: 'On a weekday' },
                  { value: 'monthday', label: 'On a date' },
                ] as const).map((o) => {
                  const active = rec.monthlyMode === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setRec((r) => ({ ...r, monthlyMode: o.value }))}
                      className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                        active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-surface-elevated text-text-secondary hover:border-primary/40'
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
              {rec.monthlyMode === 'weekday' ? (
                <div className="flex gap-2">
                  <select
                    className={inputCls}
                    value={rec.monthlyOrdinal}
                    onChange={(e) => setRec((r) => ({ ...r, monthlyOrdinal: parseInt(e.target.value, 10) }))}
                  >
                    {ORDINALS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className={inputCls}
                    value={rec.monthlyWeekday}
                    onChange={(e) => setRec((r) => ({ ...r, monthlyWeekday: e.target.value }))}
                  >
                    {WEEKDAYS.map((d) => (
                      <option key={d.key} value={d.key}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    className={inputCls}
                    value={rec.monthlyDay}
                    onChange={(e) => setRec((r) => ({ ...r, monthlyDay: parseInt(e.target.value, 10) || 1 }))}
                    placeholder="Day of month (1–31)"
                  />
                </div>
              )}
            </div>
          )}

          {preview && (
            <p className="mt-2 text-xs text-text-muted">
              Repeats <span className="text-text-secondary">{preview}</span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">First occurrence</label>
            <input
              type="datetime-local"
              className={inputCls}
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Number of instances <span className="text-text-muted">(optional)</span>
            </label>
            <input
              type="number"
              min={1}
              className={inputCls}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              placeholder="e.g. 12"
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          Create series
        </button>
      </div>
    </div>
  );
}

function EditSeriesForm({
  row,
  onCancel,
  onSaved,
  onError,
}: {
  row: SeriesRow;
  onCancel: () => void;
  onSaved: (patch: Partial<SeriesRow>) => void;
  onError: (m: string) => void;
}) {
  const [name, setName] = useState(row.name);
  const [description, setDescription] = useState(row.description ?? '');
  const [accessMode, setAccessMode] = useState<AccessMode>(row.defaultAccessMode);
  const [plusOnes, setPlusOnes] = useState(row.defaultPlusOnesAllowed);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch(`/api/operator/series/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          description: description || null,
          defaultAccessMode: accessMode,
          defaultPlusOnesAllowed: plusOnes,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.error === 'string' ? body.error : `Save failed (${res.status})`);
      }
      onSaved({
        name,
        description: description || null,
        defaultAccessMode: accessMode,
        defaultPlusOnesAllowed: plusOnes,
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not save the series.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-border bg-surface px-3 py-3">
      <div className="space-y-3">
        <SeriesFields
          name={name}
          setName={setName}
          description={description}
          setDescription={setDescription}
          accessMode={accessMode}
          setAccessMode={setAccessMode}
          plusOnes={plusOnes}
          setPlusOnes={setPlusOnes}
        />
        <p className="text-xs text-text-muted">
          The recurrence schedule can&rsquo;t be changed after creation — add or remove instances
          individually instead.
        </p>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy || !name.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          Save changes
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function AddInstanceForm({
  seriesId,
  onCancel,
  onAdded,
  onError,
}: {
  seriesId: string;
  onCancel: () => void;
  onAdded: () => void | Promise<void>;
  onError: (m: string) => void;
}) {
  const [startAt, setStartAt] = useState('');
  const [title, setTitle] = useState('');
  const [capacity, setCapacity] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!startAt) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/operator/series/${seriesId}/instances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          startAt: new Date(startAt).toISOString(),
          title: title || null,
          capacity: capacity ? parseInt(capacity, 10) : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.error === 'string' ? body.error : `Add failed (${res.status})`);
      }
      await onAdded();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not add the instance.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-border bg-surface px-3 py-3">
      <p className="mb-2 text-xs font-medium text-text-secondary">Add an instance</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input
          type="datetime-local"
          className={inputCls}
          value={startAt}
          onChange={(e) => setStartAt(e.target.value)}
          aria-label="Instance date and time"
        />
        <input
          className={inputCls}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          aria-label="Instance title"
        />
        <input
          type="number"
          min={1}
          className={inputCls}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          placeholder="Capacity (optional)"
          aria-label="Instance capacity"
        />
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy || !startAt}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          Add instance
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

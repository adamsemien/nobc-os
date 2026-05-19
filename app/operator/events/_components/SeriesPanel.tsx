'use client';

/** Series tab on /operator/events. Lists EventSeries for the workspace, creates
 *  new series (RRULE with a live human-readable preview), toggles active state,
 *  generates Event instances, and expands a series to show those instances.
 *  Wired to /api/operator/series (workspaceId is derived server-side). */
import { useState } from 'react';
import { RRule } from 'rrule';
import { ChevronDown, ChevronRight, Loader2, Plus, Sparkles, X } from 'lucide-react';
import type { SeriesRow } from './EventsPageTabs';

type Instance = {
  id: string;
  slug: string;
  title: string;
  startAt: string;
  status: string;
  instanceNumber: number | null;
};

const inputCls =
  'w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30';

/** Renders an RRULE string as human-readable text (e.g. "every week on Thursday"). */
function humanRecurrence(rule: string): string {
  if (!rule.trim()) return '';
  try {
    return RRule.fromString(rule).toText();
  } catch {
    return 'Unrecognized recurrence rule';
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

function statusCls(status: string): string {
  if (status === 'PUBLISHED') return 'bg-success-soft text-success';
  if (status === 'CANCELLED') return 'bg-danger-soft text-danger';
  return 'bg-muted text-text-muted';
}

export function SeriesPanel({ initialSeries }: { initialSeries: SeriesRow[] }) {
  const [series, setSeries] = useState<SeriesRow[]>(initialSeries);
  const [creating, setCreating] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [instancesById, setInstancesById] = useState<Record<string, Instance[]>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [recurrenceRule, setRecurrenceRule] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [count, setCount] = useState('');

  const flashError = (m: string) => {
    setError(m);
    window.setTimeout(() => setError(null), 5000);
  };

  function resetDraft() {
    setName('');
    setDescription('');
    setRecurrenceRule('');
    setStartsAt('');
    setCount('');
  }

  async function handleCreate() {
    setCreateBusy(true);
    try {
      const res = await fetch('/api/operator/series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          description: description || null,
          recurrenceRule,
          startsAt: new Date(startsAt).toISOString(),
          count: count ? parseInt(count, 10) : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.error === 'string' ? body.error : `Create failed (${res.status})`);
      }
      const { series: created } = (await res.json()) as { series: Omit<SeriesRow, '_count'> };
      setSeries((cur) => [{ ...created, _count: { events: 0 } }, ...cur]);
      resetDraft();
      setCreating(false);
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'Could not create the series.');
    } finally {
      setCreateBusy(false);
    }
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
      const res = await fetch(`/api/operator/series/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to load instances (${res.status})`);
      const { instances } = (await res.json()) as { instances: Instance[] };
      setInstancesById((cur) => ({ ...cur, [id]: instances }));
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
      const { instances } = (await res.json()) as { instances: Instance[] };
      setInstancesById((cur) => ({ ...cur, [id]: instances }));
      setSeries((cur) =>
        cur.map((s) => (s.id === id ? { ...s, _count: { events: instances.length } } : s)),
      );
      setExpandedId(id);
    } catch (e) {
      flashError(e instanceof Error ? e.message : 'Could not generate instances.');
    } finally {
      setBusyId(null);
    }
  }

  const rulePreview = humanRecurrence(recurrenceRule);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-text-muted">
          Recurring event series — generate Event instances from an RRULE schedule.
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
        <div className="rounded-lg border border-primary/40 bg-surface-elevated p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-text-primary">New series</p>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                resetDraft();
              }}
              className="rounded-md p-1 text-text-muted hover:bg-muted hover:text-text-primary"
              aria-label="Cancel new series"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-text-secondary">Name</label>
              <input
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Thursday Socials"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                Description <span className="text-text-muted">(optional)</span>
              </label>
              <input
                className={inputCls}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                Recurrence rule (RRULE)
              </label>
              <input
                className={`${inputCls} font-mono`}
                value={recurrenceRule}
                onChange={(e) => setRecurrenceRule(e.target.value)}
                placeholder="FREQ=WEEKLY;BYDAY=TH"
              />
              {recurrenceRule.trim() && (
                <p className="mt-1 text-xs text-text-muted">
                  Repeats <span className="text-text-secondary">{rulePreview}</span>
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                First occurrence
              </label>
              <input
                type="datetime-local"
                className={inputCls}
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                Max instances <span className="text-text-muted">(optional)</span>
              </label>
              <input
                type="number"
                min={1}
                className={inputCls}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                placeholder="12"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleCreate}
              disabled={createBusy || !name.trim() || !recurrenceRule.trim() || !startsAt}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
            >
              {createBusy && <Loader2 className="h-3 w-3 animate-spin" />}
              Create series
            </button>
          </div>
        </div>
      )}

      {series.length === 0 && !creating ? (
        <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-text-muted">
          No series yet. Create one to schedule recurring events.
        </p>
      ) : series.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border">
          {series.map((s) => {
            const expanded = expandedId === s.id;
            const instances = instancesById[s.id];
            return (
              <div key={s.id} className="border-b border-border last:border-b-0">
                <div className="flex items-center gap-3 bg-surface-elevated px-3 py-3">
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
                        Repeats {humanRecurrence(s.recurrenceRule)}
                      </span>
                    </span>
                  </button>
                  <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-xs text-text-muted">
                    {s._count.events} instance{s._count.events === 1 ? '' : 's'}
                  </span>
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-text-secondary">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={s.active}
                      disabled={busyId === s.id}
                      onChange={(e) => toggleActive(s.id, e.target.checked)}
                    />
                    Active
                  </label>
                  <button
                    type="button"
                    onClick={() => handleGenerate(s.id)}
                    disabled={busyId === s.id}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    {busyId === s.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    Generate
                  </button>
                </div>

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
                            <span
                              className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${statusCls(inst.status)}`}
                            >
                              {inst.status.toLowerCase()}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="py-2 text-xs text-text-muted">
                        No instances yet — use Generate to create them from the schedule.
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

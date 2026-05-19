'use client';

/** Ticket-tier manager for the event builder. Lists, creates, inline-edits,
 *  soft-closes (delete), and drag-reorders the tiers for one event. Wired to
 *  /api/operator/ticket-tiers (workspaceId is derived server-side from the
 *  Clerk session — the client never passes it). */
import { useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';

type Tier = {
  id: string;
  name: string;
  description: string | null;
  memberPriceCents: number | null;
  nonMemberPriceCents: number | null;
  quantity: number;
  soldCount: number;
  heldCount: number;
  visibility: string;
  startsAt: string | null;
  endsAt: string | null;
  sortOrder: number;
  manuallyClosed: boolean;
};

type TierDraft = {
  name: string;
  description: string;
  memberPrice: string;
  nonMemberPrice: string;
  quantity: string;
  visibility: string;
  startsAt: string;
  endsAt: string;
};

const VISIBILITY = [
  { value: 'public', label: 'Public' },
  { value: 'secret_link', label: 'Secret link' },
  { value: 'members_only', label: 'Members only' },
] as const;

const inputCls =
  'w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30';

function centsToInput(c: number | null): string {
  return c == null ? '' : (c / 100).toString();
}

function inputToCents(v: string): number | null {
  const t = v.trim();
  if (t === '') return null;
  const n = Math.round(parseFloat(t) * 100);
  return Number.isFinite(n) ? n : null;
}

function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(v: string): string | null {
  return v ? new Date(v).toISOString() : null;
}

function fmtMoney(c: number | null): string {
  return c == null ? '—' : `$${(c / 100).toFixed(2)}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function emptyDraft(): TierDraft {
  return {
    name: '',
    description: '',
    memberPrice: '',
    nonMemberPrice: '',
    quantity: '',
    visibility: 'public',
    startsAt: '',
    endsAt: '',
  };
}

function tierToDraft(t: Tier): TierDraft {
  return {
    name: t.name,
    description: t.description ?? '',
    memberPrice: centsToInput(t.memberPriceCents),
    nonMemberPrice: centsToInput(t.nonMemberPriceCents),
    quantity: String(t.quantity),
    visibility: t.visibility,
    startsAt: isoToLocalInput(t.startsAt),
    endsAt: isoToLocalInput(t.endsAt),
  };
}

/** Shared body of create + edit forms — the editable tier fields. */
function TierFields({
  draft,
  onChange,
}: {
  draft: TierDraft;
  onChange: (next: TierDraft) => void;
}) {
  const set = (patch: Partial<TierDraft>) => onChange({ ...draft, ...patch });
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="mb-1 block text-xs font-medium text-text-secondary">Name</label>
        <input
          className={inputCls}
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="General Admission"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1 block text-xs font-medium text-text-secondary">
          Description <span className="text-text-muted">(optional)</span>
        </label>
        <input
          className={inputCls}
          value={draft.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">
          Member price <span className="text-text-muted">($)</span>
        </label>
        <input
          type="number"
          min={0}
          step="0.01"
          className={inputCls}
          value={draft.memberPrice}
          onChange={(e) => set({ memberPrice: e.target.value })}
          placeholder="0.00"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">
          Non-member price <span className="text-text-muted">($)</span>
        </label>
        <input
          type="number"
          min={0}
          step="0.01"
          className={inputCls}
          value={draft.nonMemberPrice}
          onChange={(e) => set({ nonMemberPrice: e.target.value })}
          placeholder="0.00"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">Quantity</label>
        <input
          type="number"
          min={1}
          className={inputCls}
          value={draft.quantity}
          onChange={(e) => set({ quantity: e.target.value })}
          placeholder="100"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">Visibility</label>
        <select
          className={inputCls}
          value={draft.visibility}
          onChange={(e) => set({ visibility: e.target.value })}
        >
          {VISIBILITY.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">
          Sale starts <span className="text-text-muted">(optional)</span>
        </label>
        <input
          type="datetime-local"
          className={inputCls}
          value={draft.startsAt}
          onChange={(e) => set({ startsAt: e.target.value })}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">
          Sale ends <span className="text-text-muted">(optional)</span>
        </label>
        <input
          type="datetime-local"
          className={inputCls}
          value={draft.endsAt}
          onChange={(e) => set({ endsAt: e.target.value })}
        />
      </div>
    </div>
  );
}

/** One tier — display row, or an inline edit form when `editing`. */
function SortableTierRow({
  tier,
  editing,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
  busy,
}: {
  tier: Tier;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (draft: TierDraft) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tier.id,
  });
  const [draft, setDraft] = useState<TierDraft>(() => tierToDraft(tier));

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  if (editing) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="rounded-lg border border-primary/40 bg-surface-elevated p-4"
      >
        <TierFields draft={draft} onChange={setDraft} />
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancelEdit}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            disabled={busy || !draft.name.trim() || !draft.quantity.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            Save tier
          </button>
        </div>
      </div>
    );
  }

  const sold = tier.soldCount + tier.heldCount;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg border border-border bg-surface-elevated px-3 py-3"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-text-muted hover:text-text-secondary active:cursor-grabbing"
        aria-label={`Reorder ${tier.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{tier.name}</p>
        <p className="mt-0.5 truncate text-xs text-text-muted">
          {VISIBILITY.find((v) => v.value === tier.visibility)?.label ?? tier.visibility}
          {(tier.startsAt || tier.endsAt) && (
            <> · {fmtDate(tier.startsAt)}{tier.endsAt ? `–${fmtDate(tier.endsAt)}` : ''}</>
          )}
        </p>
      </div>
      <div className="hidden text-right sm:block">
        <p className="text-sm text-text-secondary">
          {fmtMoney(tier.memberPriceCents)}
          <span className="text-text-muted"> / </span>
          {fmtMoney(tier.nonMemberPriceCents)}
        </p>
        <p className="mt-0.5 text-xs text-text-muted">member / non-member</p>
      </div>
      <div className="text-right">
        <p className="text-sm text-text-secondary">
          {sold} / {tier.quantity}
        </p>
        <p className="mt-0.5 text-xs text-text-muted">sold</p>
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-muted hover:text-text-primary"
          aria-label={`Edit ${tier.name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50"
          aria-label={`Delete ${tier.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function TierManager({ eventId }: { eventId: string }) {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<TierDraft>(emptyDraft);
  const [createBusy, setCreateBusy] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/operator/ticket-tiers?eventId=${eventId}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Failed to load tiers (${res.status})`);
      const { tiers: rows } = (await res.json()) as { tiers: Tier[] };
      setTiers(rows.filter((t) => !t.manuallyClosed));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tiers.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const flashError = useCallback((message: string) => {
    setError(message);
    window.setTimeout(() => setError(null), 5000);
  }, []);

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = tiers.findIndex((t) => t.id === active.id);
    const newIndex = tiers.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const prev = tiers;
    const next = arrayMove(tiers, oldIndex, newIndex);
    setTiers(next); // optimistic
    try {
      const res = await fetch('/api/operator/ticket-tiers/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tierIds: next.map((t) => t.id) }),
      });
      if (!res.ok) throw new Error(`Reorder failed (${res.status})`);
    } catch (err) {
      setTiers(prev); // revert
      flashError(err instanceof Error ? err.message : 'Reorder failed.');
    }
  }

  async function handleSaveEdit(id: string, draft: TierDraft) {
    const prev = tiers;
    setBusyId(id);
    // optimistic merge
    setTiers((cur) =>
      cur.map((t) =>
        t.id === id
          ? {
              ...t,
              name: draft.name,
              description: draft.description || null,
              memberPriceCents: inputToCents(draft.memberPrice),
              nonMemberPriceCents: inputToCents(draft.nonMemberPrice),
              quantity: parseInt(draft.quantity, 10) || t.quantity,
              visibility: draft.visibility,
              startsAt: localInputToIso(draft.startsAt),
              endsAt: localInputToIso(draft.endsAt),
            }
          : t,
      ),
    );
    setEditingId(null);
    try {
      const res = await fetch(`/api/operator/ticket-tiers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: draft.name,
          description: draft.description || null,
          memberPriceCents: inputToCents(draft.memberPrice),
          nonMemberPriceCents: inputToCents(draft.nonMemberPrice),
          quantity: parseInt(draft.quantity, 10),
          visibility: draft.visibility,
          startsAt: localInputToIso(draft.startsAt),
          endsAt: localInputToIso(draft.endsAt),
        }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
    } catch (err) {
      setTiers(prev); // revert
      flashError(err instanceof Error ? err.message : 'Could not save the tier.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    const prev = tiers;
    setBusyId(id);
    setTiers((cur) => cur.filter((t) => t.id !== id)); // optimistic
    try {
      const res = await fetch(`/api/operator/ticket-tiers/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
    } catch (err) {
      setTiers(prev); // revert
      flashError(err instanceof Error ? err.message : 'Could not delete the tier.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreate() {
    setCreateBusy(true);
    try {
      const res = await fetch('/api/operator/ticket-tiers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          eventId,
          name: createDraft.name,
          description: createDraft.description || null,
          memberPriceCents: inputToCents(createDraft.memberPrice),
          nonMemberPriceCents: inputToCents(createDraft.nonMemberPrice),
          quantity: parseInt(createDraft.quantity, 10),
          visibility: createDraft.visibility,
          startsAt: localInputToIso(createDraft.startsAt),
          endsAt: localInputToIso(createDraft.endsAt),
        }),
      });
      if (!res.ok) throw new Error(`Create failed (${res.status})`);
      const { tier } = (await res.json()) as { tier: Tier };
      setTiers((cur) => [...cur, tier]);
      setCreateDraft(emptyDraft());
      setCreating(false);
    } catch (err) {
      flashError(err instanceof Error ? err.message : 'Could not create the tier.');
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <section className="border-t border-border pt-6">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-text-secondary">
            Ticket tiers
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            Pricing tiers for this event. Drag to reorder.
          </p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" />
            Add tier
          </button>
        )}
      </div>

      {error && (
        <p className="mb-3 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading tiers…
        </div>
      ) : (
        <>
          {tiers.length === 0 && !creating && (
            <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-text-muted">
              No tiers yet. Add one to start selling tickets.
            </p>
          )}

          {tiers.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={tiers.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {tiers.map((tier) => (
                    <SortableTierRow
                      key={tier.id}
                      tier={tier}
                      editing={editingId === tier.id}
                      busy={busyId === tier.id}
                      onEdit={() => setEditingId(tier.id)}
                      onCancelEdit={() => setEditingId(null)}
                      onSave={(draft) => handleSaveEdit(tier.id, draft)}
                      onDelete={() => handleDelete(tier.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </>
      )}

      {creating && (
        <div className="mt-2 rounded-lg border border-primary/40 bg-surface-elevated p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-text-primary">New tier</p>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setCreateDraft(emptyDraft());
              }}
              className="rounded-md p-1 text-text-muted hover:bg-muted hover:text-text-primary"
              aria-label="Cancel new tier"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <TierFields draft={createDraft} onChange={setCreateDraft} />
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleCreate}
              disabled={createBusy || !createDraft.name.trim() || !createDraft.quantity.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
            >
              {createBusy && <Loader2 className="h-3 w-3 animate-spin" />}
              Create tier
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

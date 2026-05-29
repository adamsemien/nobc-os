'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2, X } from 'lucide-react';
import {
  type AccessQuestion,
  type FieldType,
  type ShowTo,
  type WhenInFlow,
  FIELD_TYPE_OPTIONS,
  SHOW_TO_OPTIONS,
  WHEN_IN_FLOW_OPTIONS,
  fromApiQuestion,
  toApiQuestion,
} from '@/lib/registration-fields';

/** Stored EventCustomQuestion row shape (as returned by GET /api/operator/events/[id]). */
type RawQuestion = {
  id: string;
  label: string;
  fieldType: string;
  options: string[];
  required: boolean;
  order: number;
  showToMember: boolean;
  showToGuest: boolean;
  whenInFlow: string;
};

type Props = {
  eventId: string;
  questions: RawQuestion[];
};

// API-accepted types only — the PATCH enum rejects yes_no / file.
const TYPE_OPTIONS = FIELD_TYPE_OPTIONS.filter(o => o.value !== 'yes_no' && o.value !== 'file');
const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  FIELD_TYPE_OPTIONS.map(o => [o.value, o.label]),
);
const SHOW_TO_LABEL: Record<ShowTo, string> = {
  both: 'Members & Guests',
  members: 'Members only',
  guests: 'Guests only',
};

function hasOptions(t: FieldType): boolean {
  return t === 'select' || t === 'multiselect';
}

let newSeq = 0;
function blankQuestion(type: FieldType): AccessQuestion {
  newSeq += 1;
  return {
    tempId: `new-${Date.now()}-${newSeq}`,
    label: '',
    type,
    required: false,
    options: [],
    showTo: 'both',
    whenInFlow: 'BEFORE_SUBMIT',
  };
}

/** Stable serialization of the save payload — drives the dirty indicator. */
function serialize(items: AccessQuestion[]): string {
  return JSON.stringify(items.map(q => ({ ...toApiQuestion(q), id: q.id ?? '' })));
}

function mergeShowTo(a: ShowTo, b: ShowTo): ShowTo {
  return a === b ? a : 'both';
}

/** Collapse duplicate rows that share a label (case-insensitive) into one,
 *  unioning their audience. Legacy/builder data stored a question shown to
 *  both members and guests as two EventCustomQuestion rows (one per audience),
 *  which fromApiQuestion renders as two identical list items. Deduping on load
 *  makes each question appear once; saving (deleteMany + createMany from items)
 *  then rewrites the collapsed set, cleaning the underlying rows. Blank
 *  (untitled) questions never collapse together. */
function dedupeQuestions(items: AccessQuestion[]): AccessQuestion[] {
  const indexByLabel = new Map<string, number>();
  const out: AccessQuestion[] = [];
  for (const q of items) {
    const key = q.label.trim().toLowerCase();
    if (!key) {
      out.push(q);
      continue;
    }
    const idx = indexByLabel.get(key);
    if (idx === undefined) {
      indexByLabel.set(key, out.length);
      out.push(q);
    } else {
      out[idx] = { ...out[idx], showTo: mergeShowTo(out[idx].showTo, q.showTo) };
    }
  }
  return out;
}

export function QuestionsTab({ eventId, questions }: Props) {
  const initial = useMemo(
    () => dedupeQuestions(questions.map(fromApiQuestion)),
    [questions],
  );

  const [items, setItems] = useState<AccessQuestion[]>(initial);
  const [baseline, setBaseline] = useState(() => serialize(initial));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = serialize(items) !== baseline;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      setItems(prev => {
        const oldIdx = prev.findIndex(q => q.tempId === active.id);
        const newIdx = prev.findIndex(q => q.tempId === over.id);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  }

  function update(tempId: string, patch: Partial<AccessQuestion>) {
    setItems(prev => prev.map(q => (q.tempId === tempId ? { ...q, ...patch } : q)));
  }

  function remove(tempId: string) {
    setItems(prev => prev.filter(q => q.tempId !== tempId));
    if (expandedId === tempId) setExpandedId(null);
  }

  function addQuestion(type: FieldType) {
    const q = blankQuestion(type);
    setItems(prev => [...prev, q]);
    setExpandedId(q.tempId);
    setPicking(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const body = {
        customQuestions: items.map(q => ({ ...toApiQuestion(q), id: q.id ?? '' })),
      };
      const res = await fetch(`/api/operator/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Save failed (${res.status})`);
      }
      setBaseline(serialize(items));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Questions</h2>
          <p className="mt-0.5 text-sm text-text-muted">
            Asked during registration. Drag to reorder; click a question to edit.
          </p>
        </div>
        {dirty && (
          <span className="shrink-0 text-xs font-medium text-text-secondary">
            Unsaved changes
          </span>
        )}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map(q => q.tempId)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.length === 0 ? (
              <p className="rounded-md border border-dashed border-border py-10 text-center text-sm text-text-muted">
                No questions yet. Add your first question to collect info from attendees during registration.
              </p>
            ) : (
              items.map(q => (
                <SortableQuestionRow
                  key={q.tempId}
                  q={q}
                  expanded={expandedId === q.tempId}
                  onToggleExpand={() =>
                    setExpandedId(expandedId === q.tempId ? null : q.tempId)
                  }
                  onUpdate={patch => update(q.tempId, patch)}
                  onDelete={() => remove(q.tempId)}
                />
              ))
            )}
          </div>
        </SortableContext>
      </DndContext>

      {/* Add question — type picker first */}
      <div className="relative">
        {picking ? (
          <div className="rounded-md border border-border bg-surface-elevated p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-widest text-text-secondary">
                Choose a field type
              </p>
              <button
                type="button"
                onClick={() => setPicking(false)}
                aria-label="Cancel"
                className="text-text-muted hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {TYPE_OPTIONS.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => addQuestion(o.value)}
                  className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary transition-colors hover:border-primary hover:text-primary"
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="inline-flex items-center gap-2 rounded-md border border-dashed border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-primary hover:text-primary"
          >
            <Plus className="h-4 w-4" />
            Add question
          </button>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save questions'}
        </button>
        {dirty && !saving && (
          <span className="text-xs text-text-muted">Changes aren&rsquo;t live until you save.</span>
        )}
      </div>
    </div>
  );
}

function SortableQuestionRow({
  q,
  expanded,
  onToggleExpand,
  onUpdate,
  onDelete,
}: {
  q: AccessQuestion;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (patch: Partial<AccessQuestion>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: q.tempId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-md border border-border bg-surface-elevated"
    >
      {/* Header row */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          {...attributes}
          {...listeners}
          type="button"
          aria-label="Drag to reorder"
          className="touch-none text-text-muted hover:text-text-primary"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onToggleExpand}
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate text-sm font-medium text-text-primary">
            {q.label.trim() || <span className="text-text-muted">Untitled question</span>}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] uppercase tracking-widest text-text-muted">
            <span className="rounded-sm bg-muted px-1.5 py-0.5">{TYPE_LABEL[q.type]}</span>
            <span className="rounded-sm bg-muted px-1.5 py-0.5">{SHOW_TO_LABEL[q.showTo]}</span>
            {q.options.length > 0 && (
              <span className="rounded-sm bg-muted px-1.5 py-0.5">{q.options.length} options</span>
            )}
          </p>
        </button>

        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={q.required}
            onChange={e => onUpdate({ required: e.target.checked })}
            className="h-4 w-4 accent-primary"
          />
          Required
        </label>

        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${q.label || 'question'}`}
          className="text-text-muted transition-colors hover:text-danger"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Expanded inline editor */}
      {expanded && (
        <div className="space-y-4 border-t border-border px-4 py-4">
          <div>
            <FieldLabel htmlFor={`label-${q.tempId}`}>Question label</FieldLabel>
            <input
              id={`label-${q.tempId}`}
              type="text"
              autoFocus
              value={q.label}
              onChange={e => onUpdate({ label: e.target.value })}
              placeholder="e.g. What are you working on?"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <FieldLabel htmlFor={`type-${q.tempId}`}>Type</FieldLabel>
              <select
                id={`type-${q.tempId}`}
                value={q.type}
                onChange={e =>
                  onUpdate({
                    type: e.target.value as FieldType,
                    options: hasOptions(e.target.value as FieldType) ? q.options : [],
                  })
                }
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <FieldLabel htmlFor={`audience-${q.tempId}`}>Audience</FieldLabel>
              <select
                id={`audience-${q.tempId}`}
                value={q.showTo}
                onChange={e => onUpdate({ showTo: e.target.value as ShowTo })}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {SHOW_TO_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <FieldLabel htmlFor={`when-${q.tempId}`}>When asked</FieldLabel>
              <select
                id={`when-${q.tempId}`}
                value={q.whenInFlow ?? 'BEFORE_SUBMIT'}
                onChange={e => onUpdate({ whenInFlow: e.target.value as WhenInFlow })}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {WHEN_IN_FLOW_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {hasOptions(q.type) && (
            <OptionsEditor
              options={q.options}
              onChange={options => onUpdate({ options })}
            />
          )}
        </div>
      )}
    </div>
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (options: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  function add() {
    const val = draft.trim();
    if (!val || options.includes(val)) return;
    onChange([...options, val]);
    setDraft('');
  }

  return (
    <div>
      <FieldLabel>Options</FieldLabel>
      {options.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {options.map(opt => (
            <li
              key={opt}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-text-primary"
            >
              {opt}
              <button
                type="button"
                onClick={() => onChange(options.filter(o => o !== opt))}
                aria-label={`Remove option ${opt}`}
                className="text-text-muted hover:text-danger"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add option…"
          aria-label="Add option"
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="button"
          onClick={add}
          className="shrink-0 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-secondary transition-colors hover:border-primary hover:text-primary"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function FieldLabel({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 block text-xs font-medium text-text-secondary"
    >
      {children}
    </label>
  );
}

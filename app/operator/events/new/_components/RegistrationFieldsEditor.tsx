'use client';

import { useState } from 'react';
import { Plus, X, GripVertical } from 'lucide-react';
import {
  type AccessQuestion,
  type FieldType,
  type ShowTo,
  FIELD_TYPE_OPTIONS,
  SHOW_TO_OPTIONS,
  QUESTION_BANK,
  questionFromBank,
  appliesToMember,
  appliesToGuest,
} from '@/lib/registration-fields';

type Group = 'member' | 'guest';

type Props = {
  group: Group;
  questions: AccessQuestion[];
  onChange: (q: AccessQuestion[]) => void;
};

type Draft = {
  label: string;
  type: FieldType;
  required: boolean;
  showTo: ShowTo;
  options: string[];
  newOption: string;
};

const TYPE_LABEL: Record<FieldType, string> = {
  text: 'Short text',
  textarea: 'Long text',
  select: 'Dropdown',
  multiselect: 'Multiple choice',
  yes_no: 'Yes / No',
  number: 'Number',
  date: 'Date',
  file: 'File upload',
  checkbox: 'Checkbox',
  phone: 'Phone',
  email: 'Email',
};

const SHOW_TO_LABEL: Record<ShowTo, string> = {
  both: 'Members & Guests',
  members: 'Members only',
  guests: 'Guests only',
};

const chrome = 'font-[family-name:var(--font-dm-sans)]';

export function RegistrationFieldsEditor({ group, questions, onChange }: Props) {
  const groupShowTo: ShowTo = group === 'member' ? 'members' : 'guests';
  const emptyDraft: Draft = { label: '', type: 'text', required: false, showTo: groupShowTo, options: [], newOption: '' };

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const groupFields = questions.filter(group === 'member' ? appliesToMember : appliesToGuest);
  const usedLabels = new Set(questions.map((q) => q.label.toLowerCase()));

  const hasOptions = draft.type === 'select' || draft.type === 'multiselect';

  function add(q: AccessQuestion) {
    onChange([...questions, q]);
  }

  function commitDraft() {
    if (!draft.label.trim()) return;
    add({
      tempId: `new-${Date.now()}`,
      label: draft.label.trim(),
      type: draft.type,
      required: draft.required,
      showTo: draft.showTo,
      options: hasOptions ? draft.options.filter(Boolean) : [],
    });
    setDraft(emptyDraft);
    setAdding(false);
  }

  function remove(tempId: string) {
    onChange(questions.filter((q) => q.tempId !== tempId));
  }

  function addOption() {
    const val = draft.newOption.trim();
    if (!val || draft.options.includes(val)) return;
    setDraft((d) => ({ ...d, options: [...d.options, val], newOption: '' }));
  }

  function removeOption(opt: string) {
    setDraft((d) => ({ ...d, options: d.options.filter((o) => o !== opt) }));
  }

  function reorder(from: number, to: number) {
    if (from === to) return;
    const next = [...questions];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  return (
    <div>
      <p className={`mb-2 text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] ${chrome}`}>
        Registration fields
      </p>

      {groupFields.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1.5">
          {groupFields.map((q, idx) => (
            <li
              key={q.tempId}
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragEnd={() => setDragIdx(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIdx !== null) reorder(dragIdx, idx);
                setDragIdx(null);
              }}
              className={`flex items-start justify-between gap-3 rounded-sm border border-[var(--apply-rule)] bg-card px-3 py-2 ${dragIdx === idx ? 'opacity-40' : ''}`}
            >
              <span className="mt-1 cursor-grab text-[var(--apply-muted)] active:cursor-grabbing">
                <GripVertical className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm text-[var(--apply-ink)] ${chrome}`}>
                  {q.label}
                  {q.required ? <span className="ml-1 text-[var(--nobc-red)]" aria-hidden>*</span> : null}
                </p>
                <p className={`mt-0.5 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-widest text-[var(--apply-muted)] ${chrome}`}>
                  <span className="rounded-sm bg-raised px-1.5 py-0.5">{TYPE_LABEL[q.type]}</span>
                  <span className="rounded-sm bg-raised px-1.5 py-0.5">{SHOW_TO_LABEL[q.showTo]}</span>
                  {q.options.length > 0 && (
                    <span className="rounded-sm bg-raised px-1.5 py-0.5">{q.options.length} options</span>
                  )}
                </p>
              </div>
              <button type="button" onClick={() => remove(q.tempId)} aria-label={`Remove ${q.label}`}
                className="shrink-0 text-[var(--apply-muted)] hover:text-[var(--nobc-red)]">
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Question bank */}
      <p className={`mb-1.5 text-[10px] font-medium uppercase tracking-widest text-[var(--apply-muted)] ${chrome}`}>
        Quick add
      </p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {QUESTION_BANK.map((entry) => {
          const used = usedLabels.has(entry.label.toLowerCase());
          return (
            <button key={entry.label} type="button" disabled={used}
              onClick={() => add(questionFromBank(entry, groupShowTo))}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${chrome} ${
                used
                  ? 'cursor-not-allowed border-[var(--apply-rule)] text-[var(--apply-muted)] opacity-50'
                  : 'border-[var(--apply-rule)] text-[var(--apply-ink)] hover:border-[var(--nobc-red)] hover:text-[var(--nobc-red)]'
              }`}>
              {!used && <Plus className="h-3 w-3" />}
              {entry.label}
            </button>
          );
        })}
      </div>

      {/* Draft form */}
      {adding ? (
        <div className="flex flex-col gap-3 rounded-sm border border-[var(--apply-rule)] bg-raised p-3">
          <div>
            <FieldLabel>Label</FieldLabel>
            <input type="text" autoFocus value={draft.label} aria-label="Field label"
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
              placeholder="e.g. Dietary restrictions"
              className={`w-full rounded-sm border border-[var(--apply-rule)] bg-card px-3 py-2 text-sm text-[var(--apply-ink)] focus:border-[var(--nobc-red)] focus:outline-none ${chrome}`}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="min-w-[140px] flex-1">
              <FieldLabel>Type</FieldLabel>
              <select value={draft.type}
                onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as FieldType, options: [] }))}
                className={`w-full rounded-sm border border-[var(--apply-rule)] bg-card px-3 py-2 text-sm text-[var(--apply-ink)] focus:border-[var(--nobc-red)] focus:outline-none ${chrome}`}>
                {FIELD_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[140px] flex-1">
              <FieldLabel>Show to</FieldLabel>
              <select value={draft.showTo}
                onChange={(e) => setDraft((d) => ({ ...d, showTo: e.target.value as ShowTo }))}
                className={`w-full rounded-sm border border-[var(--apply-rule)] bg-card px-3 py-2 text-sm text-[var(--apply-ink)] focus:border-[var(--nobc-red)] focus:outline-none ${chrome}`}>
                {SHOW_TO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Options editor for select / multiselect */}
          {hasOptions && (
            <div>
              <FieldLabel>Options</FieldLabel>
              {draft.options.length > 0 && (
                <ul className="mb-2 flex flex-wrap gap-1.5">
                  {draft.options.map((opt) => (
                    <li key={opt} className={`inline-flex items-center gap-1 rounded-full border border-[var(--apply-rule)] bg-card px-2.5 py-1 text-[11px] text-[var(--apply-ink)] ${chrome}`}>
                      {opt}
                      <button type="button" onClick={() => removeOption(opt)} aria-label={`Remove option ${opt}`}
                        className="text-[var(--apply-muted)] hover:text-[var(--nobc-red)]">
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <input type="text" value={draft.newOption} placeholder="Add option…" aria-label="Add option"
                  onChange={(e) => setDraft((d) => ({ ...d, newOption: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
                  className={`min-w-0 flex-1 rounded-sm border border-[var(--apply-rule)] bg-card px-3 py-2 text-sm text-[var(--apply-ink)] focus:border-[var(--nobc-red)] focus:outline-none ${chrome}`}
                />
                <button type="button" onClick={addOption}
                  className={`shrink-0 rounded-sm border border-[var(--apply-rule)] bg-card px-3 py-2 text-sm text-[var(--apply-muted)] hover:border-[var(--nobc-red)] hover:text-[var(--nobc-red)] ${chrome}`}>
                  Add
                </button>
              </div>
            </div>
          )}

          <label className={`flex cursor-pointer items-center gap-2 text-sm text-[var(--apply-ink)] ${chrome}`}>
            <input type="checkbox" checked={draft.required}
              onChange={(e) => setDraft((d) => ({ ...d, required: e.target.checked }))}
              className="h-4 w-4 accent-[var(--nobc-red)]" />
            Required
          </label>

          <div className="flex items-center gap-3 pt-0.5">
            <button type="button" onClick={commitDraft} disabled={!draft.label.trim()}
              className={`rounded-sm bg-[var(--nobc-red)] px-4 py-2 text-[11px] font-medium uppercase tracking-widest text-[var(--nobc-on-red)] transition-colors hover:bg-[color-mix(in_oklab,var(--nobc-red)_86%,black)] disabled:opacity-50 ${chrome}`}>
              Add field
            </button>
            <button type="button" onClick={() => { setAdding(false); setDraft(emptyDraft); }}
              className={`text-[11px] uppercase tracking-widest text-[var(--apply-muted)] underline-offset-4 hover:underline ${chrome}`}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)}
          className={`inline-flex items-center gap-1.5 rounded-sm border border-dashed border-[var(--apply-rule)] px-3 py-2 text-sm text-[var(--apply-ink)] transition-colors hover:border-[var(--nobc-red)] hover:text-[var(--nobc-red)] ${chrome}`}>
          <Plus className="h-4 w-4" />
          Add custom field
        </button>
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className={`mb-1 block text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] ${chrome}`}>
      {children}
    </label>
  );
}

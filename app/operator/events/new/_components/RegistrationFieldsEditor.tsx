'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
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
  options: string;
};

const TYPE_LABEL: Record<FieldType, string> = {
  text: 'Short text',
  textarea: 'Long text',
  select: 'Dropdown',
  checkbox: 'Checkbox',
  phone: 'Phone',
  email: 'Email',
};

const SHOW_TO_LABEL: Record<ShowTo, string> = {
  both: 'Members & Guests',
  members: 'Members only',
  guests: 'Guests only',
};

export function RegistrationFieldsEditor({ group, questions, onChange }: Props) {
  const groupShowTo: ShowTo = group === 'member' ? 'members' : 'guests';
  const emptyDraft: Draft = {
    label: '',
    type: 'text',
    required: false,
    showTo: groupShowTo,
    options: '',
  };

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const groupFields = questions.filter(
    group === 'member' ? appliesToMember : appliesToGuest,
  );
  const usedLabels = new Set(questions.map((q) => q.label.toLowerCase()));

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
      options:
        draft.type === 'select'
          ? draft.options.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
    });
    setDraft(emptyDraft);
    setAdding(false);
  }

  function remove(tempId: string) {
    onChange(questions.filter((q) => q.tempId !== tempId));
  }

  return (
    <div>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
        Registration fields
      </p>

      {groupFields.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1.5">
          {groupFields.map((q) => (
            <li
              key={q.tempId}
              className="flex items-start justify-between gap-3 rounded-sm border border-[var(--apply-rule)] bg-white px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
                  {q.label}
                  {q.required ? (
                    <span className="ml-1 text-[var(--nobc-red)]" aria-hidden>
                      *
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                  <span className="rounded-sm bg-[#F9F7F2] px-1.5 py-0.5">
                    {TYPE_LABEL[q.type]}
                  </span>
                  <span className="rounded-sm bg-[#F9F7F2] px-1.5 py-0.5">
                    {SHOW_TO_LABEL[q.showTo]}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(q.tempId)}
                aria-label={`Remove ${q.label}`}
                className="shrink-0 text-[var(--apply-muted)] hover:text-[var(--nobc-red)]"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Question Bank */}
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
        Question bank
      </p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {QUESTION_BANK.map((entry) => {
          const used = usedLabels.has(entry.label.toLowerCase());
          return (
            <button
              key={entry.label}
              type="button"
              disabled={used}
              onClick={() => add(questionFromBank(entry, groupShowTo))}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors font-[family-name:var(--font-dm-sans)] ${
                used
                  ? 'cursor-not-allowed border-[var(--apply-rule)] text-[var(--apply-muted)] opacity-50'
                  : 'border-[var(--apply-rule)] text-[var(--apply-ink)] hover:border-[var(--nobc-red)] hover:text-[var(--nobc-red)]'
              }`}
            >
              {!used && <Plus className="h-3 w-3" />}
              {entry.label}
            </button>
          );
        })}
      </div>

      {adding ? (
        <div className="flex flex-col gap-3 rounded-sm border border-[var(--apply-rule)] bg-[#F9F7F2] p-3">
          <div>
            <FieldLabel>Label</FieldLabel>
            <input
              type="text"
              autoFocus
              value={draft.label}
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
              placeholder="e.g. Dietary restrictions"
              className="w-full rounded-sm border border-[var(--apply-rule)] bg-white px-3 py-2 text-sm text-[var(--apply-ink)] focus:border-[var(--nobc-red)] focus:outline-none font-[family-name:var(--font-dm-sans)]"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="min-w-[140px] flex-1">
              <FieldLabel>Type</FieldLabel>
              <select
                value={draft.type}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, type: e.target.value as FieldType }))
                }
                className="w-full rounded-sm border border-[var(--apply-rule)] bg-white px-3 py-2 text-sm text-[var(--apply-ink)] focus:border-[var(--nobc-red)] focus:outline-none font-[family-name:var(--font-dm-sans)]"
              >
                {FIELD_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[140px] flex-1">
              <FieldLabel>Show to</FieldLabel>
              <select
                value={draft.showTo}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, showTo: e.target.value as ShowTo }))
                }
                className="w-full rounded-sm border border-[var(--apply-rule)] bg-white px-3 py-2 text-sm text-[var(--apply-ink)] focus:border-[var(--nobc-red)] focus:outline-none font-[family-name:var(--font-dm-sans)]"
              >
                {SHOW_TO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {draft.type === 'select' && (
            <div>
              <FieldLabel>Options (comma-separated)</FieldLabel>
              <input
                type="text"
                value={draft.options}
                onChange={(e) => setDraft((d) => ({ ...d, options: e.target.value }))}
                placeholder="Option A, Option B"
                className="w-full rounded-sm border border-[var(--apply-rule)] bg-white px-3 py-2 text-sm text-[var(--apply-ink)] focus:border-[var(--nobc-red)] focus:outline-none font-[family-name:var(--font-dm-sans)]"
              />
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
            <input
              type="checkbox"
              checked={draft.required}
              onChange={(e) =>
                setDraft((d) => ({ ...d, required: e.target.checked }))
              }
              className="h-4 w-4 accent-[var(--nobc-red)]"
            />
            Required
          </label>

          <div className="flex items-center gap-3 pt-0.5">
            <button
              type="button"
              onClick={commitDraft}
              disabled={!draft.label.trim()}
              className="rounded-sm bg-[var(--nobc-red)] px-4 py-2 text-[11px] font-medium uppercase tracking-widest text-[var(--nobc-on-red)] transition-colors hover:bg-[color-mix(in_oklab,var(--nobc-red)_86%,black)] disabled:opacity-50 font-[family-name:var(--font-dm-sans)]"
            >
              Add field
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setDraft(emptyDraft);
              }}
              className="text-[11px] uppercase tracking-widest text-[var(--apply-muted)] underline-offset-4 hover:underline font-[family-name:var(--font-dm-sans)]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 rounded-sm border border-dashed border-[var(--apply-rule)] px-3 py-2 text-sm text-[var(--apply-ink)] transition-colors hover:border-[var(--nobc-red)] hover:text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]"
        >
          <Plus className="h-4 w-4" />
          Add custom field
        </button>
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
      {children}
    </label>
  );
}

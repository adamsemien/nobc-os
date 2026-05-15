'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  type AccessQuestion,
  type FieldType,
  type ShowTo,
  FIELD_TYPE_OPTIONS,
  SHOW_TO_OPTIONS,
} from '@/lib/registration-fields';

type Props = {
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

const EMPTY_DRAFT: Draft = {
  label: '',
  type: 'text',
  required: false,
  showTo: 'both',
  options: '',
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

export function RegistrationFieldsEditor({ questions, onChange }: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  function commitDraft() {
    if (!draft.label.trim()) return;
    const q: AccessQuestion = {
      tempId: `new-${Date.now()}`,
      label: draft.label.trim(),
      type: draft.type,
      required: draft.required,
      showTo: draft.showTo,
      options:
        draft.type === 'select'
          ? draft.options.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
    };
    onChange([...questions, q]);
    setDraft(EMPTY_DRAFT);
    setAdding(false);
  }

  function remove(tempId: string) {
    onChange(questions.filter((q) => q.tempId !== tempId));
  }

  return (
    <div className="rounded-sm border border-[var(--apply-rule)] bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[22px] font-normal leading-tight text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
            Registration Fields
          </h3>
          <p className="mt-0.5 text-xs text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            Questions asked during the Answer Fields step
          </p>
        </div>
      </div>

      {questions.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {questions.map((q) => (
            <li
              key={q.tempId}
              className="flex items-start justify-between gap-3 rounded-sm border border-[var(--apply-rule)] bg-[#F9F7F2] px-3 py-2.5"
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
                  <span className="rounded-sm bg-white px-1.5 py-0.5">
                    {TYPE_LABEL[q.type]}
                  </span>
                  <span className="rounded-sm bg-white px-1.5 py-0.5">
                    {SHOW_TO_LABEL[q.showTo]}
                  </span>
                  {q.type === 'select' && q.options.length > 0 ? (
                    <span className="rounded-sm bg-white px-1.5 py-0.5">
                      {q.options.length} options
                    </span>
                  ) : null}
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

      {adding ? (
        <div className="mt-4 flex flex-col gap-3 rounded-sm border border-[var(--apply-rule)] bg-[#F9F7F2] p-4">
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
            <div className="flex-1 min-w-[140px]">
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
            <div className="flex-1 min-w-[140px]">
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
                onChange={(e) =>
                  setDraft((d) => ({ ...d, options: e.target.value }))
                }
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

          <div className="flex items-center gap-3 pt-1">
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
                setDraft(EMPTY_DRAFT);
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
          className="mt-4 inline-flex items-center gap-1.5 rounded-sm border border-dashed border-[var(--apply-rule)] px-3 py-2 text-sm text-[var(--apply-ink)] transition-colors hover:border-[var(--nobc-red)] hover:text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]"
        >
          <Plus className="h-4 w-4" />
          Add Registration Field
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

'use client';

/**
 * Inline-editable field primitive (member-intelligence PR3 Slice 2, F4). Layout-independent:
 * takes a value + provenance + an editable flag + an onSave, and renders a click-to-edit cell.
 * Attio-style treatment — a soft highlight on hover and the provenance badge as the source
 * "sparkle". When an operator saves, the parent's optimistic mutation re-stamps provenance to
 * operator_entered, so an AI/enrichment badge clears to "Operator" (LogicGate pattern).
 *
 * Read-only (no editable affordance) when the caller passes editable=false — the server STAFF
 * gate + merged-record 409 remain the real boundary; this is UX only. Design tokens only.
 */
import { useState } from 'react';
import { ProvenanceBadge } from './ProvenanceBadge';

export type EditableFieldType = 'text' | 'textarea' | 'url' | 'select' | 'checkbox';

export type EditableValue = string | boolean | null;

function displayValue(value: unknown, type: EditableFieldType): string {
  if (type === 'checkbox') return value ? 'Yes' : 'No';
  if (value == null || value === '') return '';
  if (Array.isArray(value)) return value.map(String).join(', ');
  return String(value);
}

export function EditableField({
  label,
  value,
  type = 'text',
  options,
  source,
  editable,
  onSave,
  placeholder = 'Add',
}: {
  label: string;
  value: unknown;
  type?: EditableFieldType;
  options?: string[];
  source?: string | null;
  editable: boolean;
  onSave: (value: EditableValue) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const shown = displayValue(value, type);

  function begin() {
    if (!editable) return;
    setDraft(value == null || typeof value === 'boolean' ? '' : String(value));
    setEditing(true);
  }

  function commitText() {
    const next = draft.trim() === '' ? null : draft.trim();
    setEditing(false);
    if (next !== (value ?? null)) onSave(next);
  }

  const header = (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-text-muted">{label}</span>
      {source ? <ProvenanceBadge source={source} /> : null}
    </div>
  );

  // Checkbox: no separate edit mode — the control toggles and saves in place.
  if (type === 'checkbox') {
    return (
      <div className="space-y-1">
        {header}
        <button
          type="button"
          disabled={!editable}
          onClick={() => editable && onSave(!value)}
          className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm text-text-primary enabled:hover:bg-raised disabled:cursor-default"
        >
          <span
            className={`inline-flex h-4 w-7 items-center rounded-full px-0.5 transition-colors ${value ? 'bg-primary' : 'bg-border-strong'}`}
            aria-hidden
          >
            <span className={`h-3 w-3 rounded-full bg-surface transition-transform ${value ? 'translate-x-3' : ''}`} />
          </span>
          {shown}
        </button>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="space-y-1">
        {header}
        {type === 'select' ? (
          <select
            autoFocus
            value={draft}
            onChange={(e) => {
              const next = e.target.value === '' ? null : e.target.value;
              setEditing(false);
              if (next !== (value ?? null)) onSave(next);
            }}
            onBlur={() => setEditing(false)}
            className="w-full rounded-md border border-border-strong bg-surface px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">—</option>
            {(options ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : type === 'textarea' ? (
          <textarea
            autoFocus
            rows={4}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(false);
            }}
            className="w-full rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm leading-relaxed text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        ) : (
          <input
            autoFocus
            type={type === 'url' ? 'url' : 'text'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitText();
              else if (e.key === 'Escape') setEditing(false);
            }}
            className="w-full rounded-md border border-border-strong bg-surface px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {header}
      {editable ? (
        <button
          type="button"
          onClick={begin}
          className="block w-full rounded-md px-2 py-1 text-left text-sm text-text-primary hover:bg-raised focus:bg-raised focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {shown || <span className="text-text-tertiary">{placeholder}</span>}
        </button>
      ) : (
        <div className="px-2 py-1 text-sm text-text-primary">
          {shown || <span className="text-text-tertiary">—</span>}
        </div>
      )}
    </div>
  );
}

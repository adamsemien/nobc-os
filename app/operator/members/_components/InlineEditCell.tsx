'use client';

import { useState } from 'react';
import { patchMemberFields } from '@/lib/member-client';

// Roster inline edit — Attio-style editable cell in the members list. Writes a single
// first-class member column via the existing PATCH path (server stamps provenance,
// operator_entered). STAFF+ only; read-only operators see plain text. No record open needed.
export function InlineEditCell({
  memberId,
  field,
  initialValue,
  canEdit,
  placeholder = 'Add',
}: {
  memberId: string;
  field: string;
  initialValue: string | null;
  canEdit: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState<string | null>(initialValue);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  if (!canEdit) {
    return value ? (
      <span className="truncate text-sm text-text-secondary">{value}</span>
    ) : (
      <span className="text-sm text-text-muted">—</span>
    );
  }

  async function save() {
    const next = draft.trim() ? draft.trim() : null;
    if (next === (value ?? null)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(false);
    try {
      await patchMemberFields(memberId, { [field]: { value: next } });
      setValue(next);
      setEditing(false);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void save();
          }
          if (e.key === 'Escape') {
            setEditing(false);
            setError(false);
          }
        }}
        aria-label="Edit value"
        className={`h-7 w-full max-w-[12rem] rounded border bg-surface px-2 text-sm text-text-primary focus:outline-none ${
          error ? 'border-danger' : 'border-primary'
        }`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value ?? '');
        setEditing(true);
      }}
      title="Click to edit"
      className="group/cell -mx-1 flex w-full max-w-[12rem] items-center truncate rounded px-1 py-0.5 text-left text-sm transition-colors hover:bg-muted"
    >
      {value ? (
        <span className="truncate text-text-primary">{value}</span>
      ) : (
        <span className="text-text-muted opacity-60 transition-opacity group-hover/cell:opacity-100">
          {placeholder}
        </span>
      )}
    </button>
  );
}

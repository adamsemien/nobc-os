'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2 } from 'lucide-react';
import { ConfirmModal } from '@/components/ui';

const inputClass =
  'h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-[var(--primary)]';

/** Person detail actions: STAFF inline edit (firstName/lastName/phone only —
 *  email and clerkUserId are identity keys and not editable from the UI) and
 *  the ADMIN hard delete with confirm. Refusals come from the server and are
 *  shown verbatim. */
export function EditPersonFields({
  personId,
  firstName,
  lastName,
  phone,
  canEdit,
  canDelete,
}: {
  personId: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [first, setFirst] = useState(firstName ?? '');
  const [last, setLast] = useState(lastName ?? '');
  const [phoneValue, setPhoneValue] = useState(phone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!canEdit && !canDelete) return null;

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/operator/people/${personId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: first, lastName: last, phone: phoneValue }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Could not save changes.');
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError('Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  async function destroy() {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/operator/people/${personId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setConfirmingDelete(false);
        setError(data?.error ?? 'Could not delete this person.');
        return;
      }
      router.push('/operator/people');
      router.refresh();
    } catch {
      setConfirmingDelete(false);
      setError('Could not delete this person.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mb-4">
      {editing ? (
        <div className="w-full max-w-xl rounded-md border border-border bg-surface p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-text-secondary">
                First name
              </span>
              <input
                autoFocus
                className={inputClass}
                value={first}
                onChange={(e) => setFirst(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && save()}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-text-secondary">Last name</span>
              <input
                className={inputClass}
                value={last}
                onChange={(e) => setLast(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && save()}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-text-secondary">Phone</span>
              <input
                type="tel"
                className={inputClass}
                value={phoneValue}
                onChange={(e) => setPhoneValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && save()}
              />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex h-9 items-center rounded-md px-3.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--primary)' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="inline-flex h-9 items-center rounded-md border border-border px-3.5 text-sm font-medium text-text-secondary hover:text-text-primary"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3.5 text-sm font-medium text-text-secondary hover:text-text-primary"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit details
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3.5 text-sm font-medium transition-colors hover:text-text-primary"
              style={{ color: 'var(--danger)' }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          ) : null}
        </div>
      )}
      {error ? (
        <p className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      ) : null}
      {confirmingDelete ? (
        <ConfirmModal
          title="Delete this person?"
          subtitle="Removes the record and its provenance permanently. Records with a membership, an application, or merge history refuse deletion."
          confirmLabel={deleting ? 'Deleting…' : 'Delete person'}
          confirmTone="danger"
          busy={deleting}
          onConfirm={destroy}
          onCancel={() => setConfirmingDelete(false)}
        />
      ) : null}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2 } from 'lucide-react';
import { ConfirmModal } from '@/components/ui';
import { ORGANIZATION_KIND_LABELS } from '@/lib/crm/labels';

const inputClass =
  'h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-[var(--primary)]';

/** Organization detail actions — mirrors the Person pattern: STAFF inline edit
 *  (name/kind/domain/website/notes), ADMIN delete with confirm. Refusals come
 *  from the server and are shown verbatim (delete blocks while affiliations
 *  exist). */
export function EditOrganizationFields({
  organizationId,
  name,
  kind,
  domain,
  website,
  notes,
  canEdit,
  canDelete,
}: {
  organizationId: string;
  name: string;
  kind: string;
  domain: string | null;
  website: string | null;
  notes: string | null;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState(name);
  const [kindValue, setKindValue] = useState(kind);
  const [domainValue, setDomainValue] = useState(domain ?? '');
  const [websiteValue, setWebsiteValue] = useState(website ?? '');
  const [notesValue, setNotesValue] = useState(notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!canEdit && !canDelete) return null;

  async function save() {
    if (saving || !nameValue.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/operator/organizations/${organizationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameValue,
          kind: kindValue,
          domain: domainValue || null,
          website: websiteValue || null,
          notes: notesValue || null,
        }),
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
      const res = await fetch(`/api/operator/organizations/${organizationId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setConfirmingDelete(false);
        setError(data?.error ?? 'Could not delete this organization.');
        return;
      }
      router.push('/operator/organizations');
      router.refresh();
    } catch {
      setConfirmingDelete(false);
      setError('Could not delete this organization.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mb-4">
      {editing ? (
        <div className="w-full max-w-xl rounded-md border border-border bg-surface p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-text-secondary">Name</span>
              <input
                autoFocus
                className={inputClass}
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-text-secondary">Type</span>
              <select
                className={inputClass}
                value={kindValue}
                onChange={(e) => setKindValue(e.target.value)}
              >
                {Object.entries(ORGANIZATION_KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-text-secondary">Domain</span>
              <input
                className={inputClass}
                value={domainValue}
                onChange={(e) => setDomainValue(e.target.value)}
                placeholder="acme.com"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-text-secondary">Website</span>
              <input
                className={inputClass}
                value={websiteValue}
                onChange={(e) => setWebsiteValue(e.target.value)}
                placeholder="https://acme.com"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-text-secondary">Notes</span>
              <textarea
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                rows={3}
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
              />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving || !nameValue.trim()}
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
          title="Delete this organization?"
          subtitle="Removes the account permanently. Deletion is refused while people are affiliated."
          confirmLabel={deleting ? 'Deleting…' : 'Delete organization'}
          confirmTone="danger"
          busy={deleting}
          onConfirm={destroy}
          onCancel={() => setConfirmingDelete(false)}
        />
      ) : null}
    </div>
  );
}

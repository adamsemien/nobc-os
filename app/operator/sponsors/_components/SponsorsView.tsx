'use client';

import { useState } from 'react';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { AddSponsorDrawer, type CreatedSponsor } from './AddSponsorDrawer';

export type SponsorRow = {
  id: string;
  name: string;
  contactEmail: string | null;
  rightsFeeCents: number | null;
  createdAt: string;
};

function formatFee(cents: number | null): string {
  if (cents == null) return '-';
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const inputCls =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none';

/** Sponsors list. Reads are STAFF (the page gate); every write goes through
 *  the ADMIN-gated /api/operator/sponsors routes — `canManage` only hides
 *  affordances that would 403, it is not the security boundary. */
export function SponsorsView({
  initialSponsors,
  canManage,
}: {
  initialSponsors: SponsorRow[];
  canManage: boolean;
}) {
  const [sponsors, setSponsors] = useState<SponsorRow[]>(initialSponsors);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', contactEmail: '', rightsFeeDollars: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SponsorRow | null>(null);

  function onCreated(s: CreatedSponsor) {
    setSponsors((prev) => [
      {
        id: s.id,
        name: s.name,
        contactEmail: s.contactEmail,
        rightsFeeCents: s.rightsFeeCents,
        createdAt: s.createdAt,
      },
      ...prev,
    ]);
  }

  function startEdit(s: SponsorRow) {
    if (!canManage) return;
    setError(null);
    setEditingId(s.id);
    setEditForm({
      name: s.name,
      contactEmail: s.contactEmail ?? '',
      rightsFeeDollars: s.rightsFeeCents != null ? String(s.rightsFeeCents / 100) : '',
    });
  }

  async function saveEdit(id: string) {
    setError(null);
    const name = editForm.name.trim();
    if (!name) {
      setError('Name is required.');
      return;
    }
    let rightsFeeCents: number | null = null;
    const feeRaw = editForm.rightsFeeDollars.trim();
    if (feeRaw) {
      const dollars = Number(feeRaw);
      if (!Number.isFinite(dollars) || dollars < 0) {
        setError('Rights fee must be a non-negative number.');
        return;
      }
      rightsFeeCents = Math.round(dollars * 100);
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/operator/sponsors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          contactEmail: editForm.contactEmail.trim() || null,
          rightsFeeCents,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? 'Could not save.');
        return;
      }
      setSponsors((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, name, contactEmail: editForm.contactEmail.trim() || null, rightsFeeCents }
            : s,
        ),
      );
      setEditingId(null);
    } catch {
      setError('Network error. Nothing was saved.');
    } finally {
      setBusy(false);
    }
  }

  async function doDelete(s: SponsorRow) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/operator/sponsors/${s.id}`, { method: 'DELETE' });
      const payload = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
      if (!res.ok) {
        setError(payload.detail ?? payload.error ?? 'Could not delete.');
        return;
      }
      setSponsors((prev) => prev.filter((row) => row.id !== s.id));
      setEditingId(null);
    } catch {
      setError('Network error. Nothing was deleted.');
    } finally {
      setBusy(false);
      setConfirmDelete(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-text-primary">Sponsors</h1>
          <p className="text-xs text-text-muted">
            {sponsors.length} sponsor{sponsors.length === 1 ? '' : 's'} · brand profiles that power
            Sponsor Intelligence, brand-lift surveys, and recaps.
          </p>
        </div>
        {canManage ? <AddSponsorDrawer onCreated={onCreated} /> : null}
      </header>

      {error ? (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {sponsors.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface px-6 py-12 text-center text-sm text-text-muted">
          {canManage
            ? 'No sponsors yet. Add your first sponsor to unlock briefs, surveys, and recaps.'
            : 'No sponsors yet. An admin can add the first sponsor.'}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-text-secondary">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Contact</th>
                <th className="px-4 py-2 font-medium">Rights fee</th>
                <th className="px-4 py-2 font-medium">Added</th>
                {canManage ? <th className="px-4 py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {sponsors.map((s) =>
                editingId === s.id ? (
                  <tr key={s.id} className="border-t border-border bg-surface-elevated">
                    <td className="px-4 py-2">
                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        aria-label="Sponsor name"
                        className={inputCls}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={editForm.contactEmail}
                        onChange={(e) => setEditForm((f) => ({ ...f, contactEmail: e.target.value }))}
                        placeholder="contact@brand.com"
                        aria-label="Contact email"
                        className={inputCls}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={editForm.rightsFeeDollars}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, rightsFeeDollars: e.target.value }))
                        }
                        placeholder="Dollars"
                        aria-label="Rights fee in dollars"
                        className={inputCls}
                      />
                    </td>
                    <td className="px-4 py-2 text-xs text-text-muted">
                      {new Date(s.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => saveEdit(s.id)}
                        className="rounded px-2 py-1 text-xs font-semibold text-primary hover:bg-muted disabled:opacity-50"
                      >
                        {busy ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setEditingId(null)}
                        className="rounded px-2 py-1 text-xs text-text-secondary hover:bg-muted disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmDelete(s)}
                        className="rounded px-2 py-1 text-xs font-medium text-danger hover:bg-muted disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-4 py-2 text-text-primary">{s.name}</td>
                    <td className="px-4 py-2 text-text-secondary">{s.contactEmail ?? '-'}</td>
                    <td className="px-4 py-2 tabular-nums text-text-secondary">
                      {formatFee(s.rightsFeeCents)}
                    </td>
                    <td className="px-4 py-2 text-xs text-text-muted">
                      {new Date(s.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    {canManage ? (
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => startEdit(s)}
                          className="rounded px-2 py-1 text-xs font-medium text-text-secondary hover:bg-muted"
                        >
                          Edit
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      {confirmDelete ? (
        <ConfirmModal
          title={`Delete ${confirmDelete.name}?`}
          subtitle="Sponsors with linked recaps, assets, surveys, series, or registration questions are refused. This cannot be undone."
          confirmLabel="Delete"
          confirmTone="danger"
          busy={busy}
          onConfirm={() => void doDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      ) : null}
    </div>
  );
}

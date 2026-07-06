'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

const KIND_OPTIONS = [
  { value: 'sponsor', label: 'Sponsor' },
  { value: 'saas_prospect', label: 'SaaS prospect' },
  { value: 'member_company', label: 'Member company' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'other', label: 'Other' },
] as const;

const inputClass =
  'h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-[var(--primary)]';

export function NewOrganizationForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<string>('other');
  const [domain, setDomain] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/operator/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, kind, domain: domain || null }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Could not create organization.');
        return;
      }
      setName('');
      setDomain('');
      setKind('other');
      setOpen(false);
      router.refresh();
    } catch {
      setError('Could not create organization.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        style={{ background: 'var(--primary)' }}
      >
        <Plus className="h-4 w-4" />
        New organization
      </button>
    );
  }

  return (
    <div className="w-full max-w-xl rounded-md border border-border bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-text-secondary">Name</span>
          <input
            autoFocus
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Acme & Co."
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-secondary">Type</span>
          <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}>
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-secondary">
            Domain (optional)
          </span>
          <input
            className={inputClass}
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="acme.com"
          />
        </label>
      </div>
      {error ? (
        <p className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={saving || !name.trim()}
          className="inline-flex h-9 items-center rounded-md px-3.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: 'var(--primary)' }}
        >
          {saving ? 'Creating…' : 'Create organization'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex h-9 items-center rounded-md border border-border px-3.5 text-sm font-medium text-text-secondary hover:text-text-primary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

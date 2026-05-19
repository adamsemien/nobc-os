'use client';

import { useEffect, useState, useCallback } from 'react';
import { Trash2 } from 'lucide-react';

type ListType = 'PURPLE' | 'BLOCKED';

type WatchEntry = {
  id: string;
  type: ListType;
  matchEmail: string | null;
  matchPhone: string | null;
  matchInstagram: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
};

const TAB_META: Record<ListType, { label: string; description: string; emptyLabel: string }> = {
  PURPLE: {
    label: 'Purple List',
    description: 'Applicants on this list are auto-approved on submission. No manual review needed.',
    emptyLabel: 'No purple list entries.',
  },
  BLOCKED: {
    label: 'Blocked List',
    description: 'Applicants matching these criteria are auto-rejected on submission. No email sent.',
    emptyLabel: 'No blocked entries.',
  },
};

function inputClass(extra = '') {
  return `w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${extra}`;
}

export default function ListsPage() {
  const [activeTab, setActiveTab] = useState<ListType>('PURPLE');
  const [entries, setEntries] = useState<WatchEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Add form
  const [addEmail, setAddEmail] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addInstagram, setAddInstagram] = useState('');
  const [addNote, setAddNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  // Removal
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/operator/lists?type=${activeTab}`);
      const data = await res.json() as { entries: WatchEntry[] };
      setEntries(data.entries ?? []);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => { void load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError('');
    if (!addEmail && !addPhone && !addInstagram) {
      setAddError('Enter at least one match criterion.');
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/operator/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: activeTab,
          matchEmail: addEmail || null,
          matchPhone: addPhone || null,
          matchInstagram: addInstagram || null,
          note: addNote || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error: unknown };
        setAddError(typeof err.error === 'string' ? err.error : 'Failed to add entry.');
        return;
      }
      setAddEmail(''); setAddPhone(''); setAddInstagram(''); setAddNote('');
      await load();
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(id: string) {
    setRemoving(id);
    try {
      await fetch(`/api/operator/lists/${id}`, { method: 'DELETE' });
      setEntries(prev => prev.filter(e => e.id !== id));
    } finally {
      setRemoving(null);
    }
  }

  const filtered = search
    ? entries.filter(
        e =>
          e.matchEmail?.toLowerCase().includes(search.toLowerCase()) ||
          e.matchPhone?.includes(search) ||
          e.matchInstagram?.toLowerCase().includes(search.toLowerCase()) ||
          e.note?.toLowerCase().includes(search.toLowerCase()),
      )
    : entries;

  const meta = TAB_META[activeTab];

  return (
    <div className="px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <h1
          className="mb-1 text-3xl font-normal"
          style={{ fontFamily: "'PP Editorial New', Georgia, serif", color: 'var(--text-primary)' }}
        >
          Lists
        </h1>
        <p className="mb-8 text-sm" style={{ color: 'var(--text-muted)' }}>
          Purple List auto-approves matching applicants. Blocked List auto-rejects them.
        </p>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-lg p-1" style={{ background: 'var(--raised)' }}>
          {(['PURPLE', 'BLOCKED'] as ListType[]).map(tab => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setSearch(''); }}
              className="flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors"
              style={{
                background: activeTab === tab ? 'var(--surface)' : 'transparent',
                color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: activeTab === tab ? 'var(--card-shadow)' : 'none',
              }}
            >
              {TAB_META[tab].label}
            </button>
          ))}
        </div>

        <p className="mb-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {meta.description}
        </p>

        {/* Add form */}
        <form
          onSubmit={handleAdd}
          className="mb-8 rounded-lg border p-5"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        >
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
            Add entry
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Email
              </label>
              <input
                type="email"
                value={addEmail}
                onChange={e => setAddEmail(e.target.value)}
                placeholder="name@example.com"
                className={inputClass()}
                style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Phone
              </label>
              <input
                type="tel"
                value={addPhone}
                onChange={e => setAddPhone(e.target.value)}
                placeholder="+1 555 000 0000"
                className={inputClass()}
                style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Instagram
              </label>
              <input
                type="text"
                value={addInstagram}
                onChange={e => setAddInstagram(e.target.value)}
                placeholder="@handle"
                className={inputClass()}
                style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Note (internal)
            </label>
            <input
              type="text"
              value={addNote}
              onChange={e => setAddNote(e.target.value)}
              placeholder="Optional internal note"
              className={inputClass()}
              style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text-primary)' }}
            />
          </div>
          {addError && (
            <p className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>{addError}</p>
          )}
          <div className="mt-4">
            <button
              type="submit"
              disabled={adding}
              className="rounded px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-50"
              style={{ background: 'var(--primary)', color: 'var(--on-primary)', borderRadius: '6px' }}
            >
              {adding ? 'Adding…' : `Add to ${meta.label}`}
            </button>
          </div>
        </form>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search email, phone, or handle…"
            className={inputClass('max-w-sm')}
            style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }}
          />
        </div>

        {/* Table */}
        {loading ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <div
            className="rounded-lg border p-10 text-center"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{meta.emptyLabel}</p>
          </div>
        ) : (
          <div
            className="rounded-lg border overflow-hidden"
            style={{ borderColor: 'var(--border)' }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--raised)', borderBottom: `1px solid var(--border)` }}>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.1em]" style={{ color: 'var(--text-tertiary)' }}>
                    Match criteria
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.1em]" style={{ color: 'var(--text-tertiary)' }}>
                    Note
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.1em]" style={{ color: 'var(--text-tertiary)' }}>
                    Added
                  </th>
                  <th className="w-10 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry, i) => (
                  <tr
                    key={entry.id}
                    style={{
                      background: i % 2 === 0 ? 'var(--surface)' : 'var(--bg)',
                      borderBottom: i < filtered.length - 1 ? `1px solid var(--border)` : 'none',
                    }}
                  >
                    <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>
                      <div className="flex flex-col gap-0.5">
                        {entry.matchEmail && (
                          <span className="text-xs">{entry.matchEmail}</span>
                        )}
                        {entry.matchPhone && (
                          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{entry.matchPhone}</span>
                        )}
                        {entry.matchInstagram && (
                          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>@{entry.matchInstagram.replace(/^@/, '')}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {entry.note || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                      {new Date(entry.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRemove(entry.id)}
                        disabled={removing === entry.id}
                        className="rounded p-1 transition-opacity hover:opacity-70 disabled:opacity-30"
                        title="Remove"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

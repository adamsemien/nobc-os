'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';

export type PersonTagItem = { id: string; name: string; color: string | null };

/** Person-capable tags UI (CRM spine Slice 0) — the first human-UI control
 *  for the polymorphic Tag/EntityTag model. Previously only agent/MCP tooling
 *  (lib/mcp/legacy-tools.ts) constructed EntityTag rows, and never for
 *  entityType: 'person'. Type a name, press Enter to apply (find-or-create by
 *  workspace-unique slug); click × to remove. */
export function PersonTags({
  personId,
  tags,
  canEdit,
}: {
  personId: string;
  tags: PersonTagItem[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addTag() {
    const name = draft.trim();
    if (!name || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/operator/people/${personId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Could not add tag.');
        return;
      }
      setDraft('');
      router.refresh();
    } catch {
      setError('Could not add tag.');
    } finally {
      setSaving(false);
    }
  }

  async function removeTag(tagId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/operator/people/${personId}/tags`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Could not remove tag.');
        return;
      }
      router.refresh();
    } catch {
      setError('Could not remove tag.');
    }
  }

  return (
    <div>
      {tags.length === 0 && !canEdit ? (
        <p className="text-[13px] text-text-secondary">No tags.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[12px] text-text-primary"
              style={tag.color ? { borderColor: tag.color } : undefined}
            >
              {tag.name}
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => removeTag(tag.id)}
                  aria-label={`Remove ${tag.name}`}
                  className="text-text-tertiary hover:text-text-primary"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      )}
      {canEdit ? (
        <div className="mt-2 flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTag()}
            placeholder="Add a tag…"
            className="h-8 w-full max-w-[220px] rounded-md border border-border bg-surface px-2.5 text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
          <button
            type="button"
            onClick={addTag}
            disabled={saving || !draft.trim()}
            className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-[12px] font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            {saving ? 'Adding…' : 'Add'}
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

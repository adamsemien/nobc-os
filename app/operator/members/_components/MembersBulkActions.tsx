'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

export type MembersBulkMember = {
  id: string;
  fullName: string;
  email: string;
  archetype: string | null;
  aiScore: number | null;
  totalEventsAttended: number;
  lastAttendedDate: string | null;
  createdAt: string;
  isVip: boolean;
  isBlocked: boolean;
};

type Action = 'purple' | 'unpurple' | 'block' | 'unblock' | 'tag';

const ACTION_LABEL: Record<Action, string> = {
  purple: 'Add to Purple list',
  unpurple: 'Remove from Purple list',
  block: 'Block',
  unblock: 'Unblock',
  tag: 'Tag',
};

export function MembersBulkActions({
  members,
  children,
}: {
  members: MembersBulkMember[];
  children: (
    selected: Set<string>,
    toggle: (id: string) => void,
  ) => ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Action | null>(null);
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [tagValue, setTagValue] = useState('');
  const [flash, setFlash] = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const run = useCallback(
    async (action: Action) => {
      setPending(action);
      const ids = Array.from(selected);
      try {
        const res = await fetch('/api/operator/members/bulk', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ids,
            action,
            tag: action === 'tag' ? tagValue.trim() : undefined,
          }),
        });
        const payload = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          succeeded?: number;
          failed?: number;
          error?: string;
        };
        if (!res.ok || !payload.ok) {
          setFlash(payload.error ?? 'Bulk action failed.');
        } else {
          const succeeded = payload.succeeded ?? ids.length;
          setFlash(`${ACTION_LABEL[action]} applied to ${succeeded} member${succeeded === 1 ? '' : 's'}.`);
          setSelected(new Set());
        }
      } catch {
        setFlash('Network error. Try again.');
      } finally {
        setPending(null);
        setConfirm(null);
        window.setTimeout(() => setFlash(null), 4000);
      }
    },
    [selected, tagValue],
  );

  const count = selected.size;
  const allCount = members.length;

  return (
    <div className="relative">
      {flash ? (
        <div
          role="status"
          className="mb-3 rounded-md border border-border bg-surface px-4 py-2 text-sm text-text-primary"
        >
          {flash}
        </div>
      ) : null}

      {count > 0 ? (
        <div
          className="sticky top-2 z-20 mb-3 flex items-center gap-3 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm shadow-sm"
        >
          <span className="text-text-secondary">
            {count} of {allCount} selected
          </span>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs text-text-muted hover:text-text-primary"
          >
            Clear
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!!pending}
              onClick={() => run('purple')}
              className="rounded px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
              style={{ color: 'var(--accent, var(--primary))' }}
            >
              ✦ Add to Purple list
            </button>
            <button
              type="button"
              disabled={!!pending}
              onClick={() => setConfirm('block')}
              className="rounded px-2 py-1 text-xs font-medium text-danger hover:bg-muted disabled:opacity-50"
            >
              Block
            </button>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={tagValue}
                onChange={(e) => setTagValue(e.target.value)}
                placeholder="tag…"
                className="h-7 w-24 rounded border border-border bg-surface px-2 text-xs focus:border-primary focus:outline-none"
              />
              <button
                type="button"
                disabled={!!pending || !tagValue.trim()}
                onClick={() => run('tag')}
                className="rounded px-2 py-1 text-xs font-medium text-text-secondary hover:bg-muted disabled:opacity-50"
              >
                Tag
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {children(selected, toggle)}

      {confirm ? (
        <ConfirmModal
          title={`${ACTION_LABEL[confirm]} ${count} member${count === 1 ? '' : 's'}?`}
          subtitle="You can reverse this from the member detail page."
          confirmLabel={ACTION_LABEL[confirm]}
          confirmTone="danger"
          onConfirm={() => run(confirm)}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </div>
  );
}

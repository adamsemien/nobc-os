'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Avatar } from '@/components/ui/Avatar';

type Operator = {
  id: string;
  name: string;
  imageUrl: string | null;
  role: string;
};

type Comment = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  mentions: string[];
  createdAt: string;
  deletedAt: string | null;
};

function renderInline(text: string, operators: Operator[]): React.ReactNode {
  // Render @mentions as bold + linkable; bold/italic/link light-markdown.
  const opMap = new Map(operators.map((o) => [`@${o.name.split(' ')[0].toLowerCase()}`, o]));
  const parts: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const at = text.indexOf('@', i);
    if (at === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (at > i) parts.push(text.slice(i, at));
    // Match @firstname (letters only)
    let end = at + 1;
    while (end < text.length && /[a-zA-Z]/.test(text[end])) end++;
    const handle = text.slice(at, end).toLowerCase();
    if (opMap.has(handle)) {
      parts.push(
        <span
          key={`m-${key++}`}
          className="rounded px-1 font-semibold"
          style={{
            color: 'var(--primary)',
            background: 'var(--primary-soft)',
          }}
        >
          @{opMap.get(handle)!.name.split(' ')[0]}
        </span>,
      );
    } else {
      parts.push(text.slice(at, end));
    }
    i = end;
  }
  return parts;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function CommentThread({
  entityType,
  entityId,
}: {
  entityType: 'application' | 'member' | 'event' | 'rsvp';
  entityId: string;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [acQuery, setAcQuery] = useState('');
  const [acIndex, setAcIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    const url = `/api/operator/comments?entityType=${entityType}&entityId=${entityId}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return;
    const data = (await res.json()) as { comments: Comment[] };
    setComments(data.comments);
  }, [entityType, entityId]);

  useEffect(() => {
    void load();
    void fetch('/api/operator/operators', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { operators: [] }))
      .then((d: { operators: Operator[] }) => setOperators(d.operators ?? []))
      .catch(() => {});
  }, [load]);

  const acMatches = useMemo(() => {
    if (!showAutocomplete) return [];
    const q = acQuery.toLowerCase();
    if (!q) return operators.slice(0, 5);
    return operators
      .filter((o) => o.name.toLowerCase().includes(q))
      .slice(0, 5);
  }, [operators, acQuery, showAutocomplete]);

  const onChangeBody = (v: string) => {
    setBody(v);
    const el = textareaRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? v.length;
    const before = v.slice(0, caret);
    const m = before.match(/@([a-zA-Z]*)$/);
    if (m) {
      setShowAutocomplete(true);
      setAcQuery(m[1]);
      setAcIndex(0);
    } else {
      setShowAutocomplete(false);
    }
  };

  const insertMention = (op: Operator) => {
    const el = textareaRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? body.length;
    const before = body.slice(0, caret);
    const after = body.slice(caret);
    const newBefore = before.replace(/@[a-zA-Z]*$/, `@${op.name.split(' ')[0]} `);
    const merged = newBefore + after;
    setBody(merged);
    setShowAutocomplete(false);
    window.setTimeout(() => {
      el.focus();
      const pos = newBefore.length;
      el.setSelectionRange(pos, pos);
    }, 0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showAutocomplete && acMatches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAcIndex((i) => (i + 1) % acMatches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAcIndex((i) => (i - 1 + acMatches.length) % acMatches.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(acMatches[acIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setShowAutocomplete(false);
        return;
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  };

  const submit = useCallback(async () => {
    const text = body.trim();
    if (!text) return;
    setSubmitting(true);
    setError(null);
    // Extract mentioned ids by re-matching firstname
    const mentions: string[] = [];
    const seen = new Set<string>();
    for (const op of operators) {
      const handle = `@${op.name.split(' ')[0]}`;
      if (new RegExp(`\\b${handle}\\b`, 'i').test(text) && !seen.has(op.id)) {
        mentions.push(op.id);
        seen.add(op.id);
      }
    }
    try {
      const res = await fetch('/api/operator/comments', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType, entityId, body: text, mentions }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(typeof j.error === 'string' ? j.error : 'Could not post.');
      } else {
        setBody('');
        await load();
      }
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSubmitting(false);
    }
  }, [body, entityType, entityId, operators, load]);

  return (
    <section className="mt-6 border-t border-border pt-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
          Notes
        </h3>
        <span className="text-[10px] text-text-muted">
          {comments.length} note{comments.length === 1 ? '' : 's'}
        </span>
      </div>

      {comments.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">
          No notes yet. Leave one for your team.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {comments.map((c) => (
            <li
              key={c.id}
              className="rounded-md border border-border bg-surface p-3"
            >
              <div className="flex items-center gap-2">
                <Avatar name={c.authorName} size={22} />
                <span className="text-sm font-medium text-text-primary">
                  {c.authorName}
                </span>
                <span className="ml-auto text-[11px] text-text-muted">
                  {formatRelative(c.createdAt)}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-text-primary">
                {renderInline(c.body, operators)}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="relative mt-4">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => onChangeBody(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Add a note for your team. Type @ to mention."
          rows={3}
          className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
        />
        {showAutocomplete && acMatches.length > 0 ? (
          <ul
            className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-auto rounded-md border border-border shadow-lg"
            style={{ background: 'var(--surface-elevated, var(--surface))' }}
          >
            {acMatches.map((op, idx) => (
              <li key={op.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(op);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                    idx === acIndex
                      ? 'bg-muted text-text-primary'
                      : 'text-text-secondary hover:bg-muted'
                  }`}
                >
                  <Avatar name={op.name} photoUrl={op.imageUrl} size={20} />
                  <span className="font-medium">{op.name}</span>
                  <span className="ml-auto text-[10px] uppercase tracking-wider text-text-muted">
                    {op.role.replace('org:', '')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-text-muted">⌘+Enter to post</span>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!body.trim() || submitting}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary disabled:opacity-50"
          >
            {submitting ? 'Posting…' : 'Post note'}
          </button>
        </div>
        {error ? (
          <p className="mt-1 text-xs text-danger">{error}</p>
        ) : null}
      </div>
    </section>
  );
}

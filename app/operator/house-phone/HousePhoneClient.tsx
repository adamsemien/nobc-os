'use client';

/** House Phone — shared multi-operator SMS inbox for live events.
 *
 *  Reads /api/sms/conversations (polled every 4s for near-real-time updates;
 *  inbound SMS arrive via a separate Railway service that writes to the same
 *  Postgres). Replies POST /api/sms/reply (Twilio REST send). The per-
 *  conversation AI auto-reply toggle and event association PATCH
 *  /api/sms/conversation/[id]. No client-side hex — semantic CSS vars only. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Send, MessageSquare } from 'lucide-react';

type Direction = 'INBOUND' | 'OUTBOUND';

type SmsMessageDto = {
  id: string;
  direction: Direction;
  body: string;
  aiGenerated: boolean;
  createdAt: string;
};

type ConversationDto = {
  id: string;
  phone: string;
  name: string | null;
  eventId: string | null;
  event: { id: string; title: string } | null;
  aiEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  messages: SmsMessageDto[];
  lastMessageAt: string;
  lastMessagePreview: string;
  unread: boolean;
};

type EventOption = { id: string; title: string };

const POLL_MS = 4000;

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function HousePhoneClient({ events }: { events: EventOption[] }) {
  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/sms/conversations', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { conversations: ConversationDto[] };
      setConversations(data.conversations);
      setSelectedId((prev) => prev ?? data.conversations[0]?.id ?? null);
    } catch {
      /* transient — next poll retries */
    } finally {
      setLoaded(true);
    }
  }, []);

  // Initial load + polling.
  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  // Keep the thread pinned to the newest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [selectedId, selected?.messages.length]);

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    const text = replyText.trim();
    if (!selected || !text || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/sms/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: selected.id, body: text }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? 'Failed to send');
      }
      setReplyText('');
      await fetchConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  async function patchConversation(id: string, body: Record<string, unknown>) {
    try {
      await fetch(`/api/sms/conversation/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      /* refetch below reconciles */
    }
    fetchConversations();
  }

  function toggleAi() {
    if (!selected) return;
    const next = !selected.aiEnabled;
    setConversations((prev) =>
      prev.map((c) => (c.id === selected.id ? { ...c, aiEnabled: next } : c)),
    );
    patchConversation(selected.id, { aiEnabled: next });
  }

  function assignEvent(eventId: string) {
    if (!selected) return;
    const value = eventId || null;
    const ev = value ? events.find((e) => e.id === value) ?? null : null;
    setConversations((prev) =>
      prev.map((c) =>
        c.id === selected.id ? { ...c, eventId: value, event: ev } : c,
      ),
    );
    patchConversation(selected.id, { eventId: value });
  }

  return (
    <div
      className="flex h-screen overflow-hidden font-[family-name:var(--font-dm-sans)]"
      style={{ background: 'var(--bg)' }}
    >
      {/* ── Left: conversation list ───────────────────────────── */}
      <aside
        className="flex w-1/3 min-w-[280px] max-w-[400px] flex-col border-r"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <header
          className="flex shrink-0 items-center gap-2 border-b px-4 py-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <MessageSquare className="h-[18px] w-[18px]" style={{ color: 'var(--primary)' }} />
          <div>
            <h1 className="text-[15px] font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
              House Phone
            </h1>
            <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
              {conversations.length} conversation{conversations.length === 1 ? '' : 's'}
            </p>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!loaded ? (
            <p className="px-4 py-6 text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
              Loading…
            </p>
          ) : conversations.length === 0 ? (
            <p className="px-4 py-6 text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
              No conversations yet. Inbound texts will appear here.
            </p>
          ) : (
            conversations.map((c) => {
              const isActive = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className="flex w-full flex-col gap-1 border-b px-4 py-3 text-left transition-colors"
                  style={{
                    borderColor: 'var(--border)',
                    background: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="truncate text-[14px] font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {c.name || c.phone}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                        {fmtTime(c.lastMessageAt)}
                      </span>
                      {c.unread ? (
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: 'var(--primary)' }}
                          aria-label="unread"
                        />
                      ) : null}
                    </span>
                  </div>
                  <span
                    className="truncate text-[12px]"
                    style={{ color: c.unread ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}
                  >
                    {c.lastMessagePreview || 'No messages yet'}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ── Right: thread ─────────────────────────────────────── */}
      <section className="flex min-w-0 flex-1 flex-col" style={{ background: 'var(--bg)' }}>
        {!selected ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center">
            <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
              Select a conversation to view the thread.
            </p>
          </div>
        ) : (
          <>
            <header
              className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-5 py-3"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              <div className="min-w-0">
                <h2 className="truncate text-[15px] font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
                  {selected.name || selected.phone}
                </h2>
                {selected.name ? (
                  <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
                    {selected.phone}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={selected.eventId ?? ''}
                  onChange={(e) => assignEvent(e.target.value)}
                  className="max-w-[200px] rounded-[8px] border px-2.5 py-1.5 text-[12px]"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--text-secondary)',
                  }}
                  aria-label="Associate event"
                >
                  <option value="">No event</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={toggleAi}
                  className="flex items-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-[12px] font-medium transition-colors"
                  style={{
                    borderColor: selected.aiEnabled ? 'var(--primary)' : 'var(--border)',
                    background: selected.aiEnabled ? 'var(--primary)' : 'transparent',
                    color: selected.aiEnabled ? 'var(--on-primary)' : 'var(--text-secondary)',
                  }}
                  aria-pressed={selected.aiEnabled}
                >
                  <Sparkles className="h-[14px] w-[14px]" />
                  AI {selected.aiEnabled ? 'On' : 'Off'}
                </button>
              </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-5 py-4">
              {selected.messages.map((m) => {
                const outbound = m.direction === 'OUTBOUND';
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${outbound ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className="max-w-[80%] whitespace-pre-wrap break-words rounded-[14px] px-3.5 py-2 text-[14px] leading-snug"
                      style={{
                        background: outbound ? 'var(--primary)' : 'var(--card)',
                        color: outbound ? 'var(--on-primary)' : 'var(--text-primary)',
                      }}
                    >
                      {m.body}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 px-1">
                      {outbound && m.aiGenerated ? (
                        <span
                          className="flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ color: 'var(--primary)' }}
                        >
                          <Sparkles className="h-[10px] w-[10px]" /> AI
                        </span>
                      ) : null}
                      <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                        {fmtTime(m.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <form
              onSubmit={sendReply}
              className="shrink-0 border-t px-4 py-3"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              {error ? (
                <p className="mb-2 text-[12px]" style={{ color: 'var(--danger)' }}>
                  {error}
                </p>
              ) : null}
              <div className="flex items-end gap-2">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendReply(e);
                    }
                  }}
                  rows={1}
                  placeholder="Type a reply…"
                  className="min-h-[40px] max-h-[140px] flex-1 resize-none rounded-[10px] border px-3 py-2 text-[14px] outline-none"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  type="submit"
                  disabled={sending || !replyText.trim()}
                  className="flex h-[40px] items-center gap-1.5 rounded-[10px] px-4 text-[13px] font-semibold transition-opacity disabled:opacity-40"
                  style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}
                >
                  <Send className="h-[15px] w-[15px]" />
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

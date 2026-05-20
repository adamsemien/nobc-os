'use client';

/** Operator AI agent panel (Item 18) — Cmd+Shift+Option+A slide-over.
 *
 *  Talks to the SSE agent endpoints:
 *    POST /api/agent          { threadId?, message }  → SSE stream
 *    POST /api/agent/confirm  { turnId }              → SSE stream (resumed)
 *    POST /api/agent/cancel   { turnId }              → SSE stream (resumed)
 *
 *  The agent protocol is SSE events, not inline text tokens — `text` deltas,
 *  `tool_call`/`tool_result` activity, and `confirmation_required` pauses are
 *  rendered as bubbles, chips, and a Confirm/Cancel card respectively.
 *
 *  Cmd+K is owned by CommandPaletteProvider. We bind Cmd+Shift+Option+A
 *  (Ctrl+Shift+Alt+A on Windows). Cmd+Shift+A collides with Chrome's
 *  "Search tabs"; Cmd+Option+A risks colliding with macOS app shortcuts.
 *  Triple-modifier combos are never grabbed by the OS or Chrome.
 *  The panel surface is an intentional fixed-dark chrome (terminal-like), so
 *  the #1a1520 literal is deliberate rather than a theme token. */

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, Sparkles, X } from 'lucide-react';

const PANEL_BG = '#1a1520'; // intentional fixed-dark agent surface

/** Mirrors the SSE contract in lib/agent/lib/streaming.ts. */
type AgentStreamEvent =
  | { type: 'thread'; conversationId: string }
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; toolName: string; label: string }
  | { type: 'tool_result'; toolName: string; summary: string; output: unknown }
  | { type: 'confirmation_required'; turnId: string; toolName: string; input: unknown; prompt: string }
  | { type: 'error'; message: string }
  | { type: 'done' };

type ChatItem =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'tool'; toolName: string; label: string; summary?: string }
  | { kind: 'confirm'; turnId: string; toolName: string; prompt: string; resolved?: 'confirmed' | 'cancelled' }
  | { kind: 'error'; text: string };

const EXAMPLES = [
  'Find applications waiting on review',
  'Who applied this week?',
  'Approve the top charter-tier applicant',
];

export function AgentPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | undefined>(undefined);

  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Whether incoming `text` deltas should append to the last assistant bubble.
  // A ref (not state) because the SSE loop mutates it between renders.
  const textOpen = useRef(false);

  const pendingConfirm = messages.some((m) => m.kind === 'confirm' && !m.resolved);

  // Cmd+Shift+Option+A (Ctrl+Shift+Alt+A on Windows) toggles; Escape closes.
  // We use e.code rather than e.key because Option+A produces 'å' on macOS.
  // Triple-modifier — macOS/Chrome would steal lighter combos.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.altKey &&
        e.shiftKey &&
        e.code === 'KeyA'
      ) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open, loading]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => taRef.current?.focus());
  }, [open]);

  function applyEvent(evt: AgentStreamEvent) {
    switch (evt.type) {
      case 'thread':
        setThreadId(evt.conversationId);
        break;
      case 'text':
        setMessages((m) => {
          const last = m[m.length - 1];
          if (last?.kind === 'assistant' && textOpen.current) {
            return [...m.slice(0, -1), { ...last, text: last.text + evt.delta }];
          }
          textOpen.current = true;
          return [...m, { kind: 'assistant', text: evt.delta }];
        });
        break;
      case 'tool_call':
        textOpen.current = false;
        setMessages((m) => [...m, { kind: 'tool', toolName: evt.toolName, label: evt.label }]);
        break;
      case 'tool_result':
        textOpen.current = false;
        setMessages((m) => {
          // Attach the summary to the most recent unresolved chip for this tool.
          for (let i = m.length - 1; i >= 0; i--) {
            const it = m[i];
            if (it.kind === 'tool' && it.toolName === evt.toolName && it.summary === undefined) {
              const copy = [...m];
              copy[i] = { ...it, summary: evt.summary };
              return copy;
            }
          }
          return m;
        });
        break;
      case 'confirmation_required':
        textOpen.current = false;
        setMessages((m) => [
          ...m,
          { kind: 'confirm', turnId: evt.turnId, toolName: evt.toolName, prompt: evt.prompt },
        ]);
        break;
      case 'error':
        textOpen.current = false;
        setMessages((m) => [...m, { kind: 'error', text: evt.message }]);
        break;
      case 'done':
        textOpen.current = false;
        break;
    }
  }

  /** Reads an SSE response body and dispatches each frame to applyEvent. */
  async function consumeStream(res: Response) {
    if (!res.ok) {
      let text = 'Something went wrong. Try again.';
      if (res.status === 401) text = 'Session expired — refresh the page.';
      else if (res.status === 429) text = 'Too many requests — give it a moment.';
      else {
        try {
          const j = (await res.json()) as { error?: string };
          if (j?.error) text = j.error;
        } catch {
          /* keep generic message */
        }
      }
      setMessages((m) => [...m, { kind: 'error', text }]);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const line = frame.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        try {
          applyEvent(JSON.parse(line.slice(6)) as AgentStreamEvent);
        } catch {
          /* skip malformed frame */
        }
      }
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || loading || pendingConfirm) return;
    setInput('');
    if (taRef.current) taRef.current.style.height = 'auto';
    setMessages((m) => [...m, { kind: 'user', text }]);
    setLoading(true);
    textOpen.current = false;
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, message: text }),
      });
      await consumeStream(res);
    } catch {
      setMessages((m) => [...m, { kind: 'error', text: 'Connection lost. Try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  async function resolveConfirm(turnId: string, action: 'confirm' | 'cancel') {
    if (loading) return;
    setMessages((m) =>
      m.map((it) =>
        it.kind === 'confirm' && it.turnId === turnId
          ? { ...it, resolved: action === 'confirm' ? 'confirmed' : 'cancelled' }
          : it,
      ),
    );
    setLoading(true);
    textOpen.current = false;
    try {
      const res = await fetch(`/api/agent/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnId }),
      });
      await consumeStream(res);
    } catch {
      setMessages((m) => [...m, { kind: 'error', text: 'Connection lost. Try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style>{`@keyframes nobcAgentPulse{0%,80%,100%{opacity:.2}40%{opacity:1}}`}</style>

      {/* Floating launcher — hidden while the panel is open.
       *  Positioned ABOVE the DevToolbar "DEV" pill (which sits at bottom:20, right:20,
       *  zIndex:9999). The FAB was previously at bottom:24, right:24, zIndex:60 — fully
       *  covered by the dev pill in dev mode. Stacking it ~64px higher keeps both
       *  visible in dev mode and looks fine in production (DevToolbar isn't rendered).
       *  zIndex matches the dev pill so the FAB stays clickable even if they overlap. */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open AI agent (Cmd+Shift+Option+A)"
          title="AI agent — ⌘⇧⌥A"
          style={{
            position: 'fixed',
            bottom: 64,
            right: 20,
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'var(--primary)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.28)',
            zIndex: 10000,
          }}
        >
          <Sparkles size={20} />
        </button>
      )}

      {/* Slide-over panel — always mounted so it can animate in/out.
       *  Z-index matches FAB so the open panel covers DevToolbar + QA HUD. */}
      <div
        role="dialog"
        aria-label="AI agent"
        aria-hidden={!open}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 384,
          maxWidth: '100vw',
          display: 'flex',
          flexDirection: 'column',
          background: PANEL_BG,
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.5)',
          zIndex: 10000,
          transform: open ? 'translateX(0)' : 'translateX(110%)',
          transition: 'transform 0.22s ease',
          fontFamily: 'inherit',
          color: '#f3f4f6',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '14px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            flexShrink: 0,
          }}
        >
          <Sparkles size={16} color="var(--primary)" />
          <span style={{ fontSize: 13, fontWeight: 600 }}>NoBC Agent</span>
          <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 2 }}>⌘⇧⌥A</span>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close AI agent"
            style={{
              marginLeft: 'auto',
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: '#9ca3af',
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {messages.length === 0 && (
            <div style={{ margin: 'auto 0', textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: '#e5e7eb', fontWeight: 600, marginBottom: 14 }}>
                What do you need?
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setInput(ex)}
                    style={{
                      padding: '7px 10px',
                      borderRadius: 6,
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(255,255,255,0.03)',
                      color: '#9ca3af',
                      fontSize: 12,
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => {
            if (m.kind === 'user' || m.kind === 'assistant') {
              const isUser = m.kind === 'user';
              return (
                <div
                  key={i}
                  style={{
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                    maxWidth: '88%',
                    padding: '8px 12px',
                    borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    background: isUser ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                    color: '#f3f4f6',
                    fontSize: 13,
                    lineHeight: 1.55,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {m.text}
                </div>
              );
            }

            if (m.kind === 'tool') {
              return (
                <div
                  key={i}
                  style={{
                    alignSelf: 'flex-start',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '5px 10px',
                    borderRadius: 6,
                    background: 'rgba(255,255,255,0.04)',
                    fontSize: 11.5,
                    color: '#9ca3af',
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: m.summary ? '#4ade80' : 'var(--primary)',
                      flexShrink: 0,
                    }}
                  />
                  <span>{m.label}</span>
                  {m.summary && <span style={{ color: '#6b7280' }}>· {m.summary}</span>}
                </div>
              );
            }

            if (m.kind === 'confirm') {
              return (
                <div
                  key={i}
                  style={{
                    alignSelf: 'stretch',
                    padding: '12px',
                    borderRadius: 8,
                    border: '1px solid rgba(178,46,33,0.5)',
                    background: 'rgba(178,46,33,0.1)',
                  }}
                >
                  <p style={{ fontSize: 12.5, lineHeight: 1.5, marginBottom: 10, color: '#f3f4f6' }}>
                    {m.prompt}
                  </p>
                  {m.resolved ? (
                    <p style={{ fontSize: 12, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 5 }}>
                      {m.resolved === 'confirmed' ? (
                        <>
                          <Check size={13} /> Confirmed
                        </>
                      ) : (
                        <>
                          <X size={13} /> Cancelled
                        </>
                      )}
                    </p>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => resolveConfirm(m.turnId, 'confirm')}
                        disabled={loading}
                        style={{
                          flex: 1,
                          padding: '7px 0',
                          borderRadius: 6,
                          border: 'none',
                          background: 'var(--primary)',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: loading ? 'default' : 'pointer',
                          opacity: loading ? 0.5 : 1,
                        }}
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => resolveConfirm(m.turnId, 'cancel')}
                        disabled={loading}
                        style={{
                          flex: 1,
                          padding: '7px 0',
                          borderRadius: 6,
                          border: '1px solid rgba(255,255,255,0.14)',
                          background: 'transparent',
                          color: '#d1d5db',
                          fontSize: 12,
                          cursor: loading ? 'default' : 'pointer',
                          opacity: loading ? 0.5 : 1,
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            }

            // error
            return (
              <div
                key={i}
                style={{
                  alignSelf: 'flex-start',
                  maxWidth: '88%',
                  padding: '8px 12px',
                  borderRadius: '12px 12px 12px 2px',
                  border: '1px solid rgba(178,46,33,0.4)',
                  background: 'rgba(178,46,33,0.12)',
                  color: '#fca5a5',
                  fontSize: 12.5,
                  lineHeight: 1.5,
                }}
              >
                {m.text}
              </div>
            );
          })}

          {loading && (
            <div style={{ alignSelf: 'flex-start', display: 'flex', gap: 4, padding: '4px 2px' }}>
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#6b7280',
                    animation: `nobcAgentPulse 1.2s ${d * 0.16}s infinite`,
                  }}
                />
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div
          style={{
            padding: '12px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
            flexShrink: 0,
          }}
        >
          <textarea
            ref={taRef}
            value={input}
            rows={1}
            onChange={(e) => {
              setInput(e.target.value);
              const el = e.target;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 84)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={loading || pendingConfirm}
            placeholder={pendingConfirm ? 'Respond to the request above…' : 'Ask anything…'}
            style={{
              flex: 1,
              resize: 'none',
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)',
              color: '#f3f4f6',
              fontSize: 13,
              lineHeight: 1.5,
              fontFamily: 'inherit',
              outline: 'none',
              maxHeight: 84,
              opacity: loading || pendingConfirm ? 0.5 : 1,
            }}
          />
          <button
            onClick={send}
            disabled={loading || pendingConfirm || !input.trim()}
            aria-label="Send"
            style={{
              width: 34,
              height: 34,
              flexShrink: 0,
              borderRadius: 6,
              border: 'none',
              background: 'var(--primary)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: loading || pendingConfirm || !input.trim() ? 'default' : 'pointer',
              opacity: loading || pendingConfirm || !input.trim() ? 0.4 : 1,
            }}
          >
            <ArrowUp size={17} />
          </button>
        </div>
      </div>
    </>
  );
}

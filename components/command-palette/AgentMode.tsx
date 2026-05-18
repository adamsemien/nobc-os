'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AgentStreamEvent } from '@/lib/agent/lib/streaming';
import { normalizeAgentResult, spotlightTargets } from '@/lib/agent/lib/spotlight';
import { ToolCallChip } from './ToolCallChip';
import { ConfirmationCard } from './ConfirmationCard';
import { SpotlightResult } from './SpotlightResult';

const AGENT_UNAVAILABLE =
  'AI is unavailable right now. Try a direct command or come back in a moment.';

type ToolItem = {
  kind: 'tool';
  toolName: string;
  label: string;
  summary: string | null;
  output: unknown;
};

type TranscriptItem =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | ToolItem
  | {
      kind: 'confirmation';
      turnId: string;
      toolName: string;
      prompt: string;
      state: 'pending' | 'confirmed' | 'cancelled';
    }
  | { kind: 'error'; text: string };

/** The agent transcript that takes over the palette body in agent mode.
 *  Owns the SSE connection, the streaming transcript, the confirmation flow,
 *  and Spotlight-style navigation of tool results.
 *
 *  Strict-Mode note: the initial turn runs from an effect whose cleanup
 *  aborts it. React Strict Mode mounts → cleans up → mounts again; the
 *  cleanup aborts the first fetch and the re-mount starts a fresh one. The
 *  seed query lives in the initial `items` state (not pushed by a guarded
 *  effect), so it is never duplicated and never lost. */
export function AgentMode({
  initialQuery,
  onClose,
}: {
  initialQuery: string;
  workspaceId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<TranscriptItem[]>(() => [
    { kind: 'user', text: initialQuery },
  ]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(true);
  /** Keyboard-selected navigation target within the latest tool result. */
  const [navIndex, setNavIndex] = useState(-1);

  const threadIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const itemsRef = useRef<TranscriptItem[]>(items);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    itemsRef.current = items;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [items]);

  const pendingConfirmation = (() => {
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const it = items[i];
      if (it.kind === 'confirmation' && it.state === 'pending') return it;
    }
    return null;
  })();

  // The latest resolved tool result drives Spotlight navigation.
  const { activeToolIndex, activeTargets } = useMemo(() => {
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const it = items[i];
      if (it.kind === 'tool' && it.summary !== null) {
        const payload = normalizeAgentResult(it.toolName, it.output);
        return {
          activeToolIndex: i,
          activeTargets: payload ? spotlightTargets(payload) : [],
        };
      }
    }
    return { activeToolIndex: -1, activeTargets: [] as { label: string; href: string }[] };
  }, [items]);

  const navigate = useCallback(
    (href: string) => {
      router.push(href);
      onClose();
    },
    [router, onClose],
  );

  const handleEvent = useCallback((event: AgentStreamEvent) => {
    switch (event.type) {
      case 'thread':
        threadIdRef.current = event.conversationId;
        break;
      case 'text':
        setItems((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.kind === 'assistant') {
            return [...prev.slice(0, -1), { ...last, text: last.text + event.delta }];
          }
          return [...prev, { kind: 'assistant', text: event.delta }];
        });
        break;
      case 'tool_call':
        setItems((prev) => [
          ...prev,
          {
            kind: 'tool',
            toolName: event.toolName,
            label: event.label,
            summary: null,
            output: undefined,
          },
        ]);
        break;
      case 'tool_result':
        setItems((prev) => {
          for (let i = prev.length - 1; i >= 0; i -= 1) {
            const it = prev[i];
            if (it.kind === 'tool' && it.toolName === event.toolName && it.summary === null) {
              const next = [...prev];
              next[i] = { ...it, summary: event.summary, output: event.output };
              return next;
            }
          }
          return prev;
        });
        // A sole result auto-selects (↵ opens it). A multi-row result
        // starts unselected so the first ↓ lands on the top row.
        {
          const payload = normalizeAgentResult(event.toolName, event.output);
          const targets = payload ? spotlightTargets(payload) : [];
          setNavIndex(targets.length === 1 ? 0 : -1);
        }
        break;
      case 'confirmation_required':
        setItems((prev) => [
          ...prev,
          {
            kind: 'confirmation',
            turnId: event.turnId,
            toolName: event.toolName,
            prompt: event.prompt,
            state: 'pending',
          },
        ]);
        break;
      case 'error':
        setItems((prev) => [...prev, { kind: 'error', text: event.message }]);
        break;
      case 'done':
        break;
    }
  }, []);

  const consumeStream = useCallback(
    async (res: Response) => {
      if (!res.ok) {
        const text =
          res.status === 429
            ? 'Too many agent requests — wait a moment and try again.'
            : AGENT_UNAVAILABLE;
        setItems((prev) => [...prev, { kind: 'error', text }]);
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith('data:')) continue;
          try {
            handleEvent(JSON.parse(line.slice(5).trim()) as AgentStreamEvent);
          } catch {
            /* ignore malformed frame */
          }
        }
      }
    },
    [handleEvent],
  );

  const post = useCallback(
    async (url: string, payload: Record<string, unknown>, signal: AbortSignal) => {
      setStreaming(true);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal,
        });
        await consumeStream(res);
      } catch (e) {
        // An aborted fetch (Strict-Mode re-mount, clear, or close) is expected.
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          setItems((prev) => [...prev, { kind: 'error', text: AGENT_UNAVAILABLE }]);
        }
      } finally {
        setStreaming(false);
      }
    },
    [consumeStream],
  );

  // Initial turn — seeded from the palette query. Strict-Mode safe: the
  // cleanup aborts this fetch, and the re-mount starts a fresh one.
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    void post(
      '/api/agent',
      { threadId: threadIdRef.current, message: initialQuery },
      controller.signal,
    );
    return () => controller.abort();
  }, [post, initialQuery]);

  // On real unmount: abort the live stream, best-effort cancel a pending card.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      const pend = itemsRef.current.find(
        (i): i is Extract<TranscriptItem, { kind: 'confirmation' }> =>
          i.kind === 'confirmation' && i.state === 'pending',
      );
      if (pend && typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon(
          '/api/agent/cancel',
          new Blob([JSON.stringify({ turnId: pend.turnId })], { type: 'application/json' }),
        );
      }
    };
  }, []);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;
      setItems((prev) => [...prev, { kind: 'user', text: trimmed }]);
      setInput('');
      setNavIndex(-1);
      const controller = new AbortController();
      abortRef.current = controller;
      void post(
        '/api/agent',
        { threadId: threadIdRef.current, message: trimmed },
        controller.signal,
      );
    },
    [post, streaming],
  );

  const confirm = useCallback(
    (turnId: string) => {
      setItems((prev) =>
        prev.map((i) =>
          i.kind === 'confirmation' && i.turnId === turnId ? { ...i, state: 'confirmed' } : i,
        ),
      );
      const controller = new AbortController();
      abortRef.current = controller;
      void post('/api/agent/confirm', { turnId }, controller.signal);
    },
    [post],
  );

  const cancel = useCallback(
    (turnId: string) => {
      setItems((prev) =>
        prev.map((i) =>
          i.kind === 'confirmation' && i.turnId === turnId ? { ...i, state: 'cancelled' } : i,
        ),
      );
      const controller = new AbortController();
      abortRef.current = controller;
      void post('/api/agent/cancel', { turnId }, controller.signal);
    },
    [post],
  );

  // ⌘⌫ — drop the whole transcript and start a fresh conversation.
  const clearThread = useCallback(() => {
    abortRef.current?.abort();
    threadIdRef.current = null;
    setItems([]);
    setInput('');
    setNavIndex(-1);
    setStreaming(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    // ⌘⌫ / Ctrl+⌫ clears the thread from anywhere.
    if (e.key === 'Backspace' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      clearThread();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (pendingConfirmation) cancel(pendingConfirmation.turnId);
      else if (navIndex >= 0) setNavIndex(-1);
      else onClose();
      return;
    }
    if (e.key === 'ArrowDown' && activeTargets.length > 0) {
      e.preventDefault();
      setNavIndex((i) => Math.min(i + 1, activeTargets.length - 1));
      return;
    }
    if (e.key === 'ArrowUp' && activeTargets.length > 0) {
      e.preventDefault();
      setNavIndex((i) => Math.max(i - 1, -1));
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (pendingConfirmation) {
        confirm(pendingConfirmation.turnId);
      } else if (!input.trim() && navIndex >= 0 && activeTargets[navIndex]) {
        navigate(activeTargets[navIndex].href);
      } else if (!streaming) {
        send(input);
      }
    }
  };

  const inputDisabled = streaming || pendingConfirmation !== null;

  // Keep focus inside the panel so ↑↓/↵/esc always reach onKeyDown — the
  // input when it's usable, the panel itself while streaming/confirming.
  useEffect(() => {
    if (inputDisabled) rootRef.current?.focus();
    else inputRef.current?.focus();
  }, [inputDisabled]);

  const canNavigate = activeTargets.length > 0 && !input.trim();
  const footerHint = pendingConfirmation
    ? '↵ confirm · esc cancel'
    : canNavigate
      ? '↑↓ select · ↵ open · ⌘⌫ clear · esc close'
      : '↵ ask · ⌘⌫ clear · esc close';

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        flex: 1,
        outline: 'none',
      }}
    >
      {/* Follow-up input */}
      <div style={{ padding: '0 24px' }}>
        <input
          ref={inputRef}
          type="text"
          aria-label="Ask the agent"
          placeholder={
            pendingConfirmation
              ? 'confirm or cancel above…'
              : streaming
                ? 'thinking…'
                : 'ask again…'
          }
          value={input}
          disabled={inputDisabled}
          onChange={(e) => setInput(e.target.value)}
          style={{
            width: '100%',
            padding: '0 0 14px',
            fontSize: 18,
            fontWeight: 400,
            fontFamily: "'Neue Haas Grotesk Display Pro', system-ui, sans-serif",
            color: 'var(--text-primary)',
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid var(--border)',
            outline: 'none',
          }}
        />
      </div>

      {/* Transcript */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          minHeight: 0,
          padding: '14px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {items.map((item, i) => {
          if (item.kind === 'user') {
            return (
              <div
                key={i}
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.01em',
                }}
              >
                {item.text}
              </div>
            );
          }
          if (item.kind === 'assistant') {
            // Narrative is secondary to the result cards — muted and italic.
            return (
              <div
                key={i}
                style={{
                  fontSize: 13,
                  lineHeight: 1.55,
                  fontStyle: 'italic',
                  color: 'var(--text-muted)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {item.text}
              </div>
            );
          }
          if (item.kind === 'tool') {
            if (item.summary === null) {
              return <ToolCallChip key={i} label={item.label} summary={null} />;
            }
            const payload = normalizeAgentResult(item.toolName, item.output);
            if (!payload) {
              return <ToolCallChip key={i} label={item.label} summary={item.summary} />;
            }
            return (
              <SpotlightResult
                key={i}
                payload={payload}
                selectedIndex={i === activeToolIndex ? navIndex : null}
                onNavigate={navigate}
              />
            );
          }
          if (item.kind === 'confirmation') {
            return (
              <ConfirmationCard
                key={i}
                prompt={item.prompt}
                toolName={item.toolName}
                state={item.state}
                onConfirm={() => confirm(item.turnId)}
                onCancel={() => cancel(item.turnId)}
              />
            );
          }
          return (
            <div
              key={i}
              style={{
                fontSize: 13,
                lineHeight: 1.5,
                color: 'var(--text-muted)',
                fontStyle: 'italic',
              }}
            >
              {item.text}
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <div
        style={{
          padding: '12px 24px 0',
          borderTop: '1px solid var(--border)',
          fontSize: 11,
          letterSpacing: '0.12em',
          color: 'var(--text-muted)',
        }}
      >
        {footerHint}
      </div>
    </div>
  );
}

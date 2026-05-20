'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/app/operator/_components/ThemeToggle';
import { listCommands, rankCommands } from '@/lib/commands/registry';
import {
  COMMAND_GROUP_LABELS,
  COMMAND_GROUP_ORDER,
  type Command,
  type CommandContext,
  type CommandGroup,
} from '@/lib/commands/types';
import { buildEventCommands, type EventLite } from '@/lib/commands/event-commands';
import { buildSearchCommands, type SearchHit } from '@/lib/commands/search-commands';
import { CommandResultRow } from './CommandResultRow';
import { AskAIRow } from './AskAIRow';
import { AgentMode } from './AgentMode';

const THEME_PREFIX = 'theme.switch-';
const FALLBACK_ID = 'event.search-past';
const ASK_AI_ID = 'agent.ask';
const EVENT_PREVIEW_COUNT = 5;
const LISTBOX_ID = 'command-palette-listbox';
const rowId = (commandId: string) => `cmd-opt-${commandId}`;

export function CommandPalette({
  open,
  workspaceId,
  events,
  onClose,
}: {
  open: boolean;
  workspaceId: string;
  events: EventLite[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  /** Broadens the event search to include past + cancelled events. */
  const [pastSearch, setPastSearch] = useState(false);
  /** Non-null = the palette body is replaced by the agent transcript, seeded
   *  with this query. */
  const [agentSeed, setAgentSeed] = useState<string | null>(null);
  /** Server-side search hits (members + applications + events). Debounced. */
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── Command context — stable across renders ──────────────────────────
  const ctx: CommandContext = useMemo(
    () => ({ workspaceId, router, setTheme, closeCommandPalette: onClose }),
    [workspaceId, router, setTheme, onClose],
  );

  const staticCommands = useMemo(
    () => listCommands().filter((c) => c.visible?.(ctx) ?? true),
    [ctx],
  );

  // `now` is fixed per palette session — upcoming/past split stays stable.
  const now = useMemo(() => Date.now(), [open]);

  /** Upcoming = not cancelled and not yet started. The default search scope. */
  const upcomingEvents = useMemo(
    () =>
      events.filter((e) => e.status !== 'CANCELLED' && new Date(e.startAt).getTime() >= now),
    [events, now],
  );

  // ── Results ──────────────────────────────────────────────────────────
  const results = useMemo(() => {
    // Empty query → grouped: 12 static commands + next 5 upcoming events.
    if (query.trim() === '') {
      const orderedStatic = [...staticCommands].sort(
        (a, b) =>
          COMMAND_GROUP_ORDER.indexOf(a.group) - COMMAND_GROUP_ORDER.indexOf(b.group) ||
          a.name.localeCompare(b.name),
      );
      const preview = buildEventCommands(upcomingEvents.slice(0, EVENT_PREVIEW_COUNT), now);
      return [...orderedStatic, ...preview];
    }

    // Typed query → flat ranked list over the merged pool.
    const eventScope = pastSearch ? events : upcomingEvents;
    const searchPool = buildSearchCommands(searchHits);
    const pool = [
      ...staticCommands,
      ...buildEventCommands(eventScope, now),
      ...searchPool,
    ];
    const ranked = rankCommands(pool, query);

    // No upcoming event matched — offer to broaden the search to past events.
    if (!pastSearch && events.length > 0) {
      const eventMatches = ranked.filter((c) => c.group === 'event').length;
      if (eventMatches === 0) {
        ranked.push({
          id: FALLBACK_ID,
          name: `search past events for '${query.trim()}'`,
          group: 'event',
          execute: () => setPastSearch(true),
        });
      }
    }

    // The agent is always the last option on a typed query.
    ranked.push({
      id: ASK_AI_ID,
      name: `Ask AI: ${query.trim()}`,
      group: 'agent',
      execute: () => setAgentSeed(query.trim()),
    });
    return ranked;
  }, [query, staticCommands, events, upcomingEvents, now, pastSearch, searchHits]);

  const grouped = query.trim() === '';
  const safeIndex = results.length ? Math.min(activeIndex, results.length - 1) : 0;

  // ── Lifecycle: reset + focus on open, track viewport ─────────────────
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    setToast(null);
    setPastSearch(false);
    setAgentSeed(null);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // A new query is a fresh search — drop back to the upcoming-only scope.
  useEffect(() => {
    setPastSearch(false);
  }, [query]);

  // Debounced fetch against /api/operator/search for members + applications.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      fetch(`/api/operator/search?q=${encodeURIComponent(q)}`, {
        credentials: 'include',
        signal: ctrl.signal,
      })
        .then((r) => (r.ok ? r.json() : { hits: [] }))
        .then((data: { hits: SearchHit[] }) => setSearchHits(data.hits ?? []))
        .catch(() => {});
    }, 180);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, pastSearch]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Keep the keyboard-selected row scrolled into view.
  useEffect(() => {
    if (!open || agentSeed !== null) return;
    const active = results[safeIndex];
    if (!active) return;
    document.getElementById(rowId(active.id))?.scrollIntoView({ block: 'nearest' });
  }, [open, agentSeed, safeIndex, results]);

  // ── Run a command, surfacing failures without crashing the UI ────────
  const run = useCallback(
    async (cmd: Command) => {
      try {
        await cmd.execute(ctx);
      } catch {
        setToast('command failed');
        window.setTimeout(() => setToast(null), 2000);
      }
    },
    [ctx],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    // ⌘Enter from anywhere in the input hands the query straight to the agent.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const trimmed = query.trim();
      if (trimmed) setAgentSeed(trimmed);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (results.length) setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length) setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = results[safeIndex];
      if (cmd) void run(cmd);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Tab') {
      // Resist autocomplete-style hijack — Tab does nothing.
      e.preventDefault();
    }
  };

  if (!open) return null;

  const agentActive = agentSeed !== null;
  const activeRowId = results[safeIndex] ? rowId(results[safeIndex].id) : undefined;
  let lastGroup: CommandGroup | null = null;

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        justifyContent: 'center',
        alignItems: isMobile ? 'stretch' : 'center',
        background: 'rgba(0,0,0,0.2)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={agentActive ? 'Operator agent' : 'Command palette'}
        onKeyDown={agentActive ? undefined : onKeyDown}
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: isMobile ? '100vw' : 560,
          maxWidth: isMobile ? '100vw' : '92vw',
          height: isMobile ? '100dvh' : undefined,
          maxHeight: isMobile ? undefined : '76vh',
          background: 'var(--surface)',
          border: isMobile ? 'none' : '1px solid var(--border)',
          borderRadius: isMobile ? 0 : 12,
          boxShadow: isMobile ? 'none' : '0 24px 64px rgba(0,0,0,0.28)',
          padding: isMobile ? '20px 0 0' : '24px 0',
        }}
      >
        {agentActive ? (
          <AgentMode initialQuery={agentSeed} workspaceId={workspaceId} onClose={onClose} />
        ) : (
          <>
            {/* Search input — transparent, bottom border only */}
            <div style={{ padding: '0 24px' }}>
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded
                aria-controls={LISTBOX_ID}
                aria-activedescendant={activeRowId}
                aria-autocomplete="list"
                aria-label="Search commands"
                placeholder="type a command…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0 0 14px',
                  fontSize: isMobile ? 20 : 18,
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

            {/* Results */}
            <div
              ref={listRef}
              id={LISTBOX_ID}
              role="listbox"
              aria-label="Commands"
              style={{ flex: 1, overflowY: 'auto', padding: '8px 0', minHeight: 0 }}
            >
              {results.length === 0 ? (
                <div
                  style={{
                    padding: '32px 24px',
                    textAlign: 'center',
                    fontFamily: "'PP Editorial New', Georgia, serif",
                    fontStyle: 'italic',
                    fontWeight: 200,
                    fontSize: 20,
                    color: 'var(--text-muted)',
                  }}
                >
                  nothing matches &lsquo;{query.trim()}&rsquo;.
                </div>
              ) : (
                results.map((cmd, i) => {
                  const header =
                    grouped && cmd.group !== lastGroup ? COMMAND_GROUP_LABELS[cmd.group] : null;
                  lastGroup = cmd.group;
                  const themeId = cmd.id.startsWith(THEME_PREFIX)
                    ? cmd.id.slice(THEME_PREFIX.length)
                    : null;
                  return (
                    <div key={cmd.id}>
                      {header && (
                        <div
                          style={{
                            padding: '12px 24px 5px',
                            fontSize: 11,
                            fontWeight: 500,
                            textTransform: 'uppercase',
                            letterSpacing: '0.18em',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {header}
                        </div>
                      )}
                      {cmd.id === ASK_AI_ID ? (
                        <AskAIRow
                          query={query.trim()}
                          rowId={rowId(cmd.id)}
                          active={i === safeIndex}
                          onSelect={() => void run(cmd)}
                        />
                      ) : (
                        <CommandResultRow
                          command={cmd}
                          rowId={rowId(cmd.id)}
                          active={i === safeIndex}
                          checked={themeId !== null && themeId === theme}
                          onSelect={() => void run(cmd)}
                        />
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer hint */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '12px 24px 0',
                borderTop: '1px solid var(--border)',
              }}
            >
              <span
                style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-muted)' }}
              >
                ↑↓ navigate · ↵ select · ⌘↵ ask AI · esc close
              </span>
              {toast && (
                <span
                  style={{ fontSize: 11, letterSpacing: '0.06em', color: 'var(--text-muted)' }}
                >
                  {toast}
                </span>
              )}
            </div>

            {/* Screen-reader result count */}
            <span
              aria-live="polite"
              style={{
                position: 'absolute',
                width: 1,
                height: 1,
                overflow: 'hidden',
                clip: 'rect(0 0 0 0)',
                whiteSpace: 'nowrap',
              }}
            >
              {results.length} command{results.length === 1 ? '' : 's'}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

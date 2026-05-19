'use client';

import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';

const ALLOWED_IDS = (process.env.NEXT_PUBLIC_DEV_USER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const LS_OPEN = 'nobc-dev-toolbar-open';
const LS_SEEDED_AT = 'nobc-dev-seeded-at';
const LS_SEEDED_EVENTS = 'nobc-dev-seeded-events';

interface SeededEvent {
  id: string;
  slug: string;
  title: string;
}

interface SeedCounts {
  members: number;
  events: number;
  rsvps: number;
  applications: number;
}

interface StatusMsg {
  type: 'success' | 'error';
  msg: string;
}

interface DevToolbarProps {
  workspaceId?: string;
}

const S = {
  btn: {
    background: '#231d2e',
    border: '1px solid #3d3050',
    borderRadius: 6,
    color: '#e8e4f0',
    fontSize: 11,
    padding: '5px 10px',
    cursor: 'pointer',
    flex: '1 1 0',
    textAlign: 'left' as const,
    fontFamily: 'monospace',
  },
  chip: {
    background: '#231d2e',
    border: '1px solid #3d3050',
    borderRadius: 4,
    color: '#c4b8d4',
    fontSize: 10,
    padding: '3px 8px',
    textDecoration: 'none',
    cursor: 'pointer',
    display: 'inline-block',
    fontFamily: 'monospace',
    lineHeight: '1.4',
  },
};

export function DevToolbar({ workspaceId }: DevToolbarProps) {
  const { user, isLoaded } = useUser();
  const [open, setOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [status, setStatus] = useState<StatusMsg | null>(null);
  const [seededAt, setSeededAt] = useState<string | null>(null);
  const [seededEvents, setSeededEvents] = useState<SeededEvent[]>([]);

  const isAllowed = isLoaded && !!user && ALLOWED_IDS.includes(user.id);

  useEffect(() => {
    if (!isAllowed) return;
    try {
      setOpen(localStorage.getItem(LS_OPEN) === 'true');
      const ts = localStorage.getItem(LS_SEEDED_AT);
      if (ts) setSeededAt(ts);
      const evts = localStorage.getItem(LS_SEEDED_EVENTS);
      if (evts) setSeededEvents(JSON.parse(evts) as SeededEvent[]);
    } catch {
      // localStorage unavailable
    }
  }, [isAllowed]);

  const toggle = useCallback(() => {
    setOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem(LS_OPEN, String(next));
      } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isAllowed) return;
    const handler = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'D' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isAllowed, toggle]);

  if (!isLoaded || !isAllowed) return null;

  async function handleSeed() {
    setSeeding(true);
    setStatus(null);
    try {
      const res = await fetch('/api/dev/seed', { method: 'POST' });
      const data = (await res.json()) as {
        error?: string;
        seededAt?: string;
        counts?: SeedCounts;
        events?: SeededEvent[];
      };
      if (!res.ok) throw new Error(data.error ?? 'Seed failed');
      const ts = data.seededAt!;
      const evts = data.events ?? [];
      setSeededAt(ts);
      setSeededEvents(evts);
      try {
        localStorage.setItem(LS_SEEDED_AT, ts);
        localStorage.setItem(LS_SEEDED_EVENTS, JSON.stringify(evts));
      } catch {}
      const c = data.counts!;
      setStatus({ type: 'success', msg: `${c.members}m · ${c.events}e · ${c.rsvps}r · ${c.applications}a` });
    } catch (err) {
      setStatus({ type: 'error', msg: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setSeeding(false);
    }
  }

  async function handleReset() {
    if (!window.confirm('Delete all demo data for this workspace — continue?')) return;
    setResetting(true);
    setStatus(null);
    try {
      const res = await fetch('/api/dev/reset', { method: 'POST' });
      const data = (await res.json()) as {
        error?: string;
        deletedCounts?: SeedCounts;
      };
      if (!res.ok) throw new Error(data.error ?? 'Reset failed');
      setSeededAt(null);
      setSeededEvents([]);
      try {
        localStorage.removeItem(LS_SEEDED_AT);
        localStorage.removeItem(LS_SEEDED_EVENTS);
      } catch {}
      const c = data.deletedCounts!;
      setStatus({ type: 'success', msg: `Deleted: ${c.members}m · ${c.events}e · ${c.rsvps}r · ${c.applications}a` });
    } catch (err) {
      setStatus({ type: 'error', msg: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setResetting(false);
    }
  }

  const navItems = [
    { label: 'Dashboard', href: '/operator' },
    { label: 'Events', href: '/operator/events' },
    { label: '+ New Event', href: '/operator/events/new' },
    { label: 'Members', href: '/operator/members' },
    { label: 'Applications', href: '/operator/applications' },
    { label: 'Apply ↗', href: '/apply', newTab: true },
    { label: 'Member Cal ↗', href: '/m/events', newTab: true },
  ];

  const busy = seeding || resetting;

  return (
    <>
      {/* Floating pill — always visible, hidden when panel is open */}
      <button
        onClick={toggle}
        title="Dev Tools (⌘⇧D)"
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 9999,
          background: '#B22E21',
          color: '#fff',
          border: 'none',
          borderRadius: 20,
          padding: '5px 12px',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.1em',
          cursor: 'pointer',
          fontFamily: 'monospace',
          opacity: open ? 0 : 1,
          pointerEvents: open ? 'none' : 'auto',
          transition: 'opacity 0.15s',
          boxShadow: '0 2px 12px rgba(178,46,33,0.5)',
        }}
      >
        DEV
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            zIndex: 9999,
            width: 320,
            background: '#1a1520',
            border: '1px solid #2d2438',
            borderRadius: 10,
            fontFamily: 'monospace',
            fontSize: 12,
            color: '#e8e4f0',
            boxShadow: '0 8px 48px rgba(0,0,0,0.7)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: '1px solid #2d2438',
            }}
          >
            <span style={{ fontWeight: 700, color: '#B22E21', fontSize: 11, letterSpacing: '0.1em' }}>
              DEV TOOLS
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {workspaceId && (
                <span
                  style={{ color: '#5a4d6a', fontSize: 9, fontFamily: 'monospace', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={workspaceId}
                >
                  ws:{workspaceId.slice(-8)}
                </span>
              )}
              <button
                onClick={toggle}
                style={{ background: 'none', border: 'none', color: '#5a4d6a', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Seed / Reset */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #2d2438' }}>
            <div style={{ color: '#5a4d6a', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
              Data
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <button onClick={handleSeed} disabled={busy} style={S.btn}>
                {seeding ? '⏳' : '🌱'} Seed Demo Data
              </button>
              <button
                onClick={handleReset}
                disabled={busy}
                style={{ ...S.btn, background: '#2a1820', borderColor: '#5a2020', color: '#e8b4aa' }}
              >
                {resetting ? '⏳' : '🗑'} Reset
              </button>
            </div>
            <div style={{ color: '#5a4d6a', fontSize: 9 }}>
              {seededAt
                ? `Last seeded: ${new Date(seededAt).toLocaleString()}`
                : 'Not seeded'}
            </div>
            {status && (
              <div
                style={{
                  marginTop: 6,
                  color: status.type === 'success' ? '#4ade80' : '#f87171',
                  fontSize: 10,
                }}
              >
                {status.type === 'success' ? '✓ ' : '✗ '}{status.msg}
              </div>
            )}
          </div>

          {/* Quick Nav */}
          <div
            style={{
              padding: '10px 14px',
              borderBottom: seededEvents.length > 0 ? '1px solid #2d2438' : 'none',
            }}
          >
            <div style={{ color: '#5a4d6a', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
              Quick Nav
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  target={item.newTab ? '_blank' : undefined}
                  rel={item.newTab ? 'noreferrer' : undefined}
                  style={S.chip}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>

          {/* Seeded Events */}
          {seededEvents.length > 0 && (
            <div style={{ padding: '10px 14px' }}>
              <div style={{ color: '#5a4d6a', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                Demo Events
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {seededEvents.map((evt) => (
                  <a
                    key={evt.id}
                    href={`/operator/events/${evt.id}`}
                    style={{ ...S.chip, background: '#2a1520', borderColor: '#5a2530', color: '#e8b4aa' }}
                  >
                    {evt.title}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

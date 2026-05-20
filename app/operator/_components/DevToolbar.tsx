'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import type { Persona, PersonaStep } from '@/lib/dev/persona-types';
import type {
  ActiveMission,
  MissionDifficulty,
} from '@/lib/dev/qa-types';
import { QAMissionPanel } from './QAMissionPanel';

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

  // AI QA Runner state
  const [scenario, setScenario] = useState('');
  const [selectedSteps, setSelectedSteps] = useState<Record<PersonaStep, boolean>>({
    apply: true,
    auto_approve: true,
    rsvp: true,
    pay: false,
    checkin: true,
  });
  const [persona, setPersona] = useState<Persona | null>(null);
  const [runLog, setRunLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [resultApplicationId, setResultApplicationId] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // QA Game Mode state
  const [mission, setMission] = useState<ActiveMission | null>(null);
  const [missionLoading, setMissionLoading] = useState(false);
  const [missionError, setMissionError] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<MissionDifficulty>('medium');
  const [leaderboard, setLeaderboard] = useState<
    Array<{ id: string; operatorName: string; score: number; missionType: string; difficulty: string }>
  >([]);
  const [recent, setRecent] = useState<
    Array<{ id: string; missionType: string; difficulty: string; score: number; status: string; completedAt: string | null }>
  >([]);
  const [completionSummary, setCompletionSummary] = useState<{
    score: number;
    durationMs: number;
    timeBonus: number;
    completionBonus: number;
    bugsFound: number;
    stepsCompleted: number;
    stepsTotal: number;
  } | null>(null);

  const stripeLive =
    typeof process !== 'undefined' &&
    (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '').startsWith('pk_live_');

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
      // Cmd+Shift+Option+D (Ctrl+Shift+Alt+D on Windows). We check e.code
      // because Option+D produces '∂' on macOS, breaking an e.key check.
      // Triple-modifier — macOS would otherwise steal Cmd+Option+D for the Dock.
      if (
        e.altKey &&
        e.shiftKey &&
        (e.metaKey || e.ctrlKey) &&
        e.code === 'KeyD'
      ) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isAllowed, toggle]);

  // Rehydrate active mission on mount + load leaderboard / recent.
  useEffect(() => {
    if (!isAllowed) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/dev/qa/active');
        if (res.ok) {
          const data = (await res.json()) as { mission: ActiveMission | null };
          if (!cancelled && data.mission) setMission(data.mission);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [isAllowed]);

  const refreshBoards = useCallback(async () => {
    try {
      const [lbRes, recRes] = await Promise.all([
        fetch('/api/dev/qa/leaderboard'),
        fetch('/api/dev/qa/recent'),
      ]);
      if (lbRes.ok) {
        const d = await lbRes.json();
        setLeaderboard(d.leaderboard ?? []);
      }
      if (recRes.ok) {
        const d = await recRes.json();
        setRecent(d.recent ?? []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!isAllowed || !open) return;
    refreshBoards();
  }, [isAllowed, open, refreshBoards]);

  async function handleStartMission() {
    setMissionLoading(true);
    setMissionError(null);
    setCompletionSummary(null);
    try {
      const res = await fetch('/api/dev/qa/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ difficulty }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMissionError(data?.error ?? 'Could not generate mission.');
        return;
      }
      setMission(data.mission as ActiveMission);
    } catch (e) {
      setMissionError(e instanceof Error ? e.message : 'Network error.');
    } finally {
      setMissionLoading(false);
    }
  }

  function handleMissionComplete(summary: {
    score: number;
    durationMs: number;
    timeBonus: number;
    completionBonus: number;
    bugsFound: number;
    stepsCompleted: number;
    stepsTotal: number;
  }) {
    setCompletionSummary(summary);
    setMission(null);
    refreshBoards();
  }

  function handleMissionAbandon() {
    setMission(null);
    refreshBoards();
  }

  function handleMissionUpdate(next: ActiveMission) {
    setMission(next);
  }

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

  function appendLog(line: string) {
    setRunLog((prev) => {
      const next = [...prev, line];
      requestAnimationFrame(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
      });
      return next;
    });
  }

  async function handleGenerateAndRun() {
    setRunning(true);
    setRunLog([]);
    setPersona(null);
    setResultApplicationId(null);
    appendLog('⏳ Generating persona…');
    try {
      const gen = await fetch('/api/dev/persona/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scenario: scenario.trim() || undefined }),
      });
      if (!gen.ok) throw new Error(await gen.text());
      const { persona: p } = (await gen.json()) as { persona: Persona };
      setPersona(p);
      appendLog(`✓ Persona: ${p.fullName} — ${p.archetype_lean}`);

      const steps: PersonaStep[] = (Object.entries(selectedSteps) as Array<[PersonaStep, boolean]>)
        .filter(([, on]) => on)
        .map(([s]) => s);
      if (!steps.length) {
        appendLog('No steps selected — done.');
        return;
      }

      appendLog(`▶ Running steps: ${steps.join(', ')}`);
      const res = await fetch('/api/dev/persona/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ persona: p, steps }),
      });
      if (!res.ok || !res.body) throw new Error(`Run failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n\n');
        buf = lines.pop() ?? '';
        for (const block of lines) {
          if (!block.startsWith('data:')) continue;
          const json = block.slice(5).trim();
          if (!json) continue;
          try {
            const ev = JSON.parse(json) as {
              type: string;
              step?: string;
              message?: string;
              data?: { applicationId?: string } & Record<string, unknown>;
            };
            if (ev.type === 'step.start') appendLog(`→ ${ev.step}`);
            else if (ev.type === 'step.progress') appendLog(`   ${ev.message}`);
            else if (ev.type === 'step.complete') appendLog(`✓ ${ev.step}`);
            else if (ev.type === 'step.error') appendLog(`✗ ${ev.step}: ${ev.message}`);
            else if (ev.type === 'run.complete') {
              appendLog('— done.');
              if (ev.data?.applicationId) setResultApplicationId(ev.data.applicationId);
            } else if (ev.type === 'run.error') appendLog(`✗ ${ev.message}`);
          } catch {}
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed';
      appendLog(`✗ ${msg}`);
    } finally {
      setRunning(false);
    }
  }

  async function handleSeed50() {
    if (!window.confirm('Generate 50 AI personas as applications? This will use Claude credits.')) return;
    setBatchRunning(true);
    setRunLog((prev) => [...prev, '🌱 Seeding 50 personas — this may take ~3-5 minutes.']);
    try {
      const res = await fetch('/api/dev/persona/seed-batch', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Batch failed');
      appendLog(
        `✓ Created ${data.created} (${data.statusDistribution.pending}p · ${data.statusDistribution.hold}h · ${data.statusDistribution.approved}a · ${data.statusDistribution.rejected}r) in ${Math.round(data.totalMs / 1000)}s`,
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Batch failed';
      appendLog(`✗ ${msg}`);
    } finally {
      setBatchRunning(false);
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
      {/* Mission panel — floats bottom-left whenever a mission is active */}
      {mission && (
        <QAMissionPanel
          mission={mission}
          onUpdate={handleMissionUpdate}
          onComplete={handleMissionComplete}
          onAbandon={handleMissionAbandon}
        />
      )}

      {/* Floating pill — always visible, hidden when panel is open */}
      <button
        onClick={toggle}
        title="Dev Tools (⌘⇧⌥D)"
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

          {/* AI QA Runner */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #2d2438' }}>
            <div style={{ color: '#5a4d6a', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
              AI QA Runner
            </div>
            <textarea
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              placeholder="Scenario (optional) — e.g. founder who just moved from NYC"
              rows={2}
              style={{
                width: '100%',
                background: '#231d2e',
                border: '1px solid #3d3050',
                borderRadius: 6,
                color: '#e8e4f0',
                fontSize: 11,
                padding: '6px 8px',
                fontFamily: 'monospace',
                resize: 'vertical',
                marginBottom: 8,
              }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {(['apply', 'auto_approve', 'rsvp', 'pay', 'checkin'] as PersonaStep[]).map((s) => {
                const checked = selectedSteps[s];
                const disabled = s === 'pay' && stripeLive;
                return (
                  <label
                    key={s}
                    title={disabled ? 'Switch Stripe to Test Mode' : undefined}
                    style={{
                      ...S.chip,
                      background: checked ? '#3a2540' : '#231d2e',
                      borderColor: checked ? '#B22E21' : '#3d3050',
                      color: disabled ? '#5a4d6a' : '#c4b8d4',
                      opacity: disabled ? 0.5 : 1,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked && !disabled}
                      disabled={disabled}
                      onChange={(e) => setSelectedSteps((prev) => ({ ...prev, [s]: e.target.checked }))}
                      style={{ marginRight: 4 }}
                    />
                    {s}
                  </label>
                );
              })}
            </div>
            {stripeLive && (
              <div style={{ color: '#f87171', fontSize: 9, marginBottom: 6 }}>
                Stripe Live Mode detected — Pay step is disabled.
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <button onClick={handleGenerateAndRun} disabled={running || batchRunning} style={S.btn}>
                {running ? '⏳' : '▶'} Generate & Run
              </button>
              <button onClick={handleSeed50} disabled={running || batchRunning} style={{ ...S.btn, background: '#2a1820', borderColor: '#5a3530', color: '#e8c4b4' }}>
                {batchRunning ? '⏳' : '🌱'} Seed 50 personas (AI)
              </button>
            </div>
            {persona && (
              <div style={{ background: '#231d2e', border: '1px solid #3d3050', borderRadius: 6, padding: '6px 8px', marginBottom: 8, fontSize: 10 }}>
                <div style={{ color: '#e8e4f0', fontWeight: 700 }}>{persona.fullName}</div>
                <div style={{ color: '#c4b8d4' }}>
                  {persona.archetype_lean} · {persona.neighborhood}
                </div>
              </div>
            )}
            {runLog.length > 0 && (
              <div
                ref={logRef}
                style={{
                  maxHeight: 160,
                  overflowY: 'auto',
                  background: '#0f0c14',
                  border: '1px solid #2d2438',
                  borderRadius: 6,
                  padding: 6,
                  fontSize: 10,
                  fontFamily: 'monospace',
                  color: '#c4b8d4',
                  lineHeight: 1.4,
                }}
              >
                {runLog.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            )}
            {resultApplicationId && (
              <a
                href={`/operator/applications/${resultApplicationId}`}
                style={{ ...S.chip, marginTop: 8, display: 'inline-block', background: '#2a1820', borderColor: '#5a2530', color: '#e8b4aa' }}
              >
                View persona →
              </a>
            )}
          </div>

          {/* QA Game Mode */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #2d2438' }}>
            <div style={{ color: '#5a4d6a', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
              🎮 QA Game Mode
            </div>
            {mission ? (
              <div style={{ color: '#c4b8d4', fontSize: 11 }}>
                Mission in progress · {mission.score}pt · panel docked bottom-left
              </div>
            ) : (
              <>
                {/* Difficulty selector */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                  {(['easy', 'medium', 'hard'] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      style={{
                        ...S.chip,
                        flex: 1,
                        textAlign: 'center',
                        background: difficulty === d ? '#3a2540' : '#231d2e',
                        borderColor: difficulty === d ? '#B22E21' : '#3d3050',
                        color: difficulty === d ? '#e8e4f0' : '#c4b8d4',
                        textTransform: 'capitalize',
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleStartMission}
                  disabled={missionLoading}
                  style={{ ...S.btn, width: '100%', textAlign: 'center', fontWeight: 700 }}
                >
                  {missionLoading ? '⏳ Generating…' : 'Start Mission →'}
                </button>
                {missionError && (
                  <div style={{ color: '#f87171', fontSize: 10, marginTop: 6 }}>
                    ✗ {missionError}
                  </div>
                )}
              </>
            )}

            {/* Completion summary (post-mission) */}
            {completionSummary && !mission && (
              <div
                style={{
                  marginTop: 10,
                  padding: 8,
                  borderRadius: 6,
                  border: '1px solid #4ade80',
                  background: '#0f1a14',
                  color: '#c4d8c0',
                  fontSize: 10,
                  lineHeight: 1.5,
                }}
              >
                <div style={{ color: '#4ade80', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                  ✓ Mission complete · {completionSummary.score}pt
                </div>
                <div>
                  {completionSummary.stepsCompleted}/{completionSummary.stepsTotal} steps ·{' '}
                  {Math.round(completionSummary.durationMs / 1000)}s · {completionSummary.bugsFound} bug
                  {completionSummary.bugsFound === 1 ? '' : 's'}
                </div>
                {completionSummary.timeBonus > 0 && (
                  <div style={{ color: '#fbbf24' }}>
                    +{completionSummary.timeBonus}pt time bonus
                  </div>
                )}
                {completionSummary.completionBonus > 0 && (
                  <div style={{ color: '#fbbf24' }}>
                    +{completionSummary.completionBonus}pt full clear
                  </div>
                )}
              </div>
            )}

            {/* Leaderboard (weekly) */}
            {leaderboard.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ color: '#5a4d6a', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                  This week · top 5
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10 }}>
                  {leaderboard.map((row, i) => (
                    <div
                      key={row.id}
                      style={{
                        display: 'flex',
                        gap: 6,
                        color: i === 0 ? '#fbbf24' : '#c4b8d4',
                      }}
                    >
                      <span style={{ width: 14 }}>{['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.operatorName}
                      </span>
                      <span style={{ color: '#5a4d6a' }}>{row.missionType.replace('_', ' ')}</span>
                      <span style={{ fontWeight: 700 }}>{row.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent missions */}
            {recent.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ color: '#5a4d6a', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                  Recent
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10 }}>
                  {recent.map((row) => (
                    <div key={row.id} style={{ display: 'flex', gap: 6, color: '#c4b8d4' }}>
                      <span style={{ color: row.status === 'completed' ? '#4ade80' : '#5a4d6a' }}>
                        {row.status === 'completed' ? '✓' : '×'}
                      </span>
                      <span style={{ flex: 1 }}>{row.missionType.replace('_', ' ')}</span>
                      <span style={{ color: '#5a4d6a' }}>{row.difficulty}</span>
                      <span style={{ fontWeight: 700 }}>{row.score}</span>
                    </div>
                  ))}
                </div>
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

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { ActiveMission, CompletedStep } from '@/lib/dev/qa-types';
import { matchCheckpoint } from '@/lib/dev/qa-types';

export interface MissionCompletionSummary {
  score: number;
  durationMs: number;
  stepsCompleted: number;
  stepsTotal: number;
  bugsFound: number;
  timeBonus: number;
  completionBonus: number;
  stepPoints: number;
}

interface QAMissionPanelProps {
  mission: ActiveMission;
  onUpdate: (next: ActiveMission) => void;
  onComplete: (summary: MissionCompletionSummary) => void;
  onAbandon: () => void;
}

const S = {
  panel: {
    position: 'fixed' as const,
    bottom: 20,
    left: 20,
    zIndex: 9999,
    width: 360,
    background: '#0f0c14',
    border: '1px solid #3a2540',
    borderRadius: 10,
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#e8e4f0',
    boxShadow: '0 8px 48px rgba(0,0,0,0.7)',
    overflow: 'hidden',
    maxHeight: '85vh',
    display: 'flex' as const,
    flexDirection: 'column' as const,
  },
  btn: {
    background: '#231d2e',
    border: '1px solid #3d3050',
    borderRadius: 6,
    color: '#e8e4f0',
    fontSize: 11,
    padding: '6px 10px',
    cursor: 'pointer' as const,
    fontFamily: 'monospace',
  },
  primary: {
    background: '#B22E21',
    border: '1px solid #B22E21',
    borderRadius: 6,
    color: '#fff',
    fontSize: 11,
    padding: '6px 10px',
    cursor: 'pointer' as const,
    fontFamily: 'monospace',
    fontWeight: 700,
  },
  danger: {
    background: '#2a1820',
    border: '1px solid #5a2020',
    color: '#e8b4aa',
    borderRadius: 6,
    fontSize: 10,
    padding: '4px 8px',
    cursor: 'pointer' as const,
    fontFamily: 'monospace',
  },
  label: {
    color: '#5a4d6a',
    fontSize: 9,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
  },
};

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function QAMissionPanel({ mission, onUpdate, onComplete, onAbandon }: QAMissionPanelProps) {
  const pathname = usePathname();
  const [elapsed, setElapsed] = useState(() => Date.now() - new Date(mission.startedAt).getTime());
  const [bugOpen, setBugOpen] = useState(false);
  const [bugDescription, setBugDescription] = useState('');
  const [completeOpen, setCompleteOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Auto-detection runs once per (mission, pathname) pair.
  const detectedFor = useRef<Set<string>>(new Set());

  // Live timer.
  useEffect(() => {
    const t = setInterval(
      () => setElapsed(Date.now() - new Date(mission.startedAt).getTime()),
      1000,
    );
    return () => clearInterval(t);
  }, [mission.startedAt]);

  const completedIds = new Set(mission.completedSteps.map((c) => c.id));
  const nextStep = mission.steps.find((s) => !completedIds.has(s.id));
  const allDone = mission.steps.length > 0 && mission.steps.every((s) => completedIds.has(s.id));
  const timeLimitMs = mission.timeLimit ? mission.timeLimit * 1000 : null;
  const overTime = timeLimitMs !== null && elapsed > timeLimitMs;
  const remainingMs = timeLimitMs !== null ? Math.max(0, timeLimitMs - elapsed) : null;

  const markStep = useCallback(
    async (stepId: string, source: 'auto' | 'manual') => {
      if (completedIds.has(stepId)) return;
      try {
        const res = await fetch(`/api/dev/qa/${mission.id}/checkpoint`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ stepId, success: true, source }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { score: number; completedSteps: CompletedStep[] };
        onUpdate({ ...mission, score: data.score, completedSteps: data.completedSteps });
      } catch {}
    },
    [mission, completedIds, onUpdate],
  );

  // URL-based auto-detection of checkpoints.
  useEffect(() => {
    if (!pathname || allDone) return;
    for (const step of mission.steps) {
      if (completedIds.has(step.id)) continue;
      const key = `${mission.id}:${step.id}:${pathname}`;
      if (detectedFor.current.has(key)) continue;
      if (matchCheckpoint(step.checkpoint, pathname)) {
        detectedFor.current.add(key);
        markStep(step.id, 'auto');
      }
    }
  }, [pathname, mission.steps, mission.id, completedIds, allDone, markStep]);

  async function handleSkip(stepId: string) {
    if (!window.confirm('Skip this step? Costs 10 points.')) return;
    try {
      const res = await fetch(`/api/dev/qa/${mission.id}/checkpoint`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stepId, success: true, source: 'manual', skip: true }),
      });
      if (res.ok) {
        const data = (await res.json()) as { score: number; completedSteps: CompletedStep[] };
        onUpdate({ ...mission, score: data.score, completedSteps: data.completedSteps });
      }
    } catch {}
  }

  async function submitBug() {
    const text = bugDescription.trim();
    if (!text) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/dev/qa/${mission.id}/bug`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          description: text,
          location: pathname ?? 'unknown',
        }),
      });
      if (!res.ok) {
        setError('Could not save bug report.');
        return;
      }
      const data = (await res.json()) as { score: number; bugsFound: ActiveMission['bugsFound'] };
      onUpdate({ ...mission, score: data.score, bugsFound: data.bugsFound });
      setBugDescription('');
      setBugOpen(false);
    } catch {
      setError('Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitComplete() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/dev/qa/${mission.id}/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          feedback: feedback.trim() || undefined,
          timeLimitSec: mission.timeLimit ?? undefined,
        }),
      });
      if (!res.ok) {
        setError('Could not complete mission.');
        return;
      }
      const data = (await res.json()) as {
        mission: MissionCompletionSummary & { id: string };
      };
      onComplete(data.mission);
    } catch {
      setError('Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  async function abandon() {
    if (!window.confirm('Abandon this mission? No score saved.')) return;
    try {
      await fetch(`/api/dev/qa/${mission.id}/abandon`, { method: 'POST' });
    } catch {}
    onAbandon();
  }

  const difficultyColor =
    mission.difficulty === 'hard'
      ? '#f87171'
      : mission.difficulty === 'medium'
      ? '#fbbf24'
      : '#4ade80';

  return (
    <div style={S.panel}>
      {/* Header */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid #3a2540',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, color: '#B22E21', fontSize: 11, letterSpacing: '0.1em' }}>
            🎮 MISSION
          </span>
          <span
            style={{
              fontSize: 9,
              padding: '2px 6px',
              borderRadius: 4,
              background: '#231d2e',
              border: `1px solid ${difficultyColor}`,
              color: difficultyColor,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            {mission.difficulty}
          </span>
          <span style={{ fontSize: 9, color: '#c4b8d4' }}>{mission.missionType.replace('_', ' ')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: 13 }}>{mission.score}</span>
          <span style={{ color: overTime ? '#f87171' : '#c4b8d4', fontSize: 11 }}>
            {remainingMs !== null ? fmtElapsed(remainingMs) : fmtElapsed(elapsed)}
          </span>
        </div>
      </div>

      {/* Scrolling body */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {/* Scenario */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #2d2438', color: '#c4b8d4', lineHeight: 1.5 }}>
          {mission.scenario}
        </div>

        {/* Bonus objective */}
        {mission.bonusObjective && (
          <div
            style={{
              padding: '8px 14px',
              borderBottom: '1px solid #2d2438',
              background: '#1a1520',
              color: '#fbbf24',
              fontSize: 10,
            }}
          >
            ⭐ Bonus: {mission.bonusObjective}
          </div>
        )}

        {/* Steps */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #2d2438' }}>
          <div style={{ ...S.label, marginBottom: 8 }}>Steps</div>
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {mission.steps.map((step) => {
              const done = completedIds.has(step.id);
              const current = !done && step === nextStep;
              const checkpointKind = step.checkpoint.startsWith('visit:') ? 'auto' : 'manual';
              return (
                <li
                  key={step.id}
                  style={{
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: current ? '1px solid #B22E21' : '1px solid #2d2438',
                    background: done ? '#1a2a1a' : current ? '#231820' : '#15121a',
                    opacity: done ? 0.7 : 1,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <span style={{ color: done ? '#4ade80' : current ? '#B22E21' : '#5a4d6a', fontSize: 13, lineHeight: 1.2 }}>
                      {done ? '✓' : '○'}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          color: done ? '#88aa88' : '#e8e4f0',
                          textDecoration: done ? 'line-through' : 'none',
                          lineHeight: 1.4,
                        }}
                      >
                        {step.instruction}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                        <span style={{ color: '#fbbf24', fontSize: 9 }}>+{step.points}pt</span>
                        <span style={{ color: '#5a4d6a', fontSize: 9 }}>
                          {checkpointKind === 'auto' ? '⤷ auto-detect' : '⤷ manual confirm'}
                        </span>
                        {!done && (
                          <>
                            <button
                              onClick={() => markStep(step.id, 'manual')}
                              style={{
                                ...S.btn,
                                fontSize: 9,
                                padding: '2px 6px',
                                marginLeft: 'auto',
                              }}
                            >
                              Mark done
                            </button>
                            <button onClick={() => handleSkip(step.id)} style={S.danger}>
                              Skip
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Bug list */}
        {mission.bugsFound.length > 0 && (
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #2d2438' }}>
            <div style={{ ...S.label, marginBottom: 6 }}>Bugs found · {mission.bugsFound.length}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, color: '#c4b8d4' }}>
              {mission.bugsFound.map((b) => (
                <div key={b.id} style={{ display: 'flex', gap: 4 }}>
                  <span style={{ color: '#fbbf24' }}>🐛</span>
                  <span style={{ flex: 1, lineHeight: 1.4 }}>{b.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action footer */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid #3a2540', background: '#0f0c14' }}>
        {bugOpen ? (
          <div>
            <div style={{ ...S.label, marginBottom: 4 }}>Found a bug — describe</div>
            <textarea
              value={bugDescription}
              onChange={(e) => setBugDescription(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="What broke? Steps to reproduce?"
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
                marginBottom: 6,
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={submitBug} disabled={submitting || !bugDescription.trim()} style={S.primary}>
                {submitting ? '…' : '+25pt'}
              </button>
              <button onClick={() => setBugOpen(false)} style={S.btn}>
                Cancel
              </button>
            </div>
          </div>
        ) : completeOpen ? (
          <div>
            <div style={{ ...S.label, marginBottom: 4 }}>How was it?</div>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              maxLength={4000}
              rows={3}
              placeholder="Feedback (optional)"
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
                marginBottom: 6,
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={submitComplete} disabled={submitting} style={S.primary}>
                {submitting ? '…' : 'Save score'}
              </button>
              <button onClick={() => setCompleteOpen(false)} style={S.btn}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => setBugOpen(true)} style={S.btn}>
              🐛 Found a bug
            </button>
            <button
              onClick={() => setCompleteOpen(true)}
              disabled={!allDone}
              style={{
                ...S.primary,
                opacity: allDone ? 1 : 0.4,
                cursor: allDone ? 'pointer' : 'not-allowed',
              }}
              title={allDone ? 'Complete mission' : 'Finish all steps first'}
            >
              Complete →
            </button>
            <button onClick={abandon} style={{ ...S.danger, marginLeft: 'auto' }}>
              Abandon
            </button>
          </div>
        )}
        {error && (
          <div style={{ color: '#f87171', fontSize: 10, marginTop: 6 }}>{error}</div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type {
  ActiveMission,
  BugReport,
  BugSeverity,
  CompletedStep,
  JudgeVerdict,
  MissionDisplayMode,
} from '@/lib/dev/qa-types';
import { matchCheckpoint } from '@/lib/dev/qa-types';
import {
  QA_ACTION_EVENT,
  setQAActive,
  type QAActionEntry,
} from '@/lib/dev/qa-action-log';

const MAX_TRAIL_ENTRIES = 20;
// Slightly higher than the server's 4s timeout — gives the response time to land
// before the client aborts. Empirically Sonnet runs 2.5–3.5s on this prompt.
const JUDGE_CLIENT_TIMEOUT_MS = 5000;
const VERDICT_COLOR_MS = { pass: 500, partial: 800, fail: 1000 } as const;
const VERDICT_REASON_MS = 3000;

const VERDICT_PALETTE: Record<JudgeVerdict, { bg: string; border: string; text: string; label: string }> = {
  pass: {
    bg: 'rgba(74, 222, 128, 0.35)',
    border: 'rgba(74, 222, 128, 0.6)',
    text: '#4ade80',
    label: '✓ Correct',
  },
  partial: {
    bg: 'rgba(251, 191, 36, 0.35)',
    border: 'rgba(251, 191, 36, 0.6)',
    text: '#fbbf24',
    label: '△ Partial',
  },
  fail: {
    bg: 'rgba(248, 113, 113, 0.35)',
    border: 'rgba(248, 113, 113, 0.6)',
    text: '#f87171',
    label: '✗ Miss',
  },
};

interface JudgeResult {
  verdict: JudgeVerdict | null;
  reason: string | null;
}

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
  /** True when rendered inside the pop-out window — disables HUD mode and pop-out button. */
  popoutWindow?: boolean;
  /** Caller wants the pop-out feature; if false, the ⤢ button is hidden. */
  enablePopout?: boolean;
  /** Called when the user clicks ⤢ in the main window. */
  onRequestPopout?: () => void;
}

const LS_POS = 'nobc-qa-panel-pos';
const LS_MIN = 'nobc-qa-panel-minimized';
const LS_MODE = 'nobc-qa-display-mode';
const WIDTH = 380;
const HUD_BTN_STYLE: React.CSSProperties = {
  background: 'rgba(35, 29, 46, 0.7)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6,
  color: '#f0eaf6',
  fontSize: 12,
  padding: '4px 10px',
  cursor: 'pointer',
  fontFamily: 'monospace',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};

const S = {
  btn: {
    background: '#231d2e',
    border: '1px solid #3d3050',
    borderRadius: 6,
    color: '#f0eaf6',
    fontSize: 12,
    padding: '6px 10px',
    cursor: 'pointer' as const,
    fontFamily: 'monospace',
  },
  primary: {
    background: '#B22E21',
    border: '1px solid #B22E21',
    borderRadius: 6,
    color: '#fff',
    fontSize: 12,
    padding: '6px 10px',
    cursor: 'pointer' as const,
    fontFamily: 'monospace',
    fontWeight: 700,
  },
  danger: {
    background: '#2a1820',
    border: '1px solid #5a2020',
    color: '#f0b8ae',
    borderRadius: 6,
    fontSize: 11,
    padding: '4px 8px',
    cursor: 'pointer' as const,
    fontFamily: 'monospace',
  },
  label: {
    color: '#8a7a9a',
    fontSize: 10,
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

interface Position {
  x: number;
  y: number;
}

interface SummaryPayload {
  markdown: string;
  fixes: string | null;
  title: string;
  stepsPassed: number;
  stepsTotal: number;
  bugs?: BugReport[];
}

export function QAMissionPanel({
  mission,
  onUpdate,
  onComplete,
  onAbandon,
  popoutWindow = false,
  enablePopout = false,
  onRequestPopout,
}: QAMissionPanelProps) {
  const pathname = usePathname();
  const [elapsed, setElapsed] = useState(() => Date.now() - new Date(mission.startedAt).getTime());
  const [bugOpen, setBugOpen] = useState(false);
  const [bugDescription, setBugDescription] = useState('');
  const [bugStepIndex, setBugStepIndex] = useState<number | null>(null);
  const [bugSeverity, setBugSeverity] = useState<BugSeverity>('medium');
  const [bugScreenshot, setBugScreenshot] = useState<string | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [displayMode, setDisplayMode] = useState<MissionDisplayMode>(
    popoutWindow ? 'expanded' : 'hud',
  );
  const [pos, setPos] = useState<Position | null>(null);
  const [stepExpanded, setStepExpanded] = useState(false);
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [judging, setJudging] = useState(false);
  const [verdictColor, setVerdictColor] = useState<JudgeVerdict | null>(null);
  const [verdictReason, setVerdictReason] = useState<
    { verdict: JudgeVerdict; reason: string } | null
  >(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const detectedFor = useRef<Set<string>>(new Set());
  const summarySubmittedRef = useRef<MissionCompletionSummary | null>(null);
  const actionLogRef = useRef<QAActionEntry[]>([]);

  // Restore persisted state. Pop-out window ignores persisted displayMode.
  useEffect(() => {
    try {
      const rawPos = localStorage.getItem(LS_POS);
      if (rawPos) {
        const p = JSON.parse(rawPos) as Position;
        if (typeof p?.x === 'number' && typeof p?.y === 'number') setPos(p);
      }
      const rawMin = localStorage.getItem(LS_MIN);
      if (rawMin === 'true') setMinimized(true);
      if (!popoutWindow) {
        const rawMode = localStorage.getItem(LS_MODE);
        if (rawMode === 'expanded' || rawMode === 'hud') {
          setDisplayMode(rawMode as MissionDisplayMode);
        }
      }
    } catch {}
  }, [popoutWindow]);

  // Live timer.
  useEffect(() => {
    const t = setInterval(
      () => setElapsed(Date.now() - new Date(mission.startedAt).getTime()),
      1000,
    );
    return () => clearInterval(t);
  }, [mission.startedAt]);

  const completedIds = useMemo(
    () => new Set(mission.completedSteps.map((c) => c.id)),
    [mission.completedSteps],
  );
  const completedById = useMemo(() => {
    const m = new Map<string, CompletedStep>();
    for (const c of mission.completedSteps) m.set(c.id, c);
    return m;
  }, [mission.completedSteps]);
  const currentStepIndex = mission.steps.findIndex((s) => !completedIds.has(s.id));
  const currentStep = currentStepIndex >= 0 ? mission.steps[currentStepIndex] : null;
  const allDone = mission.steps.length > 0 && mission.steps.every((s) => completedIds.has(s.id));
  const timeLimitMs = mission.timeLimit ? mission.timeLimit * 1000 : null;
  const overTime = timeLimitMs !== null && elapsed > timeLimitMs;
  const remainingMs = timeLimitMs !== null ? Math.max(0, timeLimitMs - elapsed) : null;

  /** Open the bug form. If `stepIndex` is provided, ties the bug to that step;
   *  otherwise defaults to the current active step. Per-step Bug buttons in the
   *  expanded panel pass an explicit index so the report attaches to the right card. */
  const openBugForm = useCallback(
    (stepIndex?: number) => {
      const next =
        typeof stepIndex === 'number'
          ? stepIndex
          : currentStepIndex >= 0
          ? currentStepIndex
          : null;
      setBugStepIndex(next);
      setBugScreenshot(null);
      setScreenshotError(null);
      setBugOpen(true);
    },
    [currentStepIndex],
  );

  // Auto-collapse the expanded step text whenever the active step changes.
  useEffect(() => {
    setStepExpanded(false);
  }, [currentStepIndex]);

  // Mark this window as having an active QA mission so logQAAction() emits events.
  useEffect(() => {
    setQAActive(true);
    return () => setQAActive(false);
  }, []);

  // Reset the action trail whenever a new step becomes active.
  useEffect(() => {
    actionLogRef.current = [];
  }, [currentStepIndex]);

  const pushAction = useCallback((entry: QAActionEntry) => {
    const next = [...actionLogRef.current, entry];
    if (next.length > MAX_TRAIL_ENTRIES) {
      next.splice(0, next.length - MAX_TRAIL_ENTRIES);
    }
    actionLogRef.current = next;
  }, []);

  // Log every pathname change as a navigation entry.
  useEffect(() => {
    if (!pathname) return;
    pushAction({
      timestamp: Date.now(),
      type: 'navigate',
      label: pathname,
      url: pathname,
    });
  }, [pathname, pushAction]);

  // Subscribe to operator actions emitted via logQAAction().
  useEffect(() => {
    function onAction(e: Event) {
      const detail = (e as CustomEvent<QAActionEntry>).detail;
      if (!detail || typeof detail.label !== 'string') return;
      pushAction({
        timestamp: detail.timestamp || Date.now(),
        type: 'action',
        label: detail.label,
      });
    }
    window.addEventListener(QA_ACTION_EVENT, onAction as EventListener);
    return () => window.removeEventListener(QA_ACTION_EVENT, onAction as EventListener);
  }, [pushAction]);

  /** Ask Claude to grade what the operator did against the step instruction. */
  const runJudge = useCallback(
    async (stepInstruction: string): Promise<JudgeResult> => {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), JUDGE_CLIENT_TIMEOUT_MS);
        const res = await fetch('/api/dev/qa/judge', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            stepInstruction,
            actionTrail: actionLogRef.current,
          }),
          signal: ctl.signal,
        });
        clearTimeout(t);
        if (!res.ok) return { verdict: null, reason: null };
        const data = (await res.json()) as JudgeResult;
        return {
          verdict: data.verdict ?? null,
          reason: data.reason ?? null,
        };
      } catch {
        return { verdict: null, reason: null };
      }
    },
    [],
  );

  const showVerdictFlash = useCallback((v: JudgeVerdict, reason: string | null) => {
    setVerdictColor(v);
    setTimeout(() => setVerdictColor((cur) => (cur === v ? null : cur)), VERDICT_COLOR_MS[v]);
    if (v !== 'pass' && reason) {
      setVerdictReason({ verdict: v, reason });
      setTimeout(() => {
        setVerdictReason((cur) =>
          cur && cur.verdict === v && cur.reason === reason ? null : cur,
        );
      }, VERDICT_REASON_MS);
    }
  }, []);

  const markStep = useCallback(
    async (
      stepId: string,
      source: 'auto' | 'manual',
      verdict?: JudgeVerdict | null,
      verdictReason?: string | null,
    ) => {
      if (completedIds.has(stepId)) return;
      try {
        const res = await fetch(`/api/dev/qa/${mission.id}/checkpoint`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            stepId,
            success: true,
            source,
            verdict: verdict ?? null,
            verdictReason: verdictReason ?? null,
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { score: number; completedSteps: CompletedStep[] };
        onUpdate({ ...mission, score: data.score, completedSteps: data.completedSteps });
      } catch {}
    },
    [mission, completedIds, onUpdate],
  );

  // URL-based auto-detection — sequential only.
  // Previously this iterated every incomplete step, so navigating to a URL that
  // matched step N+2's checkpoint could auto-complete it while N+1 was still
  // open (e.g. happened when the operator opened a page to take a screenshot
  // before filing a bug). Now only the *next* incomplete step can auto-fire.
  useEffect(() => {
    if (!pathname || allDone || !currentStep) return;
    const key = `${mission.id}:${currentStep.id}:${pathname}`;
    if (detectedFor.current.has(key)) return;
    if (matchCheckpoint(currentStep.checkpoint, pathname)) {
      detectedFor.current.add(key);
      markStep(currentStep.id, 'auto');
    }
  }, [pathname, currentStep, mission.id, allDone, markStep]);

  function setMode(next: MissionDisplayMode) {
    setDisplayMode(next);
    if (!popoutWindow) {
      try {
        localStorage.setItem(LS_MODE, next);
      } catch {}
    }
  }

  function onHeaderMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const rect = panelRef.current?.getBoundingClientRect();
    const startX = rect?.left ?? pos?.x ?? 20;
    const startY = rect?.top ?? pos?.y ?? window.innerHeight - 200;
    dragRef.current = { dx: e.clientX - startX, dy: e.clientY - startY };
    if (!pos) setPos({ x: startX, y: startY });

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({ x: ev.clientX - dragRef.current.dx, y: ev.clientY - dragRef.current.dy });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      dragRef.current = null;
      setPos((p) => {
        if (!p) return p;
        const panelH = panelRef.current?.offsetHeight ?? 200;
        const clamped: Position = {
          x: Math.max(0, Math.min(window.innerWidth - 60, p.x)),
          y: Math.max(0, Math.min(window.innerHeight - Math.max(60, panelH), p.y)),
        };
        try {
          localStorage.setItem(LS_POS, JSON.stringify(clamped));
        } catch {}
        return clamped;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function toggleMinimize() {
    setMinimized((m) => {
      const next = !m;
      try {
        localStorage.setItem(LS_MIN, String(next));
      } catch {}
      return next;
    });
  }

  async function handleUndoStep(stepId: string) {
    if (!window.confirm('Undo this step? Its points will be reversed.')) return;
    try {
      const res = await fetch(`/api/dev/qa/${mission.id}/checkpoint`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stepId }),
      });
      if (res.ok) {
        const data = (await res.json()) as { score: number; completedSteps: CompletedStep[] };
        onUpdate({ ...mission, score: data.score, completedSteps: data.completedSteps });
      }
    } catch {}
  }

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

  // HUD soft-skip: advance without marking pass/fail (0 points, no penalty).
  async function handleSoftSkip(
    stepId: string,
    verdict?: JudgeVerdict | null,
    verdictReason?: string | null,
  ) {
    try {
      const res = await fetch(`/api/dev/qa/${mission.id}/checkpoint`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stepId,
          success: true,
          source: 'manual',
          softSkip: true,
          verdict: verdict ?? null,
          verdictReason: verdictReason ?? null,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { score: number; completedSteps: CompletedStep[] };
        onUpdate({ ...mission, score: data.score, completedSteps: data.completedSteps });
      }
    } catch {}
  }

  /** Pass click — ask judge first, then advance with verdict attached. */
  async function handlePass() {
    if (!currentStep || judging) return;
    setJudging(true);
    const result = await runJudge(currentStep.instruction);
    setJudging(false);
    if (result.verdict) showVerdictFlash(result.verdict, result.reason);
    await markStep(currentStep.id, 'manual', result.verdict, result.reason);
  }

  /** Soft-skip click — judge runs informationally; 0 points either way. */
  async function handleSoftSkipWithJudge() {
    if (!currentStep || judging) return;
    setJudging(true);
    const result = await runJudge(currentStep.instruction);
    setJudging(false);
    if (result.verdict) showVerdictFlash(result.verdict, result.reason);
    await handleSoftSkip(currentStep.id, result.verdict, result.reason);
  }

  /** Submit a bug. Strictly informational — does NOT mark a checkpoint
   *  or advance the active step. Only ✓ Pass and → Skip move progress. */
  async function submitBug() {
    const text = bugDescription.trim();
    if (!text) return;
    setSubmitting(true);
    setError(null);
    try {
      const stepTitle =
        typeof bugStepIndex === 'number' && mission.steps[bugStepIndex]
          ? mission.steps[bugStepIndex].instruction
          : null;
      const res = await fetch(`/api/dev/qa/${mission.id}/bug`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          description: text,
          location: pathname ?? 'unknown',
          stepIndex: bugStepIndex,
          stepTitle,
          severity: bugSeverity,
          screenshotDataUrl: bugScreenshot ?? undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data?.error === 'string' ? data.error : 'Could not save bug report.');
        return;
      }
      const data = (await res.json()) as { score: number; bugsFound: BugReport[] };
      onUpdate({ ...mission, score: data.score, bugsFound: data.bugsFound });
      setBugDescription('');
      setBugSeverity('medium');
      setBugScreenshot(null);
      setScreenshotError(null);
      setBugOpen(false);
    } catch {
      setError('Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  async function loadSummary() {
    setSummaryLoading(true);
    try {
      const res = await fetch(`/api/dev/qa/${mission.id}/summary`);
      if (!res.ok) return;
      const data = (await res.json()) as SummaryPayload;
      setSummary(data);
      setMode('expanded');
    } catch {} finally {
      setSummaryLoading(false);
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
      // Show the summary inside the panel instead of dismissing.
      setCompleteOpen(false);
      await loadSummary();
      // Defer the parent unmount until the user dismisses the summary.
      summarySubmittedRef.current = data.mission;
    } catch {
      setError('Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  function dismissSummary() {
    if (summarySubmittedRef.current) onComplete(summarySubmittedRef.current);
    setSummary(null);
  }

  async function copySummary() {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
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

  // ─────────────────────────────────────────────────────────────────────
  // HUD mode — compact bottom-center bar with current step.
  // ─────────────────────────────────────────────────────────────────────
  if (displayMode === 'hud' && !popoutWindow && !summary) {
    const verdictBg = verdictColor ? VERDICT_PALETTE[verdictColor].bg : null;
    const verdictBorder = verdictColor ? VERDICT_PALETTE[verdictColor].border : null;
    return (
      <>
        <div
          style={{
            position: 'fixed',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9998,
            display: 'flex',
            flexDirection: 'column',
            gap: stepExpanded && !allDone && currentStep ? 6 : 0,
            padding: stepExpanded && !allDone && currentStep ? '8px 14px' : '6px 14px',
            background:
              verdictBg ??
              (allDone
                ? 'rgba(74, 222, 128, 0.18)'
                : 'rgba(20, 10, 30, 0.75)'),
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: `1px solid ${verdictBorder ?? 'rgba(255,255,255,0.1)'}`,
            borderRadius: stepExpanded && !allDone && currentStep ? 14 : 22,
            color: '#f0eaf6',
            fontFamily: 'monospace',
            fontSize: 13,
            boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
            minHeight: 44,
            maxWidth: 'min(720px, 92vw)',
            transition: 'background 0.3s ease, border-color 0.3s ease, border-radius 0.15s ease, padding 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🎮</span>
          {allDone ? (
            <>
              <span style={{ color: '#4ade80', fontWeight: 700 }}>
                ✓ Mission Complete · {mission.score}pt
              </span>
              <button
                onClick={() => setCompleteOpen(true)}
                style={{ ...HUD_BTN_STYLE, background: 'rgba(74, 222, 128, 0.25)' }}
              >
                View Summary →
              </button>
            </>
          ) : currentStep ? (
            <>
              <span
                style={{
                  color: '#b0a0c0',
                  fontSize: 11,
                  letterSpacing: '0.05em',
                  flexShrink: 0,
                }}
              >
                Step {currentStepIndex + 1}/{mission.steps.length}:
              </span>
              <button
                onClick={() => setStepExpanded((v) => !v)}
                title={currentStep.instruction}
                aria-label={
                  stepExpanded ? 'Hide full step instruction' : 'Show full step instruction'
                }
                aria-expanded={stepExpanded}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  margin: 0,
                  cursor: 'pointer',
                  color: '#f0eaf6',
                  font: 'inherit',
                  textAlign: 'left',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  flex: 1,
                  minWidth: 0,
                  maxWidth: 380,
                }}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
                >
                  {currentStep.instruction}
                </span>
                <span
                  aria-hidden="true"
                  style={{
                    fontSize: 10,
                    color: '#8a7a9a',
                    flexShrink: 0,
                    transform: stepExpanded ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.15s ease',
                  }}
                >
                  ▾
                </span>
              </button>
            </>
          ) : (
            <span style={{ color: '#b0a0c0' }}>No steps</span>
          )}

          <span
            style={{
              color: '#fbbf24',
              fontWeight: 700,
              fontSize: 13,
              flexShrink: 0,
              borderLeft: '1px solid rgba(255,255,255,0.1)',
              paddingLeft: 8,
              marginLeft: 4,
            }}
          >
            {mission.score}
          </span>
          <span style={{ color: overTime ? '#f87171' : '#d4c8e0', fontSize: 11, flexShrink: 0 }}>
            {remainingMs !== null ? fmtElapsed(remainingMs) : fmtElapsed(elapsed)}
          </span>

          <div
            style={{
              display: 'flex',
              gap: 4,
              flexShrink: 0,
              borderLeft: '1px solid rgba(255,255,255,0.1)',
              paddingLeft: 8,
              marginLeft: 4,
            }}
          >
            <button
              onClick={() => (bugOpen ? setBugOpen(false) : openBugForm())}
              title="Report a bug"
              style={{ ...HUD_BTN_STYLE, background: bugOpen ? 'rgba(178, 46, 33, 0.45)' : HUD_BTN_STYLE.background }}
            >
              🐛 Bug
            </button>
            {currentStep && !allDone && (
              <button
                onClick={handlePass}
                disabled={judging}
                title={judging ? 'Asking judge…' : 'Mark current step done'}
                style={{
                  ...HUD_BTN_STYLE,
                  opacity: judging ? 0.7 : 1,
                  cursor: judging ? 'wait' : 'pointer',
                }}
              >
                {judging ? '⏳ Judging…' : '✓ Pass'}
              </button>
            )}
            {currentStep && !allDone && (
              <button
                onClick={handleSoftSkipWithJudge}
                disabled={judging}
                title="Skip this step — advances without marking pass or fail"
                style={{
                  ...HUD_BTN_STYLE,
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: '#8a7a9a',
                  fontSize: 11,
                  padding: '3px 8px',
                  opacity: judging ? 0.5 : 1,
                  cursor: judging ? 'wait' : 'pointer',
                }}
              >
                → Skip
              </button>
            )}
            <button onClick={() => setMode('expanded')} title="Expand panel" style={HUD_BTN_STYLE}>
              ▢ Expand
            </button>
          </div>
          </div>

          {/* Expanded step text — wraps below the row when toggled */}
          {stepExpanded && !allDone && currentStep && (
            <div
              style={{
                color: '#e8dff2',
                fontSize: 13,
                lineHeight: 1.55,
                padding: '4px 26px 2px',
                borderTop: '1px solid rgba(255,255,255,0.08)',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
              }}
            >
              {currentStep.instruction}
            </div>
          )}

          {/* Inline verdict label flashing inside the bar (pass shows briefly) */}
          {verdictColor && (
            <div
              style={{
                fontSize: 11,
                color: VERDICT_PALETTE[verdictColor].text,
                fontWeight: 700,
                letterSpacing: '0.05em',
                padding: '2px 26px 4px',
                borderTop: '1px dashed rgba(255,255,255,0.06)',
              }}
            >
              {VERDICT_PALETTE[verdictColor].label}
            </div>
          )}
        </div>

        {/* Auto-collapsing reason banner for partial/fail */}
        {verdictReason && (
          <div
            style={{
              position: 'fixed',
              bottom: 76,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 9997,
              maxWidth: 'min(720px, 92vw)',
              padding: '8px 14px',
              background: VERDICT_PALETTE[verdictReason.verdict].bg,
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: `1px solid ${VERDICT_PALETTE[verdictReason.verdict].border}`,
              borderRadius: 8,
              color: '#f0eaf6',
              fontFamily: 'monospace',
              fontSize: 12,
              lineHeight: 1.5,
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                color: VERDICT_PALETTE[verdictReason.verdict].text,
                fontWeight: 700,
                letterSpacing: '0.05em',
                flexShrink: 0,
              }}
            >
              {VERDICT_PALETTE[verdictReason.verdict].label}
            </span>
            <span style={{ color: '#e8dff2' }}>{verdictReason.reason}</span>
          </div>
        )}

        {/* Inline bug popover anchored above the HUD bar */}
        {bugOpen && (
          <BugFormPopover
            anchor="hud"
            steps={mission.steps}
            bugStepIndex={bugStepIndex}
            setBugStepIndex={setBugStepIndex}
            bugDescription={bugDescription}
            setBugDescription={setBugDescription}
            bugSeverity={bugSeverity}
            setBugSeverity={setBugSeverity}
            bugScreenshot={bugScreenshot}
            setBugScreenshot={setBugScreenshot}
            screenshotError={screenshotError}
            setScreenshotError={setScreenshotError}
            submit={submitBug}
            cancel={() => setBugOpen(false)}
            submitting={submitting}
            error={error}
          />
        )}

        {/* Complete-flow modal stays available even from HUD */}
        {completeOpen && (
          <CompleteFormPopover
            feedback={feedback}
            setFeedback={setFeedback}
            submit={submitComplete}
            cancel={() => setCompleteOpen(false)}
            submitting={submitting}
            summaryLoading={summaryLoading}
          />
        )}
      </>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // Expanded panel.
  // ─────────────────────────────────────────────────────────────────────
  const baseStyle: React.CSSProperties = {
    zIndex: 9999,
    background: 'rgba(18, 10, 28, 0.88)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#f0eaf6',
    boxShadow: '0 8px 48px rgba(0,0,0,0.7)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  };
  const panelStyle: React.CSSProperties = popoutWindow
    ? { ...baseStyle, position: 'relative', width: '100%', maxHeight: 'none' }
    : {
        ...baseStyle,
        position: 'fixed',
        width: WIDTH,
        maxHeight: minimized ? undefined : '85vh',
        ...(pos ? { top: pos.y, left: pos.x } : { bottom: 20, left: 20 }),
      };

  return (
    <div ref={panelRef} style={panelStyle}>
      {/* Header */}
      <div
        onMouseDown={popoutWindow ? undefined : onHeaderMouseDown}
        style={{
          padding: '10px 14px',
          borderBottom: minimized && !summary ? 'none' : '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: popoutWindow ? 'default' : 'move',
          userSelect: 'none',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          <span style={{ fontWeight: 700, color: '#B22E21', fontSize: 12, letterSpacing: '0.1em' }}>
            🎮 MISSION
          </span>
          <span
            style={{
              fontSize: 10,
              padding: '2px 6px',
              borderRadius: 4,
              background: 'rgba(35, 29, 46, 0.7)',
              border: `1px solid ${difficultyColor}`,
              color: difficultyColor,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              flexShrink: 0,
            }}
          >
            {mission.difficulty}
          </span>
          <span
            style={{
              fontSize: 10,
              color: '#b0a0c0',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {mission.missionType.replace('_', ' ')}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: 14 }}>{mission.score}</span>
          <span style={{ color: overTime ? '#f87171' : '#d4c8e0', fontSize: 12 }}>
            {remainingMs !== null ? fmtElapsed(remainingMs) : fmtElapsed(elapsed)}
          </span>
          {enablePopout && !popoutWindow && (
            <button
              onClick={onRequestPopout}
              title="Pop out to a separate window"
              style={{
                background: 'none',
                border: 'none',
                color: '#8a7a9a',
                cursor: 'pointer',
                fontSize: 13,
                padding: '2px 4px',
              }}
            >
              ⤢
            </button>
          )}
          {!popoutWindow && (
            <button
              onClick={() => setMode('hud')}
              title="Collapse to HUD"
              style={{
                background: 'none',
                border: 'none',
                color: '#8a7a9a',
                cursor: 'pointer',
                fontSize: 13,
                padding: '2px 4px',
              }}
            >
              ⌄
            </button>
          )}
          <button
            onClick={toggleMinimize}
            title={minimized ? 'Expand' : 'Minimize'}
            style={{
              background: 'none',
              border: 'none',
              color: '#8a7a9a',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              padding: '2px 4px',
            }}
          >
            {minimized ? '▢' : '—'}
          </button>
        </div>
      </div>

      {!minimized && summary && (
        <SummaryView
          summary={summary}
          loading={summaryLoading}
          copied={copied}
          onCopy={copySummary}
          onDismiss={dismissSummary}
        />
      )}

      {!minimized && !summary && (
        <>
          {/* Scrolling body */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {/* Scenario */}
            <div
              style={{
                padding: '12px 14px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                color: '#e8dff2',
                lineHeight: 1.6,
                fontSize: 14,
              }}
            >
              {mission.scenario}
            </div>

            {mission.bonusObjective && (
              <div
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(26, 21, 32, 0.7)',
                  color: '#fbbf24',
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                ⭐ Bonus: {mission.bonusObjective}
              </div>
            )}

            {/* Steps */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ ...S.label, marginBottom: 10 }}>Steps</div>
              <ol
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {mission.steps.map((step, i) => {
                  const done = completedIds.has(step.id);
                  const current = !done && i === currentStepIndex;
                  const checkpointKind = step.checkpoint.startsWith('visit:') ? 'auto' : 'manual';
                  const completedRow = completedById.get(step.id);
                  const stepVerdict = completedRow?.verdict ?? null;
                  const stepVerdictReason = completedRow?.verdictReason ?? null;
                  return (
                    <li
                      key={step.id}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: current ? '1px solid #B22E21' : '1px solid rgba(255,255,255,0.06)',
                        background: done
                          ? 'rgba(21, 36, 24, 0.6)'
                          : current
                          ? 'rgba(35, 24, 32, 0.6)'
                          : 'rgba(21, 18, 26, 0.4)',
                        opacity: done ? 0.75 : 1,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <span
                          style={{
                            color: done ? '#4ade80' : current ? '#B22E21' : '#8a7a9a',
                            fontSize: 15,
                            lineHeight: 1.2,
                            flexShrink: 0,
                          }}
                        >
                          {done ? '✓' : '○'}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              color: done ? '#9ab89a' : '#f0eaf6',
                              textDecoration: done ? 'line-through' : 'none',
                              lineHeight: 1.5,
                              fontSize: 14,
                            }}
                          >
                            {step.instruction}
                          </div>
                          {stepVerdict && (
                            <div
                              style={{
                                marginTop: 4,
                                fontSize: 11,
                                color: VERDICT_PALETTE[stepVerdict].text,
                                lineHeight: 1.4,
                              }}
                            >
                              <span style={{ fontWeight: 700, letterSpacing: '0.05em' }}>
                                {VERDICT_PALETTE[stepVerdict].label}
                              </span>
                              {stepVerdictReason && (
                                <span style={{ color: '#b0a0c0', marginLeft: 6 }}>
                                  — {stepVerdictReason}
                                </span>
                              )}
                            </div>
                          )}
                          <div
                            style={{
                              display: 'flex',
                              gap: 8,
                              marginTop: 6,
                              alignItems: 'center',
                              flexWrap: 'wrap',
                            }}
                          >
                            <span style={{ color: '#fbbf24', fontSize: 10 }}>+{step.points}pt</span>
                            <span style={{ color: '#8a7a9a', fontSize: 10 }}>
                              {checkpointKind === 'auto' ? '⤷ auto-detect' : '⤷ manual confirm'}
                            </span>
                            {/* Per-step Report Bug — works on ANY step, not just current.
                             *  Pre-selects this step in the bug form so the report ties
                             *  to the right card even when filing later. */}
                            <button
                              onClick={() => openBugForm(i)}
                              style={{
                                ...S.btn,
                                fontSize: 10,
                                padding: '3px 8px',
                                marginLeft: done ? 0 : 0,
                                color: '#f0b8ae',
                              }}
                              title={`Report a bug on step ${i + 1}`}
                            >
                              🐛 Bug
                            </button>
                            {done && (
                              <button
                                onClick={() => handleUndoStep(step.id)}
                                style={{
                                  ...S.btn,
                                  fontSize: 10,
                                  padding: '3px 8px',
                                  marginLeft: 'auto',
                                  color: '#b0a0c0',
                                }}
                                title="Undo this step — marks it incomplete again"
                              >
                                ↩ Undo
                              </button>
                            )}
                            {!done && (
                              <>
                                <button
                                  onClick={() => {
                                    if (current) handlePass();
                                    else markStep(step.id, 'manual');
                                  }}
                                  disabled={current && judging}
                                  style={{
                                    ...S.btn,
                                    fontSize: 10,
                                    padding: '3px 8px',
                                    marginLeft: 'auto',
                                    opacity: current && judging ? 0.6 : 1,
                                    cursor: current && judging ? 'wait' : 'pointer',
                                  }}
                                >
                                  {current && judging ? '⏳ Judging…' : 'Mark done'}
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

            {mission.bugsFound.length > 0 && (
              <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ ...S.label, marginBottom: 8 }}>
                  Bugs found · {mission.bugsFound.length}
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    fontSize: 12,
                    color: '#dcd2e6',
                  }}
                >
                  {mission.bugsFound.map((b) => (
                    <div key={b.id} style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <span style={{ color: '#fbbf24', flexShrink: 0 }}>🐛</span>
                        <span style={{ flex: 1, lineHeight: 1.5 }}>
                          {typeof b.stepIndex === 'number' && (
                            <span style={{ color: '#8a7a9a' }}>Step {b.stepIndex + 1} · </span>
                          )}
                          <span
                            style={{
                              color:
                                b.severity === 'high'
                                  ? '#f87171'
                                  : b.severity === 'low'
                                  ? '#9ab89a'
                                  : '#fbbf24',
                              fontSize: 10,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              marginRight: 4,
                            }}
                          >
                            [{b.severity ?? 'medium'}]
                          </span>
                          {b.description}
                        </span>
                      </div>
                      {b.screenshotDataUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={b.screenshotDataUrl}
                          alt="Bug screenshot"
                          style={{
                            maxHeight: 120,
                            maxWidth: '100%',
                            borderRadius: 4,
                            border: '1px solid rgba(255,255,255,0.08)',
                            marginLeft: 18,
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action footer */}
          <div
            style={{
              padding: '10px 14px',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(15, 12, 20, 0.85)',
            }}
          >
            {bugOpen ? (
              <BugFormInline
                steps={mission.steps}
                bugStepIndex={bugStepIndex}
                setBugStepIndex={setBugStepIndex}
                bugDescription={bugDescription}
                setBugDescription={setBugDescription}
                bugSeverity={bugSeverity}
                setBugSeverity={setBugSeverity}
                bugScreenshot={bugScreenshot}
                setBugScreenshot={setBugScreenshot}
                screenshotError={screenshotError}
                setScreenshotError={setScreenshotError}
                submit={submitBug}
                cancel={() => setBugOpen(false)}
                submitting={submitting}
              />
            ) : completeOpen ? (
              <div>
                <div style={{ ...S.label, marginBottom: 6 }}>How was it?</div>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  maxLength={4000}
                  rows={3}
                  placeholder="Feedback (optional)"
                  style={{
                    width: '100%',
                    background: 'rgba(35, 29, 46, 0.5)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    color: '#f0eaf6',
                    fontSize: 13,
                    padding: '8px 10px',
                    fontFamily: 'monospace',
                    resize: 'vertical',
                    marginBottom: 8,
                    lineHeight: 1.5,
                  }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={submitComplete}
                    disabled={submitting || summaryLoading}
                    style={S.primary}
                  >
                    {submitting || summaryLoading ? '…' : 'Save & view summary'}
                  </button>
                  <button onClick={() => setCompleteOpen(false)} style={S.btn}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={() => openBugForm()} style={S.btn}>
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
              <div style={{ color: '#f87171', fontSize: 11, marginTop: 8 }}>{error}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helper components
// ─────────────────────────────────────────────────────────────────────

interface BugFormFieldsProps {
  steps: ActiveMission['steps'];
  bugStepIndex: number | null;
  setBugStepIndex: (n: number | null) => void;
  bugDescription: string;
  setBugDescription: (s: string) => void;
  bugSeverity: BugSeverity;
  setBugSeverity: (s: BugSeverity) => void;
  bugScreenshot: string | null;
  setBugScreenshot: (s: string | null) => void;
  screenshotError: string | null;
  setScreenshotError: (s: string | null) => void;
  submit: () => void;
  cancel: () => void;
  submitting: boolean;
}

const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;

function ingestImageFile(
  file: File,
  setScreenshot: (s: string) => void,
  setErr: (s: string) => void,
) {
  if (!file.type.startsWith('image/')) {
    setErr('Not an image.');
    return;
  }
  if (file.size > 3 * 1024 * 1024) {
    setErr('Screenshot too large (max 3MB).');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const result = reader.result;
    if (typeof result === 'string' && result.length <= MAX_SCREENSHOT_BYTES) {
      setScreenshot(result);
    } else {
      setErr('Screenshot encoded too large.');
    }
  };
  reader.onerror = () => setErr('Could not read the file.');
  reader.readAsDataURL(file);
}

function StepSelector({
  steps,
  value,
  onChange,
}: {
  steps: ActiveMission['steps'];
  value: number | null;
  onChange: (n: number | null) => void;
}) {
  return (
    <select
      value={value === null ? '__general' : String(value)}
      onChange={(e) =>
        onChange(e.target.value === '__general' ? null : Number(e.target.value))
      }
      style={{
        width: '100%',
        background: 'rgba(35, 29, 46, 0.7)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 6,
        color: '#f0eaf6',
        fontSize: 12,
        padding: '6px 8px',
        fontFamily: 'monospace',
      }}
    >
      <option value="__general">General / Not step-specific</option>
      {steps.map((s, i) => (
        <option key={s.id} value={i}>
          Step {i + 1}: {s.instruction.length > 60 ? s.instruction.slice(0, 57) + '…' : s.instruction}
        </option>
      ))}
    </select>
  );
}

function SeverityPicker({
  value,
  onChange,
}: {
  value: BugSeverity;
  onChange: (s: BugSeverity) => void;
}) {
  const opts: Array<{ key: BugSeverity; label: string; color: string }> = [
    { key: 'low', label: 'Low', color: '#9ab89a' },
    { key: 'medium', label: 'Medium', color: '#fbbf24' },
    { key: 'high', label: 'High', color: '#f87171' },
  ];
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          style={{
            flex: 1,
            background: value === o.key ? `${o.color}22` : 'rgba(35, 29, 46, 0.7)',
            border: `1px solid ${value === o.key ? o.color : 'rgba(255,255,255,0.1)'}`,
            color: value === o.key ? o.color : '#b0a0c0',
            borderRadius: 6,
            padding: '6px',
            fontSize: 11,
            fontFamily: 'monospace',
            cursor: 'pointer',
            letterSpacing: '0.05em',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function BugFormInline({
  steps,
  bugStepIndex,
  setBugStepIndex,
  bugDescription,
  setBugDescription,
  bugSeverity,
  setBugSeverity,
  bugScreenshot,
  setBugScreenshot,
  screenshotError,
  setScreenshotError,
  submit,
  cancel,
  submitting,
}: BugFormFieldsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData?.items ?? []);
    for (const it of items) {
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const file = it.getAsFile();
        if (file) {
          e.preventDefault();
          setScreenshotError(null);
          ingestImageFile(file, setBugScreenshot, setScreenshotError);
          return;
        }
      }
    }
  }

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setScreenshotError(null);
    ingestImageFile(file, setBugScreenshot, setScreenshotError);
    // Reset so picking the same file again still fires onChange.
    e.target.value = '';
  }

  return (
    <div>
      <div style={{ ...S.label, marginBottom: 6 }}>Which step?</div>
      <div style={{ marginBottom: 8 }}>
        <StepSelector steps={steps} value={bugStepIndex} onChange={setBugStepIndex} />
      </div>
      <div style={{ ...S.label, marginBottom: 6 }}>Severity</div>
      <div style={{ marginBottom: 8 }}>
        <SeverityPicker value={bugSeverity} onChange={setBugSeverity} />
      </div>
      <div style={{ ...S.label, marginBottom: 6 }}>What broke?</div>
      <textarea
        value={bugDescription}
        onChange={(e) => setBugDescription(e.target.value)}
        onPaste={onPaste}
        maxLength={2000}
        rows={3}
        placeholder="Paste an image, or describe what broke"
        style={{
          width: '100%',
          background: 'rgba(35, 29, 46, 0.5)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6,
          color: '#f0eaf6',
          fontSize: 13,
          padding: '8px 10px',
          fontFamily: 'monospace',
          resize: 'vertical',
          marginBottom: 8,
          lineHeight: 1.5,
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={{ ...S.btn, fontSize: 11, padding: '4px 8px' }}
        >
          📎 Attach screenshot
        </button>
        <span style={{ color: '#6a5a7a', fontSize: 10 }}>or paste image into text box</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={onFilePick}
          style={{ display: 'none' }}
        />
      </div>
      {bugScreenshot && (
        <div
          style={{
            position: 'relative',
            marginBottom: 8,
            display: 'inline-block',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6,
            padding: 2,
            background: 'rgba(15, 12, 20, 0.5)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bugScreenshot}
            alt="Screenshot preview"
            style={{ display: 'block', maxHeight: 120, maxWidth: '100%', borderRadius: 4 }}
          />
          <button
            type="button"
            onClick={() => setBugScreenshot(null)}
            aria-label="Remove screenshot"
            style={{
              position: 'absolute',
              top: -8,
              right: -8,
              width: 22,
              height: 22,
              borderRadius: 11,
              background: '#231d2e',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#f0eaf6',
              fontSize: 13,
              lineHeight: 1,
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>
      )}
      {screenshotError && (
        <div style={{ color: '#f87171', fontSize: 11, marginBottom: 8 }}>{screenshotError}</div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={submit}
          disabled={submitting || !bugDescription.trim()}
          style={S.primary}
        >
          {submitting ? '…' : 'Report +25pt'}
        </button>
        <button onClick={cancel} style={S.btn}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function BugFormPopover({
  anchor,
  steps,
  bugStepIndex,
  setBugStepIndex,
  bugDescription,
  setBugDescription,
  bugSeverity,
  setBugSeverity,
  bugScreenshot,
  setBugScreenshot,
  screenshotError,
  setScreenshotError,
  submit,
  cancel,
  submitting,
  error,
}: BugFormFieldsProps & { anchor: 'hud'; error: string | null }) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        width: 'min(420px, 92vw)',
        background: 'rgba(18, 10, 28, 0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10,
        padding: 14,
        boxShadow: '0 8px 48px rgba(0,0,0,0.6)',
        fontFamily: 'monospace',
        color: '#f0eaf6',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, color: '#B22E21', fontSize: 12, letterSpacing: '0.1em' }}>
          🐛 REPORT BUG
        </span>
        <button onClick={cancel} style={{ background: 'none', border: 'none', color: '#8a7a9a', cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1 }}>
          ×
        </button>
      </div>
      <BugFormInline
        steps={steps}
        bugStepIndex={bugStepIndex}
        setBugStepIndex={setBugStepIndex}
        bugDescription={bugDescription}
        setBugDescription={setBugDescription}
        bugSeverity={bugSeverity}
        setBugSeverity={setBugSeverity}
        bugScreenshot={bugScreenshot}
        setBugScreenshot={setBugScreenshot}
        screenshotError={screenshotError}
        setScreenshotError={setScreenshotError}
        submit={submit}
        cancel={cancel}
        submitting={submitting}
      />
      {error && (
        <div style={{ color: '#f87171', fontSize: 11, marginTop: 8 }}>{error}</div>
      )}
      {anchor === 'hud' && null}
    </div>
  );
}

function CompleteFormPopover({
  feedback,
  setFeedback,
  submit,
  cancel,
  submitting,
  summaryLoading,
}: {
  feedback: string;
  setFeedback: (s: string) => void;
  submit: () => void;
  cancel: () => void;
  submitting: boolean;
  summaryLoading: boolean;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        width: 'min(420px, 92vw)',
        background: 'rgba(18, 10, 28, 0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10,
        padding: 14,
        boxShadow: '0 8px 48px rgba(0,0,0,0.6)',
        fontFamily: 'monospace',
        color: '#f0eaf6',
      }}
    >
      <div style={{ ...S.label, marginBottom: 6 }}>How was it?</div>
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        maxLength={4000}
        rows={3}
        placeholder="Feedback (optional)"
        style={{
          width: '100%',
          background: 'rgba(35, 29, 46, 0.5)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6,
          color: '#f0eaf6',
          fontSize: 13,
          padding: '8px 10px',
          fontFamily: 'monospace',
          resize: 'vertical',
          marginBottom: 8,
          lineHeight: 1.5,
        }}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={submit} disabled={submitting || summaryLoading} style={S.primary}>
          {submitting || summaryLoading ? 'Generating summary…' : 'Save & view summary'}
        </button>
        <button onClick={cancel} style={S.btn}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function SummaryView({
  summary,
  loading,
  copied,
  onCopy,
  onDismiss,
}: {
  summary: SummaryPayload;
  loading: boolean;
  copied: boolean;
  onCopy: () => void;
  onDismiss: () => void;
}) {
  return (
    <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ ...S.label, marginBottom: 6 }}>Mission complete</div>
        <div style={{ color: '#f0eaf6', fontSize: 14, lineHeight: 1.5, marginBottom: 4 }}>
          {summary.title}
        </div>
        <div style={{ color: '#b0a0c0', fontSize: 12 }}>
          {summary.stepsPassed}/{summary.stepsTotal} steps passed
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: '12px 14px', fontSize: 13, color: '#e8dff2' }}>
            ⏳ Building summary + asking Claude for fix recs…
          </div>
        ) : (
          <>
            {/* Bug thumbnails inline — markdown can't carry images cleanly. */}
            {summary.bugs && summary.bugs.length > 0 && (
              <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ ...S.label, marginBottom: 8 }}>
                  Screenshots ·{' '}
                  {summary.bugs.filter((b) => b.screenshotDataUrl).length} of{' '}
                  {summary.bugs.length} bugs
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {summary.bugs.map((b, i) => (
                    <div key={b.id ?? i}>
                      <div style={{ fontSize: 12, color: '#dcd2e6', marginBottom: 4 }}>
                        Bug #{i + 1} —{' '}
                        {typeof b.stepIndex === 'number' && b.stepTitle
                          ? `Step ${b.stepIndex + 1}: ${b.stepTitle.slice(0, 60)}`
                          : 'General'}{' '}
                        <span
                          style={{
                            color:
                              b.severity === 'high'
                                ? '#f87171'
                                : b.severity === 'low'
                                ? '#9ab89a'
                                : '#fbbf24',
                            fontSize: 10,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                          }}
                        >
                          [{b.severity ?? 'medium'}]
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#b0a0c0', marginBottom: 6, lineHeight: 1.5 }}>
                        {b.description}
                      </div>
                      {b.screenshotDataUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={b.screenshotDataUrl}
                          alt={`Bug #${i + 1} screenshot`}
                          style={{
                            maxHeight: 200,
                            maxWidth: '100%',
                            borderRadius: 4,
                            border: '1px solid rgba(255,255,255,0.08)',
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div
              style={{
                padding: '12px 14px',
                whiteSpace: 'pre-wrap',
                fontSize: 13,
                lineHeight: 1.6,
                color: '#e8dff2',
              }}
            >
              {summary.markdown}
            </div>
          </>
        )}
      </div>
      <div
        style={{
          padding: '10px 14px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(15, 12, 20, 0.85)',
          display: 'flex',
          gap: 6,
          alignItems: 'center',
        }}
      >
        <button onClick={onCopy} style={S.primary}>
          {copied ? '✓ Copied!' : '📋 Copy for Claude Code'}
        </button>
        <button onClick={onDismiss} style={S.btn}>
          Done
        </button>
      </div>
    </div>
  );
}

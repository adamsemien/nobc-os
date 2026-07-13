'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * THE LINE — the other Back Room game. You run the line outside the door:
 * three lanes, obstacles you dodge or clear, velvet-rope gates that grow or
 * shrink your crew (pick your lane, pick your fate — a wink at our own access
 * gates). Reach the door with the biggest crew you can keep alive.
 *
 * Every obstacle, gate, and line of copy is fiction generated on the client —
 * no member data is read, no network, no writes. High score only, in
 * localStorage. Canvas + one requestAnimationFrame loop; colors resolved from
 * the design tokens at mount (never raw hex), so the game inherits the Back
 * Room's Darkroom palette. Audio reuses the room's procedural WebAudio.
 */

const BEST_KEY = 'nobc-theline-best';

type Sfx = { pluck: () => void; buzz: () => void } | null;

const LANES = 3;
const ROUNDS = 3;
/** Distance (world units) to the door, per round. */
const ROUND_LENGTH = [90, 120, 150];
/** World scroll speed (units/sec), per round, plus a mild ramp within a round. */
const ROUND_SPEED = [11, 14, 17];
const LIVES_START = 3;
const CREW_START = 2;
const SHOT_MAX = 3;
const SHOT_RECHARGE_S = 5;
const HIT_IFRAMES_S = 1.2;

interface Obstacle {
  kind: 'obstacle';
  lane: number;
  z: number; // world distance ahead of the player
  label: string;
  cleared: boolean;
}
interface Gate {
  kind: 'gate';
  lane: number;
  z: number;
  label: string;
  apply: (crew: number) => number;
  good: boolean;
  used: boolean;
}
type Entity = Obstacle | Gate;

const OBSTACLE_LABELS = [
  'SPILLED ESPRESSO MARTINI',
  'PHONE-OUT PHOTOGRAPHER',
  "SOMEONE'S EX",
  'ROPE TANGLE',
  '"PROMOTER" W/ CLIPBOARD',
  'UNSOLICITED DEMO PITCH',
];

/** Gate deck — dry copy, honest math. Drawn in cross-lane pairs so the lane
 *  choice IS the decision. */
const GATE_DECK: { label: string; apply: (c: number) => number; good: boolean }[] = [
  { label: '+2 CREW — THEY KNOW THE DOORMAN', apply: (c) => c + 2, good: true },
  { label: '+1 — PLUS-ONES WELCOME', apply: (c) => c + 1, good: true },
  { label: '×2 CREW — OPEN BAR (UNCONFIRMED)', apply: (c) => c * 2, good: true },
  { label: '+3 — GROUP CHAT CAME THROUGH', apply: (c) => c + 3, good: true },
  { label: '−3 CREW — CASH BAR (CONFIRMED)', apply: (c) => Math.max(0, c - 3), good: false },
  { label: '−HALF — RED LIST IN EFFECT', apply: (c) => Math.ceil(c / 2), good: false },
  { label: '−2 — DRESS CODE DISPUTE', apply: (c) => Math.max(0, c - 2), good: false },
];

const RANKS: { min: number; title: string }[] = [
  { min: 900, title: 'HEAD OF DOOR' },
  { min: 600, title: 'LIST WHISPERER' },
  { min: 350, title: 'VELVET APPRENTICE' },
  { min: 150, title: 'ROPE HOLDER' },
  { min: 0, title: 'CLIPBOARD INTERN' },
];

interface RunState {
  round: number;
  lane: number;
  crew: number;
  lives: number;
  score: number;
  shots: number;
  shotClock: number;
  dist: number; // distance travelled this round
  speed: number;
  iframes: number;
  entities: Entity[];
  nextSpawnZ: number;
  shake: number;
  flashes: { x: number; y: number; t: number; good: boolean }[];
  playerX: number; // rendered x, eased toward lane center
}

function freshRun(round: number, carry?: Pick<RunState, 'crew' | 'lives' | 'score' | 'shots'>): RunState {
  return {
    round,
    lane: 1,
    crew: carry?.crew ?? CREW_START,
    lives: carry?.lives ?? LIVES_START,
    score: carry?.score ?? 0,
    shots: carry?.shots ?? SHOT_MAX,
    shotClock: 0,
    dist: 0,
    speed: ROUND_SPEED[round],
    iframes: 0,
    entities: [],
    nextSpawnZ: 18,
    shake: 0,
    flashes: [],
    playerX: 0.5,
  };
}

/** Spawn a wave at world depth z: either an obstacle row or a gate pair. */
function spawnWave(s: RunState, rand: () => number) {
  const z = s.nextSpawnZ;
  if (rand() < 0.32) {
    // Gate pair: two different gates across two different lanes — a choice.
    const a = Math.floor(rand() * GATE_DECK.length);
    let b = Math.floor(rand() * GATE_DECK.length);
    if (b === a) b = (b + 1) % GATE_DECK.length;
    const laneA = Math.floor(rand() * LANES);
    let laneB = Math.floor(rand() * LANES);
    if (laneB === laneA) laneB = (laneB + 1) % LANES;
    for (const [deckIdx, lane] of [
      [a, laneA],
      [b, laneB],
    ] as const) {
      const deck = GATE_DECK[deckIdx];
      s.entities.push({ kind: 'gate', lane, z, label: deck.label, apply: deck.apply, good: deck.good, used: false });
    }
    s.nextSpawnZ = z + 16 + rand() * 6;
  } else {
    // Obstacle row: 1–2 lanes blocked, never all three.
    const blocked = 1 + (rand() < 0.45 ? 1 : 0);
    const lanes = [0, 1, 2].sort(() => rand() - 0.5).slice(0, blocked);
    for (const lane of lanes) {
      s.entities.push({
        kind: 'obstacle',
        lane,
        z,
        label: OBSTACLE_LABELS[Math.floor(rand() * OBSTACLE_LABELS.length)],
        cleared: false,
      });
    }
    s.nextSpawnZ = z + 9 + rand() * 5;
  }
}

/** Resolve the six tokens the canvas needs, from the element so the Back
 *  Room's data-theme="darkroom" wrapper is what answers. No raw hex. */
function resolveTokens(el: HTMLElement) {
  const cs = getComputedStyle(el);
  const v = (name: string, fallbackVar: string) =>
    cs.getPropertyValue(name).trim() || cs.getPropertyValue(fallbackVar).trim();
  return {
    bg: v('--bg', '--background'),
    surface: v('--card', '--bg'),
    text: v('--text-primary', '--foreground'),
    muted: v('--text-muted', '--text-secondary'),
    accent: v('--primary', '--accent'),
    good: v('--success', '--primary'),
    border: v('--border-strong', '--border'),
  };
}

export function TheLineGame({ sfx, onExit }: { sfx: Sfx; onExit: () => void }) {
  const [mode, setMode] = useState<'briefing' | 'run' | 'between' | 'report'>('briefing');
  const [best, setBest] = useState<number | null>(null);
  const [hud, setHud] = useState({ crew: CREW_START, lives: LIVES_START, score: 0, shots: SHOT_MAX, round: 0, pct: 0 });
  const [announce, setAnnounce] = useState('');
  const [finalScore, setFinalScore] = useState(0);
  const [madeIt, setMadeIt] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<RunState>(freshRun(0));
  const rafRef = useRef(0);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const reducedRef = useRef(false);
  const seedRef = useRef(1234567);

  // Deterministic-enough PRNG so content stays fiction without Math.random in render.
  const rand = useCallback(() => {
    seedRef.current = (seedRef.current * 48271) % 2147483647;
    return seedRef.current / 2147483647;
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(BEST_KEY);
      if (stored !== null) setBest(Number(stored) || 0);
    } catch {
      // localStorage unavailable — best score simply hidden
    }
    reducedRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const endGame = useCallback((s: RunState, reachedDoor: boolean) => {
    const score = s.score;
    setFinalScore(score);
    setMadeIt(reachedDoor);
    setMode('report');
    setAnnounce(reachedDoor ? `Shift over. Final score ${score}.` : `The line got you. Final score ${score}.`);
    try {
      const stored = Number(localStorage.getItem(BEST_KEY)) || 0;
      if (score > stored) {
        localStorage.setItem(BEST_KEY, String(score));
        setBest(score);
      }
    } catch {
      // best score simply not persisted
    }
  }, []);

  const startRound = useCallback((round: number, carry?: Pick<RunState, 'crew' | 'lives' | 'score' | 'shots'>) => {
    stateRef.current = freshRun(round, carry);
    setMode('run');
    setAnnounce(`Round ${round + 1}. Run the line.`);
  }, []);

  /** Input — lane moves + throw. Keyboard here; touch on the canvas below. */
  const move = useCallback((dir: -1 | 1) => {
    const s = stateRef.current;
    s.lane = Math.max(0, Math.min(LANES - 1, s.lane + dir));
  }, []);

  const throwVibes = useCallback(() => {
    const s = stateRef.current;
    if (s.shots <= 0) return;
    // Clear the nearest un-cleared bad-vibe obstacle in the player's lane.
    const target = s.entities
      .filter((e): e is Obstacle => e.kind === 'obstacle' && !e.cleared && e.lane === s.lane && e.z > 0.5 && e.z < 30)
      .sort((a, b) => a.z - b.z)[0];
    s.shots -= 1;
    if (target) {
      target.cleared = true;
      s.score += 40;
      if (!reducedRef.current) s.flashes.push({ x: target.lane, y: target.z, t: 0.3, good: true });
      sfx?.pluck();
    }
  }, [sfx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onExit();
        return;
      }
      if (modeRef.current !== 'run') return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') move(-1);
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') move(1);
      else if (e.key === 'ArrowUp' || e.key === ' ' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        throwVibes();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, throwVibes, onExit]);

  /** The loop. Fixed-ish timestep from rAF delta; everything scales off dt. */
  useEffect(() => {
    if (mode !== 'run') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const tokens = resolveTokens(canvas);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.scale(dpr, dpr);

    const laneX = (lane: number) => cssW * (0.2 + lane * 0.3);
    /** World z → screen y with a mild pseudo-depth squeeze. */
    const zToY = (z: number) => cssH * 0.82 - (z / 34) * cssH * 0.78;

    let last = performance.now();
    let hudAcc = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = stateRef.current;
      const len = ROUND_LENGTH[s.round];

      // --- advance world ---
      s.speed = ROUND_SPEED[s.round] * (1 + (s.dist / len) * 0.25);
      s.dist += s.speed * dt;
      s.iframes = Math.max(0, s.iframes - dt);
      s.shotClock += dt;
      if (s.shots < SHOT_MAX && s.shotClock >= SHOT_RECHARGE_S) {
        s.shots += 1;
        s.shotClock = 0;
      }
      s.playerX += (s.lane / (LANES - 1) - s.playerX) * Math.min(1, dt * 14);
      for (const e of s.entities) e.z -= s.speed * dt;
      s.entities = s.entities.filter((e) => e.z > -4);
      s.nextSpawnZ -= s.speed * dt;
      // Stop spawning near the door so the arrival reads clean.
      if (s.nextSpawnZ < 34 && s.dist < len - 24) spawnWave(s, rand);
      s.score += dt * 10; // distance points

      // --- collisions at the player's plane (z ≈ 0) ---
      for (const e of s.entities) {
        if (e.z > 1.1 || e.z < -1.1 || e.lane !== s.lane) continue;
        if (e.kind === 'gate' && !e.used) {
          e.used = true;
          const before = s.crew;
          s.crew = e.apply(s.crew);
          s.score += Math.max(0, (s.crew - before) * 25);
          if (!reducedRef.current) s.flashes.push({ x: e.lane, y: 0, t: 0.35, good: e.good });
          if (e.good) sfx?.pluck();
          else sfx?.buzz();
        } else if (e.kind === 'obstacle' && !e.cleared && s.iframes <= 0) {
          e.cleared = true;
          s.iframes = HIT_IFRAMES_S;
          if (!reducedRef.current) {
            s.shake = 0.22;
            s.flashes.push({ x: e.lane, y: 0, t: 0.35, good: false });
          }
          sfx?.buzz();
          if (s.crew > 0) s.crew -= 1;
          else s.lives -= 1;
          if (s.lives <= 0) {
            setHud({ crew: s.crew, lives: 0, score: Math.round(s.score), shots: s.shots, round: s.round, pct: s.dist / len });
            endGame(s, false);
            return;
          }
        }
      }

      // --- round clear: the door ---
      if (s.dist >= len) {
        s.score += s.crew * 60 + s.lives * 40;
        if (s.round + 1 >= ROUNDS) {
          endGame(s, true);
          return;
        }
        setHud({ crew: s.crew, lives: s.lives, score: Math.round(s.score), shots: s.shots, round: s.round, pct: 1 });
        setMode('between');
        setAnnounce(`Door reached. Crew of ${s.crew} inside. Round ${s.round + 2} waits.`);
        return;
      }

      s.shake = Math.max(0, s.shake - dt);
      for (const f of s.flashes) f.t -= dt;
      s.flashes = s.flashes.filter((f) => f.t > 0);

      // --- draw ---
      ctx.save();
      if (s.shake > 0) ctx.translate((rand() - 0.5) * s.shake * 14, (rand() - 0.5) * s.shake * 14);
      ctx.fillStyle = tokens.bg;
      ctx.fillRect(-8, -8, cssW + 16, cssH + 16);

      // Lane ropes
      ctx.strokeStyle = tokens.border;
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const x = cssW * (0.05 + i * 0.3);
        ctx.beginPath();
        ctx.moveTo(x, cssH * 0.04);
        ctx.lineTo(x, cssH * 0.9);
        ctx.stroke();
      }

      // The door, growing as you approach
      const doorScale = Math.min(1, s.dist / len + 0.15);
      ctx.fillStyle = tokens.surface;
      const dw = 60 * doorScale + 20;
      ctx.fillRect(cssW / 2 - dw / 2, cssH * 0.02, dw, 26 * doorScale + 8);
      ctx.fillStyle = tokens.accent;
      ctx.font = `${9 + 4 * doorScale}px ui-sans-serif, system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText('THE DOOR', cssW / 2, cssH * 0.02 + 17 * doorScale + 6);

      // Entities
      for (const e of s.entities) {
        const y = zToY(Math.max(e.z, -2));
        const x = laneX(e.lane);
        const depth = Math.max(0.35, 1 - e.z / 40);
        if (e.kind === 'gate') {
          ctx.globalAlpha = e.used ? 0.25 : depth;
          ctx.strokeStyle = e.good ? tokens.good : tokens.accent;
          ctx.lineWidth = 2;
          const w = cssW * 0.24 * depth;
          ctx.beginPath();
          ctx.moveTo(x - w / 2, y);
          ctx.quadraticCurveTo(x, y + 10 * depth, x + w / 2, y);
          ctx.stroke();
          ctx.fillStyle = e.good ? tokens.good : tokens.accent;
          ctx.font = `${Math.max(7, 10 * depth)}px ui-sans-serif, system-ui`;
          ctx.fillText(e.label, x, y - 6 * depth);
        } else if (!e.cleared) {
          ctx.globalAlpha = depth;
          ctx.fillStyle = tokens.muted;
          const r = 9 * depth;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = tokens.text;
          ctx.font = `${Math.max(6, 8 * depth)}px ui-sans-serif, system-ui`;
          ctx.fillText(e.label, x, y - r - 4);
        }
        ctx.globalAlpha = 1;
      }

      // Impact / gate flashes (token-colored, suppressed under reduced motion)
      for (const f of s.flashes) {
        ctx.globalAlpha = Math.max(0, f.t / 0.35) * 0.5;
        ctx.fillStyle = f.good ? tokens.good : tokens.accent;
        ctx.beginPath();
        ctx.arc(laneX(f.x), zToY(f.y), 26 * (1 - f.t / 0.35) + 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Player + crew dots trailing
      const px = cssW * (0.2 + s.playerX * 0.6);
      const py = cssH * 0.84;
      const blink = s.iframes > 0 && Math.floor(now / 90) % 2 === 0;
      if (!blink) {
        ctx.fillStyle = tokens.text;
        ctx.beginPath();
        ctx.arc(px, py, 10, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = tokens.muted;
      for (let i = 0; i < Math.min(s.crew, 12); i++) {
        ctx.beginPath();
        ctx.arc(px + Math.sin(i * 2.1) * 16, py + 16 + i * 7, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // HUD sync (cheap state write ~4x/sec)
      hudAcc += dt;
      if (hudAcc >= 0.25) {
        hudAcc = 0;
        setHud({ crew: s.crew, lives: s.lives, score: Math.round(s.score), shots: s.shots, round: s.round, pct: Math.min(1, s.dist / len) });
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [mode, rand, sfx, endGame]);

  /** Touch: tap a lane third to move there, swipe up to throw. */
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    touchStartRef.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || modeRef.current !== 'run') return;
    if (start.y - e.clientY > 40) {
      throwVibes();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const third = Math.min(2, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * 3)));
    stateRef.current.lane = third;
  };

  const rank = RANKS.find((r) => finalScore >= r.min)?.title ?? 'CLIPBOARD INTERN';

  return (
    <div className="tl-root" role="group" aria-label="The Line — arcade game">
      <span className="sr-only" aria-live="polite">{announce}</span>

      <div className="tl-head">
        <p className="tl-title">THE LINE</p>
        <button type="button" className="tl-exit" onClick={onExit}>
          Back to the room (Esc)
        </button>
      </div>

      {mode === 'briefing' && (
        <div className="tl-card">
          <p className="tl-kicker">Tonight&rsquo;s shift</p>
          <p className="tl-copy">
            Three lanes. Run the line to the door. Dodge what the night throws, pick your ropes
            wisely — every gate does exactly what it says — and throw good vibes to clear the bad
            ones. Three rounds, three lives, one rank.
          </p>
          <p className="tl-copy tl-dim">
            &larr;/&rarr; or A/D to move &middot; &uarr;/Space to throw &middot; touch: tap a lane,
            swipe up to throw &middot; Esc leaves
          </p>
          {best !== null && <p className="tl-best">Best shift: {best}</p>}
          <button type="button" className="tl-cta" onClick={() => startRound(0)}>
            Start the shift
          </button>
        </div>
      )}

      {(mode === 'run' || mode === 'between') && (
        <>
          <div className="tl-hud" aria-hidden>
            <span>ROUND {hud.round + 1}/{ROUNDS}</span>
            <span>CREW {hud.crew}</span>
            <span>LIVES {'●'.repeat(Math.max(0, hud.lives))}</span>
            <span>VIBES {'✦'.repeat(Math.max(0, hud.shots))}</span>
            <span>SCORE {hud.score}</span>
          </div>
          <div className="tl-progress" aria-hidden>
            <div style={{ width: `${Math.round(hud.pct * 100)}%` }} />
          </div>
        </>
      )}

      {mode === 'run' && (
        <canvas
          ref={canvasRef}
          className="tl-canvas"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          aria-hidden
        />
      )}

      {mode === 'between' && (
        <div className="tl-card">
          <p className="tl-kicker">Round {hud.round + 1} clear</p>
          <p className="tl-copy">
            You reached the door with a crew of {hud.crew}. They&rsquo;re inside. The line resets —
            longer, faster, less patient.
          </p>
          <button
            type="button"
            className="tl-cta"
            onClick={() => {
              const s = stateRef.current;
              startRound(s.round + 1, { crew: s.crew, lives: s.lives, score: s.score, shots: s.shots });
            }}
          >
            Run round {hud.round + 2}
          </button>
        </div>
      )}

      {mode === 'report' && (
        <div className="tl-card">
          <p className="tl-kicker">{madeIt ? 'Shift complete' : 'The line won'}</p>
          <p className="tl-rank">{rank}</p>
          <p className="tl-copy">
            Final score {finalScore}
            {best !== null && finalScore >= best ? ' — a new best.' : best !== null ? ` · best ${best}` : ''}
          </p>
          <p className="tl-copy tl-dim">
            {madeIt
              ? 'Everyone you kept is inside. Nobody remembers the ones you lost at the ropes.'
              : 'The door stays a rumor tonight. The line, as ever, is undefeated.'}
          </p>
          <div className="tl-row">
            <button type="button" className="tl-cta" onClick={() => startRound(0)}>
              Run it back
            </button>
            <button type="button" className="tl-exit" onClick={onExit}>
              Slip back inside
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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
  flashes: { x: number; y: number; t: number; good: boolean; streak?: boolean }[];
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

type Rgb = [number, number, number];

/** Resolve any CSS color string to numeric RGB so the scene can mix its own
 *  shades (shadows, glows, glass, brass) from the theme tokens - still zero
 *  raw hex in this file. */
function toRgb(el: HTMLElement, color: string): Rgb {
  const prev = el.style.color;
  el.style.color = color;
  const m = getComputedStyle(el).color.match(/\d+(\.\d+)?/g);
  el.style.color = prev;
  const [r = 0, g = 0, b = 0] = (m ?? []).map(Number);
  return [r, g, b];
}

const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const cssRgb = (c: Rgb, alpha = 1) =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`;
const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];

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
      if (stored !== null) setBest(Math.round(Number(stored) || 0));
    } catch {
      // localStorage unavailable — best score simply hidden
    }
    reducedRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const endGame = useCallback((s: RunState, reachedDoor: boolean) => {
    const score = Math.round(s.score);
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
      if (!reducedRef.current) {
        s.flashes.push({ x: target.lane, y: target.z, t: 0.3, good: true });
        s.flashes.push({ x: target.lane, y: target.z, t: 0.22, good: true, streak: true });
      }
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

    // Numeric RGB for every token so the scene can mix its own shades.
    const RGB = {
      bg: toRgb(canvas, tokens.bg),
      surface: toRgb(canvas, tokens.surface),
      text: toRgb(canvas, tokens.text),
      muted: toRgb(canvas, tokens.muted),
      accent: toRgb(canvas, tokens.accent),
      good: toRgb(canvas, tokens.good),
      border: toRgb(canvas, tokens.border),
    };
    const brass = mixRgb(RGB.accent, WHITE, 0.45);
    const warm = mixRgb(RGB.accent, WHITE, 0.6);

    const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
    /** Perspective: everything converges toward the door as z grows. */
    const PINCH = 0.7;
    const depthAt = (z: number) => 1 - PINCH * clamp01(z / 34);
    const laneXAt = (lane: number, z: number) => {
      const bottom = cssW * (0.2 + lane * 0.3);
      return cssW / 2 + (bottom - cssW / 2) * depthAt(z);
    };
    const ropeXAt = (i: number, z: number) => {
      const bottom = cssW * (0.05 + i * 0.3);
      return cssW / 2 + (bottom - cssW / 2) * depthAt(z);
    };
    /** World z → screen y with a mild pseudo-depth squeeze. */
    const zToY = (z: number) => cssH * 0.82 - (z / 34) * cssH * 0.78;

    const roundRectPath = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };
    const groundShadow = (x: number, y: number, rx: number, ry: number, a: number) => {
      ctx.fillStyle = cssRgb(BLACK, a);
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    /** Readable label chip - dark pill, bright text, never below 10px. */
    const pill = (x: number, y: number, label: string, edge: Rgb, depth: number) => {
      const size = Math.max(10, Math.round(12 * Math.max(depth, 0.72)));
      ctx.font = `700 ${size}px ui-sans-serif, system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const w = ctx.measureText(label).width + 16;
      const h = size + 10;
      ctx.fillStyle = cssRgb(mixRgb(RGB.bg, BLACK, 0.45), 0.88);
      roundRectPath(x - w / 2, y - h / 2, w, h, h / 2);
      ctx.fill();
      ctx.strokeStyle = cssRgb(edge, 0.9);
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = cssRgb(mixRgb(RGB.text, WHITE, 0.2));
      ctx.fillText(label, x, y + 0.5);
    };
    /** A little silhouette person: head + shoulders, rimmed in light. */
    const figure = (x: number, feetY: number, h: number, fill: Rgb, rim: Rgb | null) => {
      const headR = h * 0.16;
      const shoulder = h * 0.34;
      ctx.fillStyle = cssRgb(fill);
      ctx.beginPath();
      ctx.moveTo(x - shoulder, feetY);
      ctx.quadraticCurveTo(x - shoulder, feetY - h * 0.62, x - headR * 1.1, feetY - h * 0.68);
      ctx.arc(x, feetY - h * 0.78, headR, Math.PI, 0);
      ctx.quadraticCurveTo(x + shoulder, feetY - h * 0.62, x + shoulder, feetY);
      ctx.closePath();
      ctx.fill();
      if (rim) {
        ctx.strokeStyle = cssRgb(rim, 0.7);
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    };

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

      // Night street: dark at the feet, a breath of warmth toward the door.
      const sky = ctx.createLinearGradient(0, 0, 0, cssH);
      sky.addColorStop(0, cssRgb(mixRgb(RGB.bg, RGB.accent, 0.12)));
      sky.addColorStop(0.35, cssRgb(RGB.bg));
      sky.addColorStop(1, cssRgb(mixRgb(RGB.bg, BLACK, 0.5)));
      ctx.fillStyle = sky;
      ctx.fillRect(-8, -8, cssW + 16, cssH + 16);

      const doorScale = Math.min(1, s.dist / len + 0.15);
      const doorX = cssW / 2;
      const doorTop = cssH * 0.025;
      const dw = 46 + 78 * doorScale;
      const dh = 30 + 44 * doorScale;

      // Light pooling out of the club and down the street.
      const pool = ctx.createRadialGradient(doorX, doorTop + dh, 6, doorX, doorTop + dh, cssH * 0.6);
      pool.addColorStop(0, cssRgb(warm, 0.1 + 0.16 * doorScale));
      pool.addColorStop(1, cssRgb(warm, 0));
      ctx.fillStyle = pool;
      ctx.fillRect(0, 0, cssW, cssH);

      // Dark building masses outside the ropes.
      for (const side of [0, 3] as const) {
        ctx.fillStyle = cssRgb(mixRgb(RGB.bg, BLACK, 0.4), 0.9);
        ctx.beginPath();
        const edgeX = side === 0 ? -8 : cssW + 8;
        ctx.moveTo(edgeX, zToY(-2));
        ctx.lineTo(ropeXAt(side, 0), zToY(0));
        ctx.lineTo(ropeXAt(side, 34), zToY(34));
        ctx.lineTo(edgeX, zToY(34));
        ctx.closePath();
        ctx.fill();
      }

      // The red carpet running the center lane to the door.
      ctx.fillStyle = cssRgb(RGB.accent, 0.09);
      ctx.beginPath();
      ctx.moveTo(doorX - dw * 0.3, doorTop + dh);
      ctx.lineTo(doorX + dw * 0.3, doorTop + dh);
      ctx.lineTo(laneXAt(1, 0) + cssW * 0.1, zToY(0) + 24);
      ctx.lineTo(laneXAt(1, 0) - cssW * 0.1, zToY(0) + 24);
      ctx.closePath();
      ctx.fill();

      // The door itself: warm doorway, awning, bouncer.
      ctx.fillStyle = cssRgb(mixRgb(RGB.bg, BLACK, 0.55));
      ctx.fillRect(doorX - dw / 2 - 5, doorTop - 3, dw + 10, dh + 6);
      const doorway = ctx.createLinearGradient(0, doorTop, 0, doorTop + dh);
      doorway.addColorStop(0, cssRgb(warm, 0.95));
      doorway.addColorStop(1, cssRgb(warm, 0.35));
      ctx.fillStyle = doorway;
      ctx.fillRect(doorX - dw / 2, doorTop, dw, dh);
      ctx.fillStyle = cssRgb(mixRgb(RGB.bg, BLACK, 0.5), 0.85);
      ctx.fillRect(doorX + dw * 0.08, doorTop, dw * 0.42, dh); // door panel, ajar
      ctx.fillStyle = cssRgb(brass);
      ctx.beginPath();
      ctx.arc(doorX + dw * 0.13, doorTop + dh * 0.55, Math.max(1.5, 2.4 * doorScale), 0, Math.PI * 2);
      ctx.fill();
      // Awning with scalloped edge.
      const awnH = 10 + 12 * doorScale;
      ctx.fillStyle = cssRgb(RGB.accent);
      ctx.beginPath();
      ctx.moveTo(doorX - dw * 0.8, doorTop - 2);
      ctx.lineTo(doorX - dw * 0.55, doorTop - awnH);
      ctx.lineTo(doorX + dw * 0.55, doorTop - awnH);
      ctx.lineTo(doorX + dw * 0.8, doorTop - 2);
      ctx.closePath();
      ctx.fill();
      const scallops = 5;
      for (let i = 0; i < scallops; i++) {
        const sx = doorX - dw * 0.8 + ((i + 0.5) * dw * 1.6) / scallops;
        ctx.beginPath();
        ctx.arc(sx, doorTop - 2, (dw * 1.6) / scallops / 2, 0, Math.PI);
        ctx.fill();
      }
      if (doorScale > 0.35) {
        ctx.fillStyle = cssRgb(WHITE, 0.92);
        ctx.font = `700 ${Math.max(8, Math.round(11 * doorScale))}px ui-sans-serif, system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('THE BACK ROOM', doorX, doorTop - awnH / 2 - 1);
      }
      // The bouncer, unimpressed, beside the door.
      figure(doorX + dw * 0.82, doorTop + dh + 2, dh * 0.68, mixRgb(RGB.bg, BLACK, 0.42), mixRgb(RGB.text, RGB.bg, 0.5));

      // Velvet ropes on brass stanchions, scrolling with the world.
      const postSpacing = 8;
      const phase = s.dist % postSpacing;
      for (let i = 0; i < 4; i++) {
        let prev: { x: number; y: number } | null = null;
        for (let pz = postSpacing - phase; pz <= 34; pz += postSpacing) {
          const d = depthAt(pz);
          const bx = ropeXAt(i, pz);
          const by = zToY(pz);
          const h = 17 * d;
          // post
          ctx.strokeStyle = cssRgb(mixRgb(RGB.text, RGB.bg, 0.55));
          ctx.lineWidth = Math.max(1, 2 * d);
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx, by - h);
          ctx.stroke();
          ctx.fillStyle = cssRgb(brass);
          ctx.beginPath();
          ctx.arc(bx, by - h, Math.max(1.4, 2.6 * d), 0, Math.PI * 2);
          ctx.fill();
          // rope back to the previous post, sagging
          if (prev) {
            const midD = depthAt(pz - postSpacing / 2);
            ctx.strokeStyle = cssRgb(RGB.accent, 0.16);
            ctx.lineWidth = Math.max(3, 7 * midD);
            ctx.beginPath();
            ctx.moveTo(prev.x, prev.y);
            ctx.quadraticCurveTo((prev.x + bx) / 2, (prev.y + by - h) / 2 + 9 * midD, bx, by - h);
            ctx.stroke();
            ctx.strokeStyle = cssRgb(mixRgb(RGB.accent, BLACK, 0.15), 0.9);
            ctx.lineWidth = Math.max(1.2, 2.6 * midD);
            ctx.stroke();
          }
          prev = { x: bx, y: by - h };
        }
      }

      // Entities, far to near so nearer things overdraw.
      for (const e of [...s.entities].sort((a, b) => b.z - a.z)) {
        const z = Math.max(e.z, -2);
        const y = zToY(z);
        const x = laneXAt(e.lane, z);
        const depth = Math.max(0.35, 1 - e.z / 40);
        if (e.kind === 'gate') {
          ctx.globalAlpha = e.used ? 0.22 : 1;
          const w = cssW * 0.26 * depth;
          const edge = e.good ? RGB.good : RGB.accent;
          const postH = 15 * depth;
          for (const gx of [x - w / 2, x + w / 2]) {
            ctx.strokeStyle = cssRgb(mixRgb(RGB.text, RGB.bg, 0.55));
            ctx.lineWidth = Math.max(1, 2 * depth);
            ctx.beginPath();
            ctx.moveTo(gx, y);
            ctx.lineTo(gx, y - postH);
            ctx.stroke();
            ctx.fillStyle = cssRgb(brass);
            ctx.beginPath();
            ctx.arc(gx, y - postH, Math.max(1.4, 2.4 * depth), 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.strokeStyle = cssRgb(mixRgb(RGB.accent, BLACK, 0.1), 0.9);
          ctx.lineWidth = Math.max(1.2, 2.4 * depth);
          ctx.beginPath();
          ctx.moveTo(x - w / 2, y - postH);
          ctx.quadraticCurveTo(x, y - postH + 8 * depth, x + w / 2, y - postH);
          ctx.stroke();
          ctx.save();
          ctx.shadowColor = cssRgb(edge, 0.8);
          ctx.shadowBlur = 12 * depth;
          // Plaques staggered per lane so paired gates never collide.
          pill(x, y - postH + 8 * depth + (Math.max(10, 12 * Math.max(depth, 0.72)) + 10) / 2 + 3 + e.lane * 13 * depth, e.label, edge, depth);
          ctx.restore();
          ctx.globalAlpha = 1;
        } else if (!e.cleared) {
          groundShadow(x, y + 3 * depth, 14 * depth, 3.6 * depth, 0.35);
          figure(x, y + 2 * depth, 30 * depth, mixRgb(RGB.bg, BLACK, 0.32), RGB.accent);
          // Chips staggered per lane so same-row neighbors never overlap.
          pill(x, y - (36 + e.lane * 15) * depth, e.label, mixRgb(RGB.accent, WHITE, 0.2), depth);
        }
      }

      // Player position (needed by streaks before the player draws).
      const px = cssW * (0.2 + s.playerX * 0.6);
      const py = cssH * 0.84;

      // Flashes: vibe streaks, then bursts with particles.
      for (const f of s.flashes) {
        const c = f.good ? RGB.good : RGB.accent;
        if (f.streak) {
          const pT = Math.max(0, f.t / 0.22);
          const tx = laneXAt(f.x, f.y);
          const ty = zToY(f.y);
          ctx.strokeStyle = cssRgb(mixRgb(c, WHITE, 0.4), pT * 0.9);
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(px, py - 14);
          ctx.lineTo(tx, ty);
          ctx.stroke();
          ctx.fillStyle = cssRgb(WHITE, pT);
          ctx.beginPath();
          ctx.arc(tx, ty, 3.5, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        const life = Math.max(0, f.t / 0.35);
        const pT = 1 - life;
        const fx = laneXAt(f.x, f.y);
        const fy = zToY(f.y);
        const burst = ctx.createRadialGradient(fx, fy, 1, fx, fy, 10 + 34 * pT);
        burst.addColorStop(0, cssRgb(mixRgb(c, WHITE, 0.5), life * 0.8));
        burst.addColorStop(1, cssRgb(c, 0));
        ctx.fillStyle = burst;
        ctx.beginPath();
        ctx.arc(fx, fy, 10 + 34 * pT, 0, Math.PI * 2);
        ctx.fill();
        for (let j = 0; j < 7; j++) {
          const ang = (j / 7) * Math.PI * 2 + f.x * 1.3;
          const dist = 6 + 40 * pT;
          ctx.fillStyle = cssRgb(mixRgb(c, WHITE, 0.35), life);
          ctx.beginPath();
          ctx.arc(fx + Math.cos(ang) * dist, fy + Math.sin(ang) * dist * 0.6, 3 * life + 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // The doorman (you) and the crew trailing behind.
      const glow = ctx.createRadialGradient(px, py + 8, 2, px, py + 8, 30);
      glow.addColorStop(0, cssRgb(RGB.accent, 0.28));
      glow.addColorStop(1, cssRgb(RGB.accent, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px, py + 8, 30, 0, Math.PI * 2);
      ctx.fill();
      groundShadow(px, py + 15, 18, 4.5, 0.4);
      const blink = s.iframes > 0 && Math.floor(now / 90) % 2 === 0;
      if (!blink) {
        figure(px, py + 14, 34, mixRgb(RGB.bg, WHITE, 0.3), mixRgb(RGB.text, WHITE, 0.1));
        // shirt + clipboard: the uniform of the door.
        ctx.fillStyle = cssRgb(WHITE, 0.85);
        ctx.beginPath();
        ctx.moveTo(px - 3.5, py - 9);
        ctx.lineTo(px + 3.5, py - 9);
        ctx.lineTo(px, py - 2);
        ctx.closePath();
        ctx.fill();
        ctx.save();
        ctx.translate(px + 11, py + 2);
        ctx.rotate(0.16);
        ctx.fillStyle = cssRgb(WHITE, 0.8);
        ctx.fillRect(-3.5, -5, 7, 10);
        ctx.strokeStyle = cssRgb(RGB.accent, 0.9);
        ctx.lineWidth = 1;
        ctx.strokeRect(-3.5, -5, 7, 10);
        ctx.restore();
      }
      for (let i = 0; i < Math.min(s.crew, 12); i++) {
        const bx = px + Math.sin(i * 2.4) * 20;
        const by = py + 18 + i * 7 + Math.sin(now / 280 + i * 1.7) * 1.6;
        figure(bx, by + 8, 16, mixRgb(RGB.text, RGB.bg, 0.45), null);
      }
      if (s.crew > 12) pill(px, py + 18 + 12 * 7 + 16, `+${s.crew - 12} MORE`, RGB.muted, 1);

      // Bottom vignette so the street sinks into the dark.
      const vig = ctx.createLinearGradient(0, cssH * 0.86, 0, cssH);
      vig.addColorStop(0, cssRgb(BLACK, 0));
      vig.addColorStop(1, cssRgb(BLACK, 0.42));
      ctx.fillStyle = vig;
      ctx.fillRect(0, cssH * 0.86, cssW, cssH * 0.14);
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

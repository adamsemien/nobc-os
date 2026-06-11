'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * LAST CALL — the door game. You work the door for one shift: 18 procedurally
 * generated guests over 3 rounds, each round adding a rule (members only →
 * plus-ones welcome → Red List in effect). Swipe right to let in, swipe left
 * to hold; arrow keys or the buttons on desktop. Entered from the Back Room
 * matchbook; rendered inside that overlay.
 *
 * Every guest is fake and generated on the client — no member data is read,
 * no network, no writes. High score only, in localStorage.
 */

const BEST_KEY = 'nobc-lastcall-best';

type Sfx = { pluck: () => void; buzz: () => void } | null;

interface Guest {
  name: string;
  initials: string;
  claim: string; // display string — canonical access language only
  flavor: string;
  shouldAdmit: boolean;
  redList: boolean;
}

interface RoundSpec {
  rule: string;
  redNames: string[];
  guests: Guest[];
  msPerGuest: number;
}

interface Tally {
  score: number;
  streak: number;
  bestStreak: number;
  admitted: number;
  held: number;
  correct: number;
  redMisses: number;
  timeouts: number;
}

const ZERO_TALLY: Tally = {
  score: 0,
  streak: 0,
  bestStreak: 0,
  admitted: 0,
  held: 0,
  correct: 0,
  redMisses: 0,
  timeouts: 0,
};

const FIRST_NAMES = [
  'Marcus', 'Dana', 'Priya', 'Jordan', 'Maya', 'Theo', 'Nina', 'Andre',
  'Sofia', 'Eli', 'Camille', 'Ray', 'Imani', 'Leo', 'June', 'Oscar',
  'Wren', 'Felix', 'Ada', 'Hugo', 'Zadie', 'Cole', 'Mira', 'Sam',
];
const LAST_INITIALS = 'ABCDEFGHJKLMNPRSTVW';

const FLAVORS = [
  'in a hurry',
  'says you know them',
  'won’t make eye contact',
  'tipped the last door',
  'asking for the manager',
  'humming the house playlist',
  'checking their phone',
  'brought a bottle — nice try',
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function makeName(exclude: Set<string>): string {
  for (let i = 0; i < 50; i++) {
    const name = `${pick(FIRST_NAMES)} ${LAST_INITIALS[Math.floor(Math.random() * LAST_INITIALS.length)]}.`;
    if (!exclude.has(name)) {
      exclude.add(name);
      return name;
    }
  }
  return `Guest ${Math.floor(Math.random() * 90 + 10)}`;
}

function initialsOf(name: string): string {
  const parts = name.split(' ');
  return `${parts[0]?.[0] ?? '?'}${parts[1]?.[0] ?? ''}`.toUpperCase();
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function guest(
  exclude: Set<string>,
  claim: (name: string, exclude: Set<string>) => string,
  shouldAdmit: boolean,
  redList = false,
  forcedName?: string,
): Guest {
  const name = forcedName ?? makeName(exclude);
  return {
    name,
    initials: initialsOf(name),
    claim: claim(name, exclude),
    flavor: pick(FLAVORS),
    shouldAdmit,
    redList,
  };
}

const asMember = () => 'Member';
const asGuestAccess = () => 'Guest Access';
const asCompAccess = () => 'Comp Access';
const asPlusOne = (_: string, exclude: Set<string>) => `Plus-one of ${makeName(exclude)}`;

function buildRounds(): RoundSpec[] {
  const used = new Set<string>();

  // Round 1 — members only.
  const r1 = shuffle([
    guest(used, asMember, true),
    guest(used, asMember, true),
    guest(used, asMember, true),
    guest(used, asMember, true),
    guest(used, asGuestAccess, false),
    guest(used, asCompAccess, false),
  ]);

  // Round 2 — plus-ones welcome; comp list closed.
  const r2 = shuffle([
    guest(used, asMember, true),
    guest(used, asMember, true),
    guest(used, asPlusOne, true),
    guest(used, asPlusOne, true),
    guest(used, asGuestAccess, false),
    guest(used, asCompAccess, false),
  ]);

  // Round 3 — comps reopen, but two names never make it in.
  const redNames = [makeName(used), makeName(used)];
  const r3 = shuffle([
    guest(used, asMember, false, true, redNames[0]),
    guest(used, asCompAccess, false, true, redNames[1]),
    guest(used, asMember, true),
    guest(used, asPlusOne, true),
    guest(used, asCompAccess, true),
    guest(used, asCompAccess, true),
  ]);

  return [
    { rule: 'Members only. Everyone else waits.', redNames: [], guests: r1, msPerGuest: 4000 },
    { rule: 'Plus-ones welcome tonight. The comp list is closed.', redNames: [], guests: r2, msPerGuest: 3200 },
    { rule: 'Comp Access reopens. Two names never make it in:', redNames, guests: r3, msPerGuest: 2700 },
  ];
}

function verdictFor(t: Tally): string {
  if (t.correct >= 16) return 'The door is in good hands. Same time tomorrow.';
  if (t.correct >= 12) return 'Tight enough. Watch the comp line.';
  if (t.correct >= 8) return 'The room noticed. The room remembers.';
  return 'We found your name on the schedule. We crossed it out.';
}

export function LastCallGame({ sfx, onExit }: { sfx: Sfx; onExit: () => void }) {
  const [rounds, setRounds] = useState<RoundSpec[]>(buildRounds);
  const [mode, setMode] = useState<'briefing' | 'guest' | 'report'>('briefing');
  const [roundIdx, setRoundIdx] = useState(0);
  const [guestIdx, setGuestIdx] = useState(0);
  const [tally, setTally] = useState<Tally>(ZERO_TALLY);
  const [best, setBest] = useState<number | null>(null);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [outcome, setOutcome] = useState<'in' | 'out' | null>(null);
  const [announce, setAnnounce] = useState('');

  const round = rounds[roundIdx];
  const current = round.guests[guestIdx];
  const guestNumber = roundIdx * 6 + guestIdx + 1;

  const timerFillRef = useRef<HTMLDivElement | null>(null);
  const resolvedRef = useRef(false);
  const rafRef = useRef(0);
  const advanceRef = useRef(0);
  const dragStartRef = useRef(0);
  const tallyRef = useRef<Tally>(tally);
  tallyRef.current = tally;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(BEST_KEY);
      if (stored !== null) setBest(Number(stored) || 0);
    } catch {
      // localStorage unavailable — best score simply hidden
    }
  }, []);

  const advance = useCallback(() => {
    setOutcome(null);
    setDrag(0);
    resolvedRef.current = false;
    if (guestIdx + 1 < round.guests.length) {
      setGuestIdx((i) => i + 1);
    } else if (roundIdx + 1 < rounds.length) {
      setRoundIdx((r) => r + 1);
      setGuestIdx(0);
      setMode('briefing');
    } else {
      setMode('report');
      const score = tallyRef.current.score;
      try {
        const stored = Number(localStorage.getItem(BEST_KEY)) || 0;
        if (score > stored) localStorage.setItem(BEST_KEY, String(score));
        setBest(Math.max(score, stored));
      } catch {
        // best score not persisted — fine
      }
    }
  }, [guestIdx, roundIdx, round.guests.length, rounds.length]);

  const resolve = useCallback(
    (action: 'admit' | 'hold' | null) => {
      if (resolvedRef.current || !current) return;
      resolvedRef.current = true;
      cancelAnimationFrame(rafRef.current);

      const correct = action !== null && (action === 'admit') === current.shouldAdmit;
      if (correct) sfx?.pluck();
      else sfx?.buzz();

      setTally((t) => {
        const streak = correct ? t.streak + 1 : 0;
        return {
          score: t.score + (correct ? 100 + (streak >= 3 ? streak * 20 : 0) : 0),
          streak,
          bestStreak: Math.max(t.bestStreak, streak),
          admitted: t.admitted + (action === 'admit' ? 1 : 0),
          held: t.held + (action === 'hold' ? 1 : 0),
          correct: t.correct + (correct ? 1 : 0),
          redMisses: t.redMisses + (action === 'admit' && current.redList ? 1 : 0),
          timeouts: t.timeouts + (action === null ? 1 : 0),
        };
      });

      setOutcome(action === 'admit' ? 'in' : 'out');
      setAnnounce(
        action === null
          ? `Too slow — ${current.name} walked.`
          : `${current.name} ${action === 'admit' ? 'let in' : 'held'} — ${correct ? 'right call' : 'wrong call'}.`,
      );
      advanceRef.current = window.setTimeout(advance, 420);
    },
    [current, sfx, advance],
  );

  // Per-guest countdown — drives the timer bar, times out as a wrong call.
  useEffect(() => {
    if (mode !== 'guest') return;
    const started = performance.now();
    const duration = round.msPerGuest;
    const tick = () => {
      const remaining = 1 - (performance.now() - started) / duration;
      if (timerFillRef.current) {
        timerFillRef.current.style.transform = `scaleX(${Math.max(0, remaining).toFixed(3)})`;
      }
      if (remaining <= 0) {
        resolve(null);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [mode, roundIdx, guestIdx, round.msPerGuest, resolve]);

  useEffect(() => () => window.clearTimeout(advanceRef.current), []);

  // Desktop: arrow keys make the call.
  useEffect(() => {
    if (mode !== 'guest') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') resolve('admit');
      else if (e.key === 'ArrowLeft') resolve('hold');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, resolve]);

  const restart = useCallback(() => {
    setRounds(buildRounds());
    setTally(ZERO_TALLY);
    setRoundIdx(0);
    setGuestIdx(0);
    setOutcome(null);
    setDrag(0);
    resolvedRef.current = false;
    setMode('briefing');
  }, []);

  const cardClass = [
    'lc-guest',
    dragging ? 'lc-dragging' : 'lc-settle',
    outcome === 'in' ? 'lc-fly-right' : '',
    outcome === 'out' ? 'lc-fly-left' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="lc-stage">
      <span aria-live="polite" className="sr-only">
        {announce}
      </span>

      <div className="lc-topbar">
        <span>Guest {Math.min(guestNumber, 18)} / 18</span>
        <span>
          Score {tally.score}
          {tally.streak >= 3 ? ` · streak ×${tally.streak}` : ''}
        </span>
      </div>

      {mode === 'briefing' && (
        <div className="lc-brief">
          <p
            className="text-[10px] font-semibold uppercase"
            style={{ color: 'var(--text-muted)', letterSpacing: '0.32em' }}
          >
            Round {roundIdx + 1} of 3 &middot; tonight&rsquo;s door
          </p>
          <h3
            className="br-title mt-2"
            style={{
              fontFamily: "var(--font-display, 'PP Editorial New', Georgia, serif)",
              fontStyle: 'italic',
              color: 'var(--text-primary)',
            }}
          >
            Last Call
          </h3>
          <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {round.rule}
          </p>
          {round.redNames.length > 0 && (
            <p className="mt-2 text-base font-semibold" style={{ color: 'var(--primary)' }}>
              {round.redNames.join(' · ')}
            </p>
          )}
          <p className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            Swipe right to let in, left to hold. Arrows or buttons work too. Hesitate and they
            decide for you.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => {
                resolvedRef.current = false;
                setMode('guest');
              }}
              className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}
            >
              Open the doors
            </button>
            <button
              type="button"
              onClick={onExit}
              className="text-sm underline-offset-4 transition-colors hover:underline"
              style={{ color: 'var(--text-secondary)' }}
            >
              Back to the room
            </button>
          </div>
        </div>
      )}

      {mode === 'guest' && current && (
        <>
          <div
            key={`${roundIdx}-${guestIdx}`}
            className={cardClass}
            style={
              outcome === null
                ? { transform: `translateX(${drag}px) rotate(${(drag * 0.06).toFixed(2)}deg)` }
                : undefined
            }
            onPointerDown={(e) => {
              if (outcome !== null) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              dragStartRef.current = e.clientX;
              setDragging(true);
            }}
            onPointerMove={(e) => {
              if (!dragging || outcome !== null) return;
              setDrag(e.clientX - dragStartRef.current);
            }}
            onPointerUp={() => {
              if (!dragging) return;
              setDragging(false);
              if (Math.abs(drag) > 90) resolve(drag > 0 ? 'admit' : 'hold');
              else setDrag(0);
            }}
            onPointerCancel={() => {
              setDragging(false);
              setDrag(0);
            }}
          >
            <span
              className="lc-stamp lc-stamp-in"
              style={{ opacity: outcome === 'in' ? 1 : Math.min(1, Math.max(0, drag) / 90) }}
              aria-hidden
            >
              Let in
            </span>
            <span
              className="lc-stamp lc-stamp-out"
              style={{ opacity: outcome === 'out' ? 1 : Math.min(1, Math.max(0, -drag) / 90) }}
              aria-hidden
            >
              Held
            </span>

            <div className="lc-avatar" aria-hidden>
              {current.initials}
            </div>
            <h3 className="mt-3 text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              {current.name}
            </h3>
            <span className="lc-claim">{current.claim}</span>
            <p className="mt-2 text-xs italic" style={{ color: 'var(--text-muted)' }}>
              {current.flavor}
            </p>
          </div>

          <div className="lc-timer" aria-hidden>
            <div ref={timerFillRef} />
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => resolve('hold')}
              aria-label={`Hold ${current.name} at the door`}
              className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}
            >
              &#10007; Hold
            </button>
            <button
              type="button"
              onClick={() => resolve('admit')}
              aria-label={`Let ${current.name} in`}
              className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}
            >
              &#10003; Let in
            </button>
          </div>
          <button
            type="button"
            onClick={onExit}
            className="text-xs underline-offset-4 transition-colors hover:underline"
            style={{ color: 'var(--text-muted)' }}
          >
            Leave the door
          </button>
        </>
      )}

      {mode === 'report' && (
        <div className="lc-brief">
          <p
            className="text-[10px] font-semibold uppercase"
            style={{ color: 'var(--text-muted)', letterSpacing: '0.32em' }}
          >
            Shift report
          </p>
          <h3
            className="br-title mt-2"
            style={{
              fontFamily: "var(--font-display, 'PP Editorial New', Georgia, serif)",
              fontStyle: 'italic',
              color: 'var(--text-primary)',
            }}
          >
            {tally.score} points
          </h3>
          <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
            You let in {tally.admitted}, held {tally.held}
            {tally.timeouts > 0 ? `, froze on ${tally.timeouts}` : ''}. {tally.correct} of 18
            calls were right{tally.bestStreak >= 3 ? ` — best streak ${tally.bestStreak}` : ''}.
          </p>
          {tally.redMisses > 0 && (
            <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--primary)' }}>
              {tally.redMisses} from the Red List got past you.
            </p>
          )}
          <p className="mt-3 text-sm italic" style={{ color: 'var(--text-primary)' }}>
            {verdictFor(tally)}
          </p>
          {best !== null && (
            <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              Best shift on this door: {Math.max(best, tally.score)}
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              onClick={restart}
              className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}
            >
              Run it back
            </button>
            <button
              type="button"
              onClick={onExit}
              className="text-sm underline-offset-4 transition-colors hover:underline"
              style={{ color: 'var(--text-secondary)' }}
            >
              Back to the room
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

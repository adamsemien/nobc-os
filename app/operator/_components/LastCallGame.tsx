'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * LAST CALL — the door game. You work the door for one shift: 18 guests over
 * 3 rounds, each round adding a rule (members only → plus-ones welcome →
 * Blocked List in effect). Swipe right to let in, swipe left to hold; arrow
 * keys or the buttons on desktop. Entered from the Back Room matchbook.
 *
 * The guests are YOUR ROOM: drawn live from the workspace roster (the same
 * operator-authed GET /api/operator/members the Members page reads), with the
 * final round briefing real Blocked List (WatchList BLOCKED) names and flavor
 * lines from real attendance history. Display-only: nothing is written, nothing leaves
 * the operator surface, sponsor firewall untouched. High score only, in
 * localStorage. If the roster is too small or unreachable, the door falls
 * back to procedurally generated rehearsal stock.
 */

const BEST_KEY = 'nobc-lastcall-best';

type Sfx = { pluck: () => void; buzz: () => void } | null;

interface Guest {
  name: string;
  initials: string;
  claim: string; // display string — canonical access language only
  flavor: string;
  shouldAdmit: boolean;
  blocked: boolean;
}

interface RoundSpec {
  rule: string;
  blockedNames: string[];
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
  blockedMisses: number;
  timeouts: number;
  strikes: number;
  served: number;
}

const ZERO_TALLY: Tally = {
  score: 0,
  streak: 0,
  bestStreak: 0,
  admitted: 0,
  held: 0,
  correct: 0,
  blockedMisses: 0,
  timeouts: 0,
  strikes: 0,
  served: 0,
};

/** Three wrong calls and the manager pulls you. A Blocked List admit costs two. */
const STRIKES_MAX = 3;
const PERFECT_BONUS = 500;

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
  blocked = false,
  forcedName?: string,
): Guest {
  const name = forcedName ?? makeName(exclude);
  return {
    name,
    initials: initialsOf(name),
    claim: claim(name, exclude),
    flavor: pick(FLAVORS),
    shouldAdmit,
    blocked,
  };
}

const asMember = () => 'Member';
const asGuestAccess = () => 'Guest Access';
const asCompAccess = () => 'Comp Access';
const asPlusOne = (_: string, exclude: Set<string>) => `Plus-one of ${makeName(exclude)}`;

/** A row from GET /api/operator/members — only the fields the door reads. */
interface RosterPerson {
  fullName: string;
  totalEventsAttended?: number | null;
  companyName?: string | null;
  isVip?: boolean;
  isBlocked?: boolean;
}

const MIN_REAL_POOL = 8;

function realFlavor(p: RosterPerson): string {
  const attended = p.totalEventsAttended ?? 0;
  if (p.isVip) return 'Purple List — house VIP';
  if (attended >= 1) return `${attended} event${attended === 1 ? '' : 's'} on the book`;
  if (p.companyName) return `from ${p.companyName}`;
  return pick(FLAVORS);
}

function realGuest(p: RosterPerson, claim: string, shouldAdmit: boolean, blocked = false): Guest {
  return {
    name: p.fullName,
    initials: initialsOf(p.fullName),
    claim,
    flavor: realFlavor(p),
    shouldAdmit,
    blocked,
  };
}

/** Build the shift from the actual workspace roster. Same rules and claim mix
 *  as the rehearsal path — but every face is someone from your room, and the
 *  final round uses your real Blocked List names when you have them. */
function buildRoundsFromPool(pool: RosterPerson[]): RoundSpec[] {
  const eligible = shuffle(pool.filter((p) => !p.isBlocked && p.fullName.trim()));
  let cursor = 0;
  const next = (): RosterPerson => {
    const p = eligible[cursor % eligible.length];
    cursor += 1;
    return p;
  };
  const plusOneOf = () => `Plus-one of ${next().fullName}`;

  const r1 = shuffle([
    realGuest(next(), 'Member', true),
    realGuest(next(), 'Member', true),
    realGuest(next(), 'Member', true),
    realGuest(next(), 'Member', true),
    realGuest(next(), 'Guest Access', false),
    realGuest(next(), 'Comp Access', false),
  ]);

  const r2 = shuffle([
    realGuest(next(), 'Member', true),
    realGuest(next(), 'Member', true),
    realGuest(next(), plusOneOf(), true),
    realGuest(next(), plusOneOf(), true),
    realGuest(next(), 'Guest Access', false),
    realGuest(next(), 'Comp Access', false),
  ]);

  // Real Blocked List first; if the workspace has fewer than two BLOCKED
  // names, tonight's briefing designates real members to fill the list (still
  // fair — the briefing shows the names either way).
  const barred = shuffle(pool.filter((p) => p.isBlocked && p.fullName.trim())).slice(0, 2);
  while (barred.length < 2) barred.push(next());
  const blockedNames = barred.map((p) => p.fullName);

  const r3 = shuffle([
    realGuest(barred[0], 'Member', false, true),
    realGuest(barred[1], 'Comp Access', false, true),
    realGuest(next(), 'Member', true),
    realGuest(next(), plusOneOf(), true),
    realGuest(next(), 'Comp Access', true),
    realGuest(next(), 'Comp Access', true),
  ]);

  return [
    { rule: 'Members only. Everyone else waits.', blockedNames: [], guests: r1, msPerGuest: 4000 },
    { rule: 'Plus-ones welcome tonight. The comp list is closed.', blockedNames: [], guests: r2, msPerGuest: 3200 },
    { rule: 'Comp Access reopens. Two names never make it in:', blockedNames, guests: r3, msPerGuest: 2700 },
  ];
}

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
  const blockedNames = [makeName(used), makeName(used)];
  const r3 = shuffle([
    guest(used, asMember, false, true, blockedNames[0]),
    guest(used, asCompAccess, false, true, blockedNames[1]),
    guest(used, asMember, true),
    guest(used, asPlusOne, true),
    guest(used, asCompAccess, true),
    guest(used, asCompAccess, true),
  ]);

  return [
    { rule: 'Members only. Everyone else waits.', blockedNames: [], guests: r1, msPerGuest: 4000 },
    { rule: 'Plus-ones welcome tonight. The comp list is closed.', blockedNames: [], guests: r2, msPerGuest: 3200 },
    { rule: 'Comp Access reopens. Two names never make it in:', blockedNames, guests: r3, msPerGuest: 2700 },
  ];
}

function verdictFor(t: Tally, lost: boolean): string {
  if (lost) return 'The manager saw that. We found your name on the schedule — we crossed it out.';
  if (t.correct === 18) return 'Flawless. The Back Room keeps your name.';
  if (t.correct >= 15) return 'The door is in good hands. Same time tomorrow.';
  if (t.correct >= 12) return 'Tight enough. Watch the comp line.';
  return 'You survived. The room noticed.';
}

export function LastCallGame({ sfx, onExit }: { sfx: Sfx; onExit: () => void }) {
  const [rounds, setRounds] = useState<RoundSpec[]>(buildRounds);
  const [mode, setMode] = useState<'loading' | 'briefing' | 'guest' | 'report'>('loading');
  const [realCount, setRealCount] = useState<number | null>(null);
  const poolRef = useRef<RosterPerson[] | null>(null);
  const [roundIdx, setRoundIdx] = useState(0);
  const [guestIdx, setGuestIdx] = useState(0);
  const [tally, setTally] = useState<Tally>(ZERO_TALLY);
  const [best, setBest] = useState<number | null>(null);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [outcome, setOutcome] = useState<'in' | 'out' | null>(null);
  const [announce, setAnnounce] = useState('');
  const [endedEarly, setEndedEarly] = useState(false);

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

  // Pull tonight's list — the real workspace roster. Falls back to rehearsal
  // stock if the room is too small or the fetch fails (the door stays open).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/operator/members');
        if (!res.ok) throw new Error(`roster fetch ${res.status}`);
        const data = (await res.json()) as { members?: RosterPerson[] };
        const pool = (data.members ?? []).filter((m) => m.fullName?.trim());
        if (!cancelled && pool.filter((p) => !p.isBlocked).length >= MIN_REAL_POOL) {
          poolRef.current = pool;
          setRounds(buildRoundsFromPool(pool));
          setRealCount(pool.length);
        }
      } catch (err) {
        console.warn('[last-call] roster unavailable — rehearsal stock tonight', err);
      } finally {
        if (!cancelled) setMode('briefing');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const advance = useCallback(() => {
    setOutcome(null);
    setDrag(0);
    resolvedRef.current = false;
    if (tallyRef.current.strikes >= STRIKES_MAX) {
      setEndedEarly(true);
      setMode('report'); // the manager pulls you mid-shift
    } else if (guestIdx + 1 < round.guests.length) {
      setGuestIdx((i) => i + 1);
    } else if (roundIdx + 1 < rounds.length) {
      setRoundIdx((r) => r + 1);
      setGuestIdx(0);
      setMode('briefing');
    } else {
      setMode('report');
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

      const blockedMiss = action === 'admit' && current.blocked;
      setTally((t) => {
        const streak = correct ? t.streak + 1 : 0;
        return {
          score: t.score + (correct ? 100 + (streak >= 3 ? streak * 20 : 0) : 0),
          streak,
          bestStreak: Math.max(t.bestStreak, streak),
          admitted: t.admitted + (action === 'admit' ? 1 : 0),
          held: t.held + (action === 'hold' ? 1 : 0),
          correct: t.correct + (correct ? 1 : 0),
          blockedMisses: t.blockedMisses + (blockedMiss ? 1 : 0),
          timeouts: t.timeouts + (action === null ? 1 : 0),
          strikes: t.strikes + (correct ? 0 : blockedMiss ? 2 : 1),
          served: t.served + 1,
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
    setRounds(poolRef.current ? buildRoundsFromPool(poolRef.current) : buildRounds());
    setTally(ZERO_TALLY);
    setRoundIdx(0);
    setGuestIdx(0);
    setOutcome(null);
    setDrag(0);
    setEndedEarly(false);
    resolvedRef.current = false;
    setMode('briefing');
  }, []);

  // Shift over — bank the score. A perfect 18/18 earns the house bonus.
  const finalScore = tally.score + (tally.correct === 18 ? PERFECT_BONUS : 0);
  useEffect(() => {
    if (mode !== 'report') return;
    try {
      const stored = Number(localStorage.getItem(BEST_KEY)) || 0;
      if (finalScore > stored) localStorage.setItem(BEST_KEY, String(finalScore));
      setBest(Math.max(finalScore, stored));
    } catch {
      // best score not persisted — fine
    }
  }, [mode, finalScore]);

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
        <span aria-label={`${tally.strikes} of ${STRIKES_MAX} strikes`}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              aria-hidden
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                marginLeft: i === 0 ? 0 : 5,
                background: i < tally.strikes ? 'var(--primary)' : 'transparent',
                border: '1px solid var(--border-strong)',
              }}
            />
          ))}
        </span>
        <span>
          Score {tally.score}
          {tally.streak >= 3 ? ` · streak ×${tally.streak}` : ''}
        </span>
      </div>

      {mode === 'loading' && (
        <div className="lc-brief">
          <p
            className="text-[10px] font-semibold uppercase"
            style={{ color: 'var(--text-muted)', letterSpacing: '0.32em' }}
          >
            Pulling tonight&rsquo;s list&hellip;
          </p>
        </div>
      )}

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
          {roundIdx === 0 && (
            <p className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              {realCount !== null
                ? `Tonight's list is your room — ${realCount} names from the book.`
                : 'Rehearsal stock tonight — the book was light.'}
            </p>
          )}
          <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {round.rule}
          </p>
          {round.blockedNames.length > 0 && (
            <p className="mt-2 text-base font-semibold" style={{ color: 'var(--primary)' }}>
              {round.blockedNames.join(' · ')}
            </p>
          )}
          <p className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            Swipe right to let in, left to hold. Arrows or buttons work too. Hesitate and they
            decide for you.{' '}
            <strong style={{ color: 'var(--text-secondary)' }}>
              Three wrong calls and the manager pulls you off the door.
            </strong>
            {round.blockedNames.length > 0 ? ' A Blocked List name getting past you costs two.' : ''}
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
            style={{
              color: endedEarly ? 'var(--primary)' : 'var(--text-muted)',
              letterSpacing: '0.32em',
            }}
          >
            {endedEarly ? 'Shift ended early' : 'Shift cleared'}
          </p>
          <h3
            className="br-title mt-2"
            style={{
              fontFamily: "var(--font-display, 'PP Editorial New', Georgia, serif)",
              fontStyle: 'italic',
              color: 'var(--text-primary)',
            }}
          >
            {finalScore} points
          </h3>
          <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {endedEarly ? `The manager pulled you at guest ${tally.served} of 18. ` : ''}
            You let in {tally.admitted}, held {tally.held}
            {tally.timeouts > 0 ? `, froze on ${tally.timeouts}` : ''}. {tally.correct} of{' '}
            {tally.served} calls were right
            {tally.bestStreak >= 3 ? ` — best streak ${tally.bestStreak}` : ''}.
          </p>
          {tally.correct === 18 && (
            <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--success)' }}>
              Perfect shift — the house adds {PERFECT_BONUS}.
            </p>
          )}
          {tally.blockedMisses > 0 && (
            <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--primary)' }}>
              {tally.blockedMisses} from the Blocked List got past you.
            </p>
          )}
          <p className="mt-3 text-sm italic" style={{ color: 'var(--text-primary)' }}>
            {verdictFor(tally, endedEarly)}
          </p>
          {best !== null && (
            <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              Best shift on this door: {Math.max(best, finalScore)}
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

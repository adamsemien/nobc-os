'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import type { ThemeId } from '@/lib/theme';
import { useTheme } from './ThemeToggle';
import { LastCallGame } from './LastCallGame';
import { TheLineGame } from './TheLineGame';

/**
 * THE BACK ROOM — type the secret knock ("knockknock", spaces allowed) anywhere
 * in the operator tool, outside a text field, and the platform answers: the room
 * shudders, a speakeasy door appears, a peephole slides open, someone checks the
 * list — and the door swings into a private after-hours room with a spinning
 * record you can flip: click it to cycle four procedurally generated sides —
 * the house lo-fi walk, deep house, a cantina bodega bounce, and a slow jam
 * (pure WebAudio, no files). "Kill the lights" drops the dashboard into Darkroom.
 *
 * Entirely client-side and self-contained: no network, no data access; the only
 * persistence is two localStorage keys — the shared theme key and the chosen
 * record side. Sibling of the other layout-mounted eggs (Obsidian idle, AIM,
 * MySpace, Konami-in-Void).
 */

const KNOCK = 'knockknock';
const DOOR_MS = 4300;

type Phase = 'closed' | 'door' | 'room' | 'game' | 'theline' | 'lightsout';

type BackRoomAudio = {
  knock: () => void;
  startRecord: (initial?: number) => void;
  setTrack: (i: number) => void;
  click: () => void;
  pluck: () => void;
  buzz: () => void;
  setMuted: (muted: boolean) => void;
  dispose: () => void;
};

/**
 * The four sides on the record. The default (index 0) is the room's original
 * lo-fi walking bass, so the door always opens to its signature sound; clicking
 * the vinyl flips through deep house, a cantina bodega bounce, and a slow jam.
 * Each side is fully procedural — a bass line plus a kick (reused door thud) and
 * a brushed hat, shaped per-track by tempo, filter cutoff, waveform, and swing.
 *   - bass:     one frequency per quarter-note beat (the line loops)
 *   - kick/hat: 0|1 per beat, indexed step % bass.length (kick on the beat, hat
 *               on the offbeat); swing pushes the hat late for a shuffled feel
 *   - top/bot:  the two lines printed on the spinning label; name feeds aria
 */
type Track = {
  top: string;
  bot: string;
  name: string;
  bass: number[];
  quarter: number; // seconds per beat
  cutoff: number; // bass lowpass, Hz
  wave: OscillatorType;
  noteGain: number; // bass note peak gain
  kick: number[]; // 0|1 per beat
  hat: number[]; // 0|1 per beat (offbeat brush)
  swing: number; // 0..0.2 — fraction the offbeat hat is pushed late
};

const TRACKS: Track[] = [
  {
    // Side A — the original: D-minor walk, Dm / Gm / Am / Dm turnaround.
    top: 'NBC',
    bot: '33⅓',
    name: 'the house lo-fi walk',
    bass: [
      73.42, 87.31, 110, 87.31, // D2 F2 A2 F2
      98, 116.54, 146.83, 116.54, // G2 Bb2 D3 Bb2
      110, 130.81, 164.81, 130.81, // A2 C3 E3 C3
      73.42, 110, 87.31, 82.41, // D2 A2 F2 E2
    ],
    quarter: 0.66, // ~91bpm
    cutoff: 260,
    wave: 'triangle',
    noteGain: 0.16,
    kick: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // no kick — just bass + brush
    hat: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1], // brush on the offbeats
    swing: 0,
  },
  {
    // Side B — deep house: four-on-the-floor, Am F C G, filtered saw bass.
    top: 'DEEP',
    bot: 'HOUSE',
    name: 'deep house, four on the floor',
    bass: [
      110, 110, 82.41, 110, // A2 A2 E2 A2
      87.31, 87.31, 130.81, 110, // F2 F2 C3 A2
      130.81, 130.81, 98, 164.81, // C3 C3 G2 E3
      98, 98, 146.83, 123.47, // G2 G2 D3 B2
    ],
    quarter: 0.48, // ~124bpm
    cutoff: 520,
    wave: 'sawtooth',
    noteGain: 0.13,
    kick: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // four on the floor
    hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // open hat every offbeat
    swing: 0,
  },
  {
    // Side C — cantina bodega: bouncy swung oom-pah, reedy square, bluesy turn.
    top: 'CANTINA',
    bot: 'BODEGA',
    name: 'the cantina bodega bounce',
    bass: [
      130.81, 98, 130.81, 98, // C3 G2 C3 G2
      87.31, 130.81, 87.31, 130.81, // F2 C3 F2 C3
      98, 146.83, 98, 123.47, // G2 D3 G2 B2
      130.81, 164.81, 98, 116.54, // C3 E3 G2 Bb2 (bluesy turn)
    ],
    quarter: 0.54, // ~111bpm
    cutoff: 900,
    wave: 'square',
    noteGain: 0.11,
    kick: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], // oom on the downbeats
    hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // swung shaker
    swing: 0.12,
  },
  {
    // Side D — slow jam: laid-back R&B, Dm7 Gm7 Bb A7, round triangle sub.
    top: 'SLOW',
    bot: 'JAM',
    name: 'an after-hours slow jam',
    bass: [
      73.42, 110, 87.31, 130.81, // D2 A2 F2 C3 (Dm7)
      98, 146.83, 116.54, 110, // G2 D3 Bb2 A2 (Gm7)
      116.54, 87.31, 116.54, 110, // Bb2 F2 Bb2 A2 (Bb)
      110, 164.81, 138.59, 110, // A2 E3 C#3 A2 (A7)
    ],
    quarter: 0.84, // ~71bpm
    cutoff: 190,
    wave: 'triangle',
    noteGain: 0.17,
    kick: [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1], // beats 1 & 4
    hat: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1], // brushed backbeat
    swing: 0.08,
  },
];

const TRACK_KEY = 'nobc-backroom-track';

/** Read the saved side index, clamped to a real track; defaults to 0 (Side A). */
const readSavedTrack = (): number => {
  try {
    const v = Number(window.localStorage.getItem(TRACK_KEY));
    return Number.isInteger(v) && v >= 0 && v < TRACKS.length ? v : 0;
  } catch {
    return 0;
  }
};

/** Procedural speakeasy audio: two door thuds, looping vinyl crackle, a walking
 *  bass line in D minor with brushed offbeats, and a light-switch click. */
function createBackRoomAudio(): BackRoomAudio | null {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);

    let recordTimer: number | null = null;
    let crackle: AudioBufferSourceNode | null = null;
    let nextNoteAt = 0;
    let step = 0;
    let track: Track = TRACKS[0]; // the side currently spinning

    // Doubles as the door knock (peak 0.22) and the groove kick (peak ~0.16).
    const thud = (at: number, peak = 0.22) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(86, at);
      osc.frequency.exponentialRampToValueAtTime(44, at + 0.13);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.24);
      osc.connect(gain).connect(master);
      osc.start(at);
      osc.stop(at + 0.26);
    };

    const knock = () => {
      void ctx.resume();
      thud(ctx.currentTime + 0.02);
      thud(ctx.currentTime + 0.28);
    };

    const makeCrackle = () => {
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.012; // hiss bed
        if (Math.random() < 0.0007) data[i] = (Math.random() * 2 - 1) * 0.55; // dust pops
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1200;
      const gain = ctx.createGain();
      gain.gain.value = 0.05;
      src.connect(hp).connect(gain).connect(master);
      src.start();
      return src;
    };

    // Bass voice — waveform, filter cutoff, gain, and length all read live from
    // the current track, so a side-flip is heard on the very next note.
    const note = (freq: number, at: number) => {
      const osc = ctx.createOscillator();
      const lp = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = track.wave;
      osc.frequency.value = freq;
      osc.detune.value = (Math.random() - 0.5) * 8; // human
      lp.type = 'lowpass';
      lp.frequency.value = track.cutoff;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(track.noteGain, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + track.quarter * 0.82);
      osc.connect(lp).connect(gain).connect(master);
      osc.start(at);
      osc.stop(at + track.quarter);
    };

    const brush = (at: number) => {
      const len = Math.floor(ctx.sampleRate * 0.05);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 5000;
      const gain = ctx.createGain();
      gain.gain.value = 0.018;
      src.connect(hp).connect(gain).connect(master);
      src.start(at);
    };

    const startRecord = (initial = 0) => {
      void ctx.resume();
      track = TRACKS[initial % TRACKS.length] ?? TRACKS[0];
      step = 0;
      if (!crackle) crackle = makeCrackle();
      if (recordTimer !== null) return;
      nextNoteAt = ctx.currentTime + 0.12;
      recordTimer = window.setInterval(() => {
        const t = track; // stable for this tick; a flip lands on the next one
        while (nextNoteAt < ctx.currentTime + 0.45) {
          const i = step % t.bass.length;
          note(t.bass[i], nextNoteAt + (Math.random() - 0.5) * 0.018);
          if (t.kick[i]) thud(nextNoteAt, 0.16);
          if (t.hat[i]) brush(nextNoteAt + t.quarter * (0.5 + t.swing));
          nextNoteAt += t.quarter;
          step += 1;
        }
      }, 160);
    };

    // Flip the record — swap the side and restart its line from the top. The
    // crackle bed keeps running, so the change is seamless.
    const setTrack = (i: number) => {
      void ctx.resume();
      track = TRACKS[i % TRACKS.length] ?? TRACKS[0];
      step = 0;
    };

    const click = () => {
      const at = ctx.currentTime + 0.01;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 950;
      gain.gain.setValueAtTime(0.05, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
      osc.connect(gain).connect(master);
      osc.start(at);
      osc.stop(at + 0.06);
    };

    // Last Call scoring sounds — a soft pluck for the right call, a dull buzz for the wrong one.
    const pluck = () => {
      const at = ctx.currentTime + 0.01;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 392;
      gain.gain.setValueAtTime(0.07, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
      osc.connect(gain).connect(master);
      osc.start(at);
      osc.stop(at + 0.16);
    };

    const buzz = () => {
      const at = ctx.currentTime + 0.01;
      const osc = ctx.createOscillator();
      const lp = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 98;
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      gain.gain.setValueAtTime(0.06, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
      osc.connect(lp).connect(gain).connect(master);
      osc.start(at);
      osc.stop(at + 0.22);
    };

    const setMuted = (muted: boolean) => {
      master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02);
    };

    const dispose = () => {
      if (recordTimer !== null) window.clearInterval(recordTimer);
      recordTimer = null;
      try {
        crackle?.stop();
      } catch {
        // already stopped — nothing to clean
      }
      crackle = null;
      void ctx.close();
    };

    return { knock, startRecord, setTrack, click, pluck, buzz, setMuted, dispose };
  } catch (err) {
    console.warn('[back-room] WebAudio unavailable — the room will be silent', err);
    return null;
  }
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function BackRoomEasterEgg() {
  const { theme, setTheme } = useTheme();
  const [phase, setPhase] = useState<Phase>('closed');
  const [muted, setMutedState] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [trackIdx, setTrackIdx] = useState(0); // which side is on the record

  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;
  const audioRef = useRef<BackRoomAudio | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const tiltRef = useRef<HTMLDivElement | null>(null);
  const timersRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current = [];
  }, []);

  const close = useCallback(() => {
    clearTimers();
    audioRef.current?.dispose();
    audioRef.current = null;
    setPhase('closed');
    setMutedState(false);
    setExiting(false);
    restoreFocusRef.current?.focus();
  }, [clearTimers]);

  const open = useCallback(() => {
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    audioRef.current = createBackRoomAudio();
    setTrackIdx(readSavedTrack()); // open to whichever side last spun
    if (prefersReducedMotion()) {
      setPhase('room'); // still and silent — the card, no cinematic
      return;
    }
    audioRef.current?.knock();
    setPhase('door');
  }, []);

  // The secret knock — letters typed anywhere outside an editable field.
  useEffect(() => {
    let buffer = '';
    const onKey = (e: KeyboardEvent) => {
      if (phaseRef.current !== 'closed') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      ) {
        buffer = '';
        return;
      }
      if (e.key === ' ' || e.key === 'Shift') return; // "knock knock" works too
      if (!/^[a-z]$/i.test(e.key)) {
        buffer = '';
        return;
      }
      buffer = (buffer + e.key.toLowerCase()).slice(-KNOCK.length);
      if (buffer === KNOCK) {
        buffer = '';
        open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // The touch knock — knock on the glass: tap-tap, pause, tap-tap on any
  // non-interactive surface. Phones have no keyboard to type the knock with.
  useEffect(() => {
    let taps: number[] = [];
    const onPointerDown = (e: PointerEvent) => {
      if (phaseRef.current !== 'closed') return;
      if (e.pointerType !== 'touch') return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        t.closest('button, a, input, textarea, select, [role="button"], [contenteditable="true"]')
      ) {
        taps = [];
        return;
      }
      const now = e.timeStamp;
      taps = [...taps.filter((x) => now - x < 2200), now].slice(-4);
      if (taps.length === 4) {
        const [a, b, c, d] = taps;
        const knock = b - a < 420 && d - c < 420 && c - b > 160 && c - b < 1200;
        if (knock) {
          taps = [];
          open(); // inside the touch gesture, so iOS lets the audio through
        }
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Door cinematic → room.
  useEffect(() => {
    if (phase !== 'door') return;
    const id = window.setTimeout(() => setPhase('room'), DOOR_MS);
    timersRef.current.push(id);
    return () => window.clearTimeout(id);
  }, [phase]);

  // Room: focus the dialog, drop the needle on the last side that spun.
  useEffect(() => {
    if (phase !== 'room') return;
    dialogRef.current?.focus();
    if (!prefersReducedMotion()) audioRef.current?.startRecord(readSavedTrack());
  }, [phase]);

  // Escape: leaves the game for the room first, then closes everything.
  useEffect(() => {
    if (phase === 'closed') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (phaseRef.current === 'game') setPhase('room');
      else close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, close]);

  // Cursor parallax on the membership card.
  useEffect(() => {
    if (phase !== 'room' || prefersReducedMotion()) return;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = tiltRef.current;
        if (!el) return;
        const dx = e.clientX / window.innerWidth - 0.5;
        const dy = e.clientY / window.innerHeight - 0.5;
        el.style.setProperty('--br-ry', `${(dx * 9).toFixed(2)}deg`);
        el.style.setProperty('--br-rx', `${(-dy * 7).toFixed(2)}deg`);
      });
    };
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
  }, [phase]);

  // Dispose audio if the component ever unmounts mid-scene.
  useEffect(() => () => audioRef.current?.dispose(), []);

  const killLights = useCallback(() => {
    const target: ThemeId = theme === 'darkroom' ? 'nobc' : 'darkroom';
    audioRef.current?.click();
    setPhase('lightsout');
    timersRef.current.push(window.setTimeout(() => setTheme(target), 450));
    timersRef.current.push(window.setTimeout(() => setExiting(true), 850));
    timersRef.current.push(window.setTimeout(close, 1400));
  }, [theme, setTheme, close]);

  const toggleMuted = useCallback(() => {
    setMutedState((m) => {
      audioRef.current?.setMuted(!m);
      return !m;
    });
  }, []);

  // Flip the record — needle lift, swap the side, remember it for next time.
  const cycleRecord = useCallback(() => {
    setTrackIdx((i) => {
      const next = (i + 1) % TRACKS.length;
      audioRef.current?.click();
      audioRef.current?.setTrack(next);
      try {
        window.localStorage.setItem(TRACK_KEY, String(next));
      } catch {
        // private mode / blocked storage — the flip still plays, just won't persist
      }
      return next;
    });
  }, []);

  // Minimal focus trap — the room has a handful of focusables.
  const onTrapKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusables = dialog.querySelectorAll<HTMLElement>('button');
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  if (phase === 'closed') return null;

  if (phase === 'lightsout') {
    return <div className={exiting ? 'br-blackout br-blackout-out' : 'br-blackout'} aria-hidden />;
  }

  return (
    <div data-theme="darkroom">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="The Back Room"
        tabIndex={-1}
        className={phase === 'door' ? 'br-overlay br-knocking' : 'br-overlay'}
        onKeyDown={onTrapKeyDown}
        onClick={(e) => {
          if (e.target !== e.currentTarget) return;
          if (phase === 'door') setPhase('room'); // impatient click fast-forwards
          else if (phase === 'room') close(); // never on a stray tap mid-game
        }}
      >
        <div className="br-grain" aria-hidden />

        {phase === 'door' && (
          <div className="br-scene" aria-hidden>
            <div className="br-doorframe" />
            <div className="br-door br-door-open" style={{ animationDelay: '3.3s' }}>
              <div className="br-slot">
                <div className="br-slot-light">
                  <span className="br-eye" />
                  <span className="br-eye" />
                </div>
              </div>
              <div className="br-knob" />
            </div>
            <div className="br-flood" />
            <p className="br-caption br-caption-1">who&rsquo;s there?</p>
            <p className="br-caption br-caption-2">ah &mdash; you&rsquo;re on the list</p>
          </div>
        )}

        {(phase === 'room' || phase === 'game' || phase === 'theline') && (
          <>
            <div className="br-smoke br-smoke-a" aria-hidden />
            <div className="br-smoke br-smoke-b" aria-hidden />
          </>
        )}

        {phase === 'game' && (
          <LastCallGame
            sfx={
              audioRef.current
                ? { pluck: audioRef.current.pluck, buzz: audioRef.current.buzz }
                : null
            }
            onExit={() => setPhase('room')}
          />
        )}

        {phase === 'theline' && (
          <TheLineGame
            sfx={
              audioRef.current
                ? { pluck: audioRef.current.pluck, buzz: audioRef.current.buzz }
                : null
            }
            onExit={() => setPhase('room')}
          />
        )}

        {phase === 'room' && (
          <>
            <div className="br-room">
              <div className="br-lamp" aria-hidden>
                <div className="br-cord" />
                <div className="br-bulb" />
                <div className="br-cone" />
              </div>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span
                  key={i}
                  className="br-dust"
                  aria-hidden
                  style={{
                    left: `${42 + i * 3.2}%`,
                    top: `${18 + (i % 3) * 9}%`,
                    animationDelay: `${i * 1.4}s`,
                  }}
                />
              ))}

              <div ref={tiltRef} className="br-card-tilt">
                <div className="br-card br-stagger">
                  <div className="flex items-start justify-between">
                    <span
                      className="grid h-12 w-12 place-items-center rounded-full border text-sm font-bold tracking-widest"
                      style={{
                        borderColor: 'var(--border-strong)',
                        color: 'var(--primary)',
                        fontFamily: "var(--font-display, 'PP Editorial New', Georgia, serif)",
                        fontStyle: 'italic',
                      }}
                    >
                      N&deg;
                    </span>
                    <button
                      type="button"
                      onClick={toggleMuted}
                      aria-label={muted ? 'Unmute the record' : 'Mute the record'}
                      className="rounded-full p-2 transition-opacity hover:opacity-80"
                      style={{ color: 'var(--text-muted)', background: 'var(--primary)' }}
                    >
                      {muted ? (
                        <VolumeX className="h-4 w-4" style={{ color: 'var(--on-primary)' }} aria-hidden />
                      ) : (
                        <Volume2 className="h-4 w-4" style={{ color: 'var(--on-primary)' }} aria-hidden />
                      )}
                    </button>
                  </div>

                  <p
                    className="mt-5 text-[10px] font-semibold uppercase"
                    style={{ color: 'var(--text-muted)', letterSpacing: '0.32em' }}
                  >
                    Members only &middot; est. after midnight
                  </p>

                  <h2
                    className="br-title mt-2"
                    style={{
                      fontFamily: "var(--font-display, 'PP Editorial New', Georgia, serif)",
                      fontStyle: 'italic',
                      color: 'var(--text-primary)',
                    }}
                  >
                    The Back Room
                  </h2>

                  <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    You knocked. We remembered.
                  </p>

                  <div className="br-vinyl-row mt-6 flex items-center gap-6">
                    <button
                      type="button"
                      className="br-vinyl-wrap"
                      onClick={cycleRecord}
                      aria-label={`Now playing ${TRACKS[trackIdx].name}. Click to flip the record.`}
                    >
                      <div className="br-vinyl">
                        <span key={trackIdx} className="br-vinyl-label">
                          {TRACKS[trackIdx].top}
                          <br />
                          {TRACKS[trackIdx].bot}
                        </span>
                      </div>
                      <div className="br-tonearm" />
                    </button>
                    <ul className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      <li>What&rsquo;s poured here stays here.</li>
                      <li>Bring someone worth remembering.</li>
                      <li>
                        The lights stay low.{' '}
                        <em style={{ color: 'var(--text-primary)' }}>The standards don&rsquo;t.</em>
                      </li>
                    </ul>
                  </div>

                  <div className="mt-7 flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      onClick={killLights}
                      className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
                      style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}
                    >
                      {theme === 'darkroom' ? 'Lights back on' : 'Kill the lights'}
                    </button>
                    <button
                      type="button"
                      onClick={close}
                      className="text-sm underline-offset-4 transition-colors hover:underline"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Slip out the side door
                    </button>
                  </div>
                  <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {theme === 'darkroom'
                      ? 'Brings the dashboard back to daylight.'
                      : 'Leaves the dashboard in the Darkroom theme.'}
                  </p>

                  <button type="button" className="br-matchbook" onClick={() => setPhase('game')}>
                    Working the door tonight?
                  </button>

                  <button type="button" className="tl-neon" onClick={() => setPhase('theline')}>
                    The line&rsquo;s around the block. Run it?
                  </button>

                  <p
                    className="mt-6 border-t pt-3 text-[11px]"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                  >
                    You found the knock. Keep it between members.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

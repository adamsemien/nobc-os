'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { logQAAction } from '@/lib/dev/qa-action-log';
import { archetypeDisplayName } from '@/config/archetypes';

export type RoomData = {
  event: {
    id: string;
    title: string;
    startAt: string;
    venue: string | null;
    capacity: number | null;
  };
  checkedIn: number;
  waitlistCount: number;
  recentArrivals: Array<{
    rsvpId: string;
    memberId: string;
    name: string;
    archetype: string | null;
    checkedInAt: string;
    avatarUrl: string | null;
    isVip: boolean;
  }>;
  inTheRoom: Array<{
    rsvpId: string;
    memberId: string;
    name: string;
    archetype: string | null;
    checkedInAt: string;
    isVip: boolean;
  }>;
  nextOnWaitlist: { rsvpId: string; name: string } | null;
  archetypeMix: Record<string, number>;
};

const POLL_MS = 10_000;
const VIBE_POLL_MS = 30 * 60 * 1000;
const SPOTLIGHT_MS = 60 * 1000;

const ARCHETYPE_TINTS: Record<string, string> = {
  Connector: 'rgba(178, 46, 33, 0.10)',
  Host: 'rgba(241, 187, 119, 0.10)',
  Curator: 'rgba(199, 167, 222, 0.10)',
  Builder: 'rgba(132, 188, 222, 0.10)',
  Maker: 'rgba(166, 209, 137, 0.10)',
  Patron: 'rgba(225, 184, 138, 0.10)',
  Sage: 'rgba(199, 167, 222, 0.10)',
  Spark: 'rgba(166, 209, 137, 0.10)',
};

const ARCHETYPE_CHIP: Record<string, string> = {
  Connector: 'rgba(178, 46, 33, 0.85)',
  Host: 'rgba(241, 187, 119, 0.85)',
  Curator: 'rgba(199, 167, 222, 0.85)',
  Builder: 'rgba(132, 188, 222, 0.85)',
  Maker: 'rgba(166, 209, 137, 0.85)',
  Patron: 'rgba(225, 184, 138, 0.85)',
  Sage: 'rgba(199, 167, 222, 0.85)',
  Spark: 'rgba(166, 209, 137, 0.85)',
};

function fmtRelative(iso: string, now: number): string {
  const ms = now - new Date(iso).getTime();
  if (ms < 30_000) return 'just now';
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m === 1) return '1 min ago';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h === 1) return '1 hr ago';
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function fmtClock(d: Date): string {
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function fmtEventDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function playChime(audioCtx: AudioContext) {
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(1320, now + 0.15);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.42);
}

function fireConfetti(durationMs = 3000) {
  const root = document.getElementById('room-confetti-root');
  if (!root) return;
  root.innerHTML = '';
  const colors = ['#B22E21', '#F1BB77', '#C7A7DE', '#84BCDE', '#A6D189', '#E1B88A', '#FFFFFF'];
  const count = 140;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('span');
    piece.className = 'room-confetti-piece';
    const left = Math.random() * 100;
    const delay = Math.random() * 0.6;
    const dur = 2.2 + Math.random() * 1.4;
    const rot = Math.random() * 720 - 360;
    const w = 6 + Math.random() * 6;
    const h = 8 + Math.random() * 10;
    piece.style.left = `${left}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.width = `${w}px`;
    piece.style.height = `${h}px`;
    piece.style.animationDelay = `${delay}s`;
    piece.style.animationDuration = `${dur}s`;
    piece.style.setProperty('--rot', `${rot}deg`);
    root.appendChild(piece);
  }
  window.setTimeout(() => {
    if (root) root.innerHTML = '';
  }, durationMs + 400);
}

type ArrivalEntry = RoomData['recentArrivals'][number] & { firstSeenAt: number };

export function RoomDashboard({
  eventId,
  initial,
}: {
  eventId: string;
  initial: RoomData;
}) {
  const [data, setData] = useState<RoomData>(initial);
  const [clockNow, setClockNow] = useState<Date>(() => new Date());
  const [tickNow, setTickNow] = useState<number>(() => Date.now());
  const [muted, setMuted] = useState(false);
  const [vibe, setVibe] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [arrivalLog, setArrivalLog] = useState<ArrivalEntry[]>(() =>
    initial.recentArrivals.map((a) => ({ ...a, firstSeenAt: Date.now() })),
  );

  const seenRsvpIdsRef = useRef<Set<string>>(
    new Set(initial.recentArrivals.map((a) => a.rsvpId)),
  );
  const seenSelloutRef = useRef<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // Live wall clock — 1Hz
  useEffect(() => {
    const id = window.setInterval(() => setClockNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Lightweight tick to refresh "just now" / "2 min ago" labels — every 15s
  useEffect(() => {
    const id = window.setInterval(() => setTickNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  // Poll the room endpoint every 10s
  const fetchRoom = useCallback(async () => {
    try {
      const res = await fetch(`/api/operator/events/${eventId}/room`, { cache: 'no-store' });
      if (!res.ok) return;
      const next = (await res.json()) as RoomData;
      setData(next);
    } catch (err) {
      console.error('[Room] poll failed:', err);
    }
  }, [eventId]);

  useEffect(() => {
    const id = window.setInterval(fetchRoom, POLL_MS);
    return () => window.clearInterval(id);
  }, [fetchRoom]);

  // Poll the vibe endpoint every 30 minutes (and once on mount)
  const fetchVibe = useCallback(async () => {
    try {
      const res = await fetch(`/api/operator/events/${eventId}/room/vibe`, { cache: 'no-store' });
      if (!res.ok) return;
      const { vibe: v } = (await res.json()) as { vibe: string };
      if (v) setVibe(v);
    } catch (err) {
      console.error('[Room] vibe failed:', err);
    }
  }, [eventId]);

  useEffect(() => {
    fetchVibe();
    const id = window.setInterval(fetchVibe, VIBE_POLL_MS);
    return () => window.clearInterval(id);
  }, [fetchVibe]);

  // Detect new arrivals → animate, chime, update spotlight, maybe confetti
  useEffect(() => {
    const newOnes: ArrivalEntry[] = [];
    for (const a of data.recentArrivals) {
      if (!seenRsvpIdsRef.current.has(a.rsvpId)) {
        seenRsvpIdsRef.current.add(a.rsvpId);
        newOnes.push({ ...a, firstSeenAt: Date.now() });
      }
    }
    if (newOnes.length > 0) {
      setArrivalLog((prev) => {
        const next = [...newOnes, ...prev];
        return next.slice(0, 10);
      });
      if (!mutedRef.current) {
        try {
          if (!audioCtxRef.current) {
            const Ctx =
              window.AudioContext ||
              (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            audioCtxRef.current = new Ctx();
          }
          if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
            if (audioCtxRef.current.state === 'suspended') {
              audioCtxRef.current.resume().catch(() => {});
            }
            playChime(audioCtxRef.current);
          }
        } catch {
          // Audio failed — silent fallback.
        }
      }
    }

    if (
      data.event.capacity != null &&
      data.checkedIn >= data.event.capacity &&
      data.checkedIn > 0 &&
      !seenSelloutRef.current
    ) {
      seenSelloutRef.current = true;
      fireConfetti();
    }
    if (data.event.capacity != null && data.checkedIn < data.event.capacity) {
      seenSelloutRef.current = false;
    }
  }, [data]);

  // Browser tab title
  useEffect(() => {
    const cap = data.event.capacity != null ? `/${data.event.capacity}` : '';
    document.title = `${data.event.title} · ${data.checkedIn}${cap} checked in`;
    return () => {
      document.title = 'NoBC OS';
    };
  }, [data.event.title, data.event.capacity, data.checkedIn]);

  const capacity = data.event.capacity;
  const fillPct = useMemo(() => {
    if (!capacity || capacity <= 0) return 0;
    return Math.min(100, Math.round((data.checkedIn / capacity) * 100));
  }, [data.checkedIn, capacity]);

  const handlePromote = useCallback(async () => {
    if (!data.nextOnWaitlist || promoting) return;
    setPromoting(true);
    try {
      const res = await fetch(`/api/operator/events/${eventId}/promote-waitlist`, {
        method: 'POST',
      });
      if (res.ok) {
        logQAAction('promoted from waitlist');
        await fetchRoom();
      }
    } catch (err) {
      console.error('[Room] promote failed:', err);
    } finally {
      setPromoting(false);
    }
  }, [data.nextOnWaitlist, eventId, fetchRoom, promoting]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      // Ensure AudioContext is created on user gesture (browser autoplay rules).
      if (!next && !audioCtxRef.current && typeof window !== 'undefined') {
        try {
          const Ctx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          audioCtxRef.current = new Ctx();
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] overflow-hidden text-white"
      style={{
        background:
          'radial-gradient(circle at 20% 0%, rgba(178,46,33,0.10), transparent 55%), radial-gradient(circle at 90% 100%, rgba(199,167,222,0.08), transparent 50%), #1a1520',
        fontFamily: 'var(--font-body, ui-sans-serif, system-ui)',
      }}
    >
      <style>{styles}</style>

      {/* Subtle noise texture */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.04] mix-blend-overlay room-noise" />

      <div id="room-confetti-root" className="pointer-events-none fixed inset-0 z-[80]" />

      {/* Back link */}
      <Link
        href={`/operator/events/${eventId}`}
        className="absolute left-6 top-4 z-[70] text-xs uppercase tracking-[0.18em] text-white/40 transition-colors hover:text-white"
      >
        ← Back to event
      </Link>

      {/* ZONE 1 — Top bar */}
      <header className="relative z-10 grid grid-cols-3 items-center gap-4 border-b border-white/10 px-8 pb-5 pt-12">
        <div className="flex items-baseline gap-4 min-w-0">
          <h1
            className="truncate text-2xl font-normal italic tracking-tight md:text-3xl"
            style={{ fontFamily: 'var(--font-display, "PP Editorial New", Georgia, serif)' }}
          >
            {data.event.title}
          </h1>
          {vibe ? (
            <span
              className="hidden truncate text-xs italic text-white/45 md:inline"
              style={{ fontFamily: 'var(--font-display, "PP Editorial New", Georgia, serif)' }}
              title="Vibe — updates every 30 min"
            >
              · {vibe}
            </span>
          ) : null}
        </div>

        <div className="text-center text-sm text-white/65">
          <div>{fmtEventDate(data.event.startAt)}</div>
          {data.event.venue ? <div className="text-white/45">{data.event.venue}</div> : null}
        </div>

        <div className="flex items-center justify-end gap-4">
          <button
            type="button"
            onClick={toggleMute}
            className="rounded-full border border-white/15 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-white/60 transition-colors hover:border-white/40 hover:text-white"
            title={muted ? 'Sound off — click to enable' : 'Sound on — click to mute'}
          >
            {muted ? 'sound off' : 'sound on'}
          </button>

          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-white/55">live</span>
          </div>

          <div
            className="tabular-nums text-base text-white/80"
            style={{ fontFamily: 'var(--font-display, "PP Editorial New", Georgia, serif)' }}
          >
            {fmtClock(clockNow)}
          </div>
        </div>
      </header>

      {/* ZONES 2 + 3 */}
      <div className="relative z-10 grid h-[calc(100vh-104px)] grid-cols-[35%_65%] gap-6 px-8 py-6">
        {/* ZONE 2 — Left */}
        <aside className="flex min-h-0 flex-col gap-6">
          {/* Capacity gauge */}
          <section className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
            <div className="text-[10px] uppercase tracking-[0.20em] text-white/40">in the room</div>
            <div
              className="mt-2 flex items-baseline gap-3 leading-none tabular-nums"
              style={{ fontFamily: 'var(--font-display, "PP Editorial New", Georgia, serif)' }}
            >
              <span className="text-7xl text-white">{data.checkedIn}</span>
              {capacity != null ? (
                <span className="text-3xl italic text-white/40">/ {capacity}</span>
              ) : null}
            </div>
            {capacity != null ? (
              <div className="mt-5">
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out"
                    style={{
                      width: `${fillPct}%`,
                      background:
                        'linear-gradient(90deg, #B22E21 0%, #E1B88A 100%)',
                      boxShadow: '0 0 12px rgba(178, 46, 33, 0.45)',
                    }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-[10px] uppercase tracking-[0.16em] text-white/35">
                  <span>{fillPct}% full</span>
                  <span>
                    {Math.max(0, capacity - data.checkedIn)}{' '}
                    {capacity - data.checkedIn === 1 ? 'spot' : 'spots'} left
                  </span>
                </div>
              </div>
            ) : null}
          </section>

          {/* Waitlist */}
          <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <div className="flex items-baseline justify-between">
              <div className="text-[10px] uppercase tracking-[0.20em] text-white/40">waitlist</div>
              <div
                className="text-2xl text-white/85 tabular-nums"
                style={{ fontFamily: 'var(--font-display, "PP Editorial New", Georgia, serif)' }}
              >
                {data.waitlistCount}
              </div>
            </div>
            {data.nextOnWaitlist ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">next up</div>
                  <div className="truncate text-sm text-white/90">{data.nextOnWaitlist.name}</div>
                </div>
                <button
                  type="button"
                  onClick={handlePromote}
                  disabled={promoting}
                  className="shrink-0 rounded-sm border border-[#B22E21] bg-[#B22E21]/90 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#B22E21] disabled:opacity-50"
                >
                  {promoting ? 'promoting…' : 'Promote →'}
                </button>
              </div>
            ) : (
              <div className="mt-3 text-xs italic text-white/35">no one waiting.</div>
            )}
          </section>

          {/* Recent arrivals */}
          <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <div className="text-[10px] uppercase tracking-[0.20em] text-white/40">
                recent arrivals
              </div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">
                live feed
              </div>
            </div>
            <ul className="flex-1 space-y-2 overflow-y-auto pr-1">
              {arrivalLog.length === 0 ? (
                <li className="py-6 text-center text-xs italic text-white/35">
                  doors open soon — no arrivals yet.
                </li>
              ) : (
                arrivalLog.map((a, idx) => {
                  const isSpotlight = idx === 0 && tickNow - a.firstSeenAt < SPOTLIGHT_MS;
                  return (
                    <li
                      key={a.rsvpId}
                      className={
                        'room-arrival-row flex items-center justify-between gap-3 rounded-lg border px-3 ' +
                        (isSpotlight
                          ? 'room-spotlight border-[#B22E21]/50 py-3'
                          : 'border-white/[0.06] py-2')
                      }
                      style={
                        isSpotlight
                          ? {
                              background:
                                'linear-gradient(120deg, rgba(178,46,33,0.18), rgba(255,255,255,0.02))',
                            }
                          : undefined
                      }
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div
                          className={
                            'flex shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[10px] uppercase tracking-wider text-white/55 ' +
                            (isSpotlight ? 'h-8 w-8' : 'h-7 w-7')
                          }
                        >
                          {a.name.slice(0, 1)}
                        </div>
                        <div className="min-w-0">
                          <div
                            className={
                              'truncate ' +
                              (isSpotlight ? 'text-base text-white' : 'text-sm text-white/90')
                            }
                            style={{
                              fontFamily:
                                'var(--font-display, "PP Editorial New", Georgia, serif)',
                            }}
                          >
                            {a.name}
                            {a.isVip ? (
                              <span
                                className="ml-1.5 text-[10px] text-[#C7A7DE]"
                                title="Purple list"
                              >
                                ✦
                              </span>
                            ) : null}
                          </div>
                          {a.archetype ? (
                            <ArchetypeChip name={a.archetype} small />
                          ) : null}
                        </div>
                      </div>
                      <div className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-white/35">
                        {fmtRelative(a.checkedInAt, tickNow)}
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </section>
        </aside>

        {/* ZONE 3 — Right */}
        <section className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-white/[0.02] p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h2
              className="text-xl italic text-white/85"
              style={{ fontFamily: 'var(--font-display, "PP Editorial New", Georgia, serif)' }}
            >
              In The Room
            </h2>
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
              {data.inTheRoom.length} {data.inTheRoom.length === 1 ? 'person' : 'people'}
            </div>
          </div>

          {data.inTheRoom.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <p
                className="text-center text-base italic text-white/40"
                style={{
                  fontFamily: 'var(--font-display, "PP Editorial New", Georgia, serif)',
                }}
              >
                No one checked in yet — doors open soon.
              </p>
            </div>
          ) : (
            <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {data.inTheRoom.map((m) => {
                const tint = m.archetype ? ARCHETYPE_TINTS[m.archetype] : undefined;
                return (
                  <div
                    key={m.rsvpId}
                    className="room-card group relative flex flex-col justify-between rounded-lg border border-white/10 p-3 transition-colors hover:border-white/20"
                    style={{
                      background:
                        tint ??
                        'linear-gradient(140deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
                      minHeight: '110px',
                    }}
                  >
                    <div>
                      <div
                        className="line-clamp-2 text-base leading-tight text-white"
                        style={{
                          fontFamily:
                            'var(--font-display, "PP Editorial New", Georgia, serif)',
                        }}
                      >
                        {m.name}
                        {m.isVip ? (
                          <span className="ml-1 text-[11px] text-[#C7A7DE]" title="Purple list">
                            ✦
                          </span>
                        ) : null}
                      </div>
                      {m.archetype ? (
                        <div className="mt-2">
                          <ArchetypeChip name={m.archetype} />
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-white/35">
                      {fmtRelative(m.checkedInAt, tickNow)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ArchetypeChip({ name, small = false }: { name: string; small?: boolean }) {
  const color = ARCHETYPE_CHIP[name] ?? 'rgba(255,255,255,0.45)';
  return (
    <span
      className={
        'inline-flex items-center rounded-full border ' +
        (small
          ? 'mt-0.5 px-1.5 py-px text-[9px]'
          : 'px-2 py-0.5 text-[10px]') +
        ' uppercase tracking-[0.16em]'
      }
      style={{
        borderColor: color,
        color,
        background: `${color.replace('0.85', '0.12')}`,
      }}
    >
      {archetypeDisplayName(name)}
    </span>
  );
}

const styles = `
@keyframes room-arrive {
  0% { opacity: 0; transform: translateY(-6px) scale(0.985); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.room-arrival-row { animation: room-arrive 380ms ease-out both; }
.room-card { animation: room-arrive 460ms ease-out both; }

@keyframes room-spotlight-glow {
  0%, 100% { box-shadow: 0 0 0 1px rgba(178, 46, 33, 0.30), 0 0 28px rgba(178, 46, 33, 0.22); }
  50%      { box-shadow: 0 0 0 1px rgba(178, 46, 33, 0.55), 0 0 38px rgba(178, 46, 33, 0.35); }
}
.room-spotlight { animation: room-arrive 380ms ease-out both, room-spotlight-glow 2.6s ease-in-out infinite 380ms; }

.room-noise {
  background-image:
    radial-gradient(rgba(255,255,255,0.4) 0.5px, transparent 0.5px),
    radial-gradient(rgba(255,255,255,0.25) 0.5px, transparent 0.5px);
  background-size: 3px 3px, 5px 5px;
  background-position: 0 0, 1.5px 1.5px;
}

@keyframes room-confetti-fall {
  0%   { transform: translate3d(0, -10vh, 0) rotate(0deg); opacity: 1; }
  100% { transform: translate3d(var(--drift, 0px), 110vh, 0) rotate(var(--rot, 360deg)); opacity: 0.85; }
}
.room-confetti-piece {
  position: absolute;
  top: 0;
  display: block;
  border-radius: 1px;
  animation: room-confetti-fall linear forwards;
  will-change: transform, opacity;
}
`;

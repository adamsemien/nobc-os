'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, ListChecks } from 'lucide-react';
import { checkinDb, type CachedRsvp } from '@/lib/checkin-db';
import { BrowserMultiFormatReader } from '@zxing/library';

const CHECKIN_SECRET = process.env.NEXT_PUBLIC_CHECKIN_SECRET ?? '';

interface EventInfo {
  id: string;
  title: string;
  startAt: string;
  capacity: number | null;
}

type View = 'list' | 'scanner';

function formatTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function CheckInClient({
  eventSlug,
  workspaceSlug,
}: {
  eventSlug: string;
  workspaceSlug: string;
}) {
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [rsvps, setRsvps] = useState<CachedRsvp[]>([]);
  const [checkedInCount, setCheckedInCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [view, setView] = useState<View>('list');
  const [search, setSearch] = useState('');
  const [scanResult, setScanResult] = useState<{ name: string; status: 'success' | 'already' | 'not_found' | 'error' } | null>(null);
  const [loading, setLoading] = useState(true);
  const [scannerActive, setScannerActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  const fetchGuestList = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/check-in/event?slug=${eventSlug}&workspace=${workspaceSlug}`,
        { headers: { Authorization: `Bearer ${CHECKIN_SECRET}` } },
      );
      if (!res.ok) return;
      const data = await res.json();
      setEvent(data.event);
      setCheckedInCount(data.checkedInCount);
      setTotalCount(data.totalCount);
      await checkinDb.rsvps.bulkPut(data.rsvps);
      setRsvps(data.rsvps);
    } finally {
      setLoading(false);
    }
  }, [eventSlug, workspaceSlug]);

  useEffect(() => {
    checkinDb.rsvps.toArray().then(cached => {
      if (cached.length) {
        setRsvps(cached);
        setCheckedInCount(cached.filter(r => r.checkedIn).length);
        setTotalCount(cached.length);
      }
    });
    fetchGuestList();
  }, [fetchGuestList]);

  const performCheckIn = useCallback(async (rsvpId: string): Promise<CachedRsvp | null> => {
    const rsvp = await checkinDb.rsvps.get(rsvpId);
    if (!rsvp) return null;
    if (rsvp.checkedIn) return rsvp;

    const now = new Date().toISOString();

    // Optimistic — instant UI, sync in background
    await checkinDb.rsvps.update(rsvpId, { checkedIn: true, checkedInAt: now });
    await checkinDb.pending.put({ rsvpId, checkedInAt: now, synced: false });
    setRsvps(prev =>
      prev.map(r => (r.id === rsvpId ? { ...r, checkedIn: true, checkedInAt: now } : r)),
    );
    setCheckedInCount(c => c + 1);

    fetch(`/api/check-in/${rsvpId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CHECKIN_SECRET}` },
    })
      .then(r => { if (r.ok) checkinDb.pending.update(rsvpId, { synced: true }); })
      .catch(() => {/* stays pending, retry on reconnect */});

    return { ...rsvp, checkedIn: true, checkedInAt: now };
  }, []);

  const handleQrScan = useCallback(async (qrCode: string) => {
    if (!scannerActive) return;
    const rsvp = await checkinDb.rsvps.filter(r => r.memberQrCode === qrCode).first();

    if (!rsvp) {
      setScanResult({ name: qrCode, status: 'not_found' });
      setTimeout(() => setScanResult(null), 3000);
      return;
    }
    if (rsvp.checkedIn) {
      setScanResult({ name: `${rsvp.firstName} ${rsvp.lastName}`, status: 'already' });
      setTimeout(() => setScanResult(null), 3000);
      return;
    }
    const result = await performCheckIn(rsvp.id);
    if (result) {
      setScanResult({ name: `${result.firstName} ${result.lastName}`, status: 'success' });
      setTimeout(() => setScanResult(null), 3000);
    }
  }, [scannerActive, performCheckIn]);

  useEffect(() => {
    if (view !== 'scanner') return;
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    setScannerActive(true);
    if (videoRef.current) {
      reader.decodeFromVideoDevice(null, videoRef.current, (result, err) => {
        if (result) handleQrScan(result.getText());
        void err;
      }).catch(() => {});
    }
    return () => {
      reader.reset();
      setScannerActive(false);
    };
  }, [view, handleQrScan]);

  useEffect(() => {
    const syncPending = async () => {
      const pending = await checkinDb.pending.where('synced').equals(0).toArray();
      for (const p of pending) {
        try {
          const r = await fetch(`/api/check-in/${p.rsvpId}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${CHECKIN_SECRET}` },
          });
          if (r.ok) await checkinDb.pending.update(p.rsvpId, { synced: true });
        } catch { /* offline */ }
      }
    };
    window.addEventListener('online', syncPending);
    return () => window.removeEventListener('online', syncPending);
  }, []);

  const filteredRsvps = search.trim()
    ? rsvps.filter(r => {
        const q = search.toLowerCase();
        return (
          r.firstName.toLowerCase().includes(q) ||
          r.lastName.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q)
        );
      })
    : rsvps;

  // Checked-in first toggled off — keep stable order: not-checked-in first, then checked-in
  const orderedRsvps = [...filteredRsvps].sort((a, b) => {
    if (a.checkedIn !== b.checkedIn) return a.checkedIn ? 1 : -1;
    return a.lastName.localeCompare(b.lastName);
  });

  const scanResultBg =
    scanResult?.status === 'success' ? '#1f7a44'
    : scanResult?.status === 'already' ? '#9a6a00'
    : '#a32b2b';

  return (
    <div
      style={{
        minHeight: '100dvh',
        backgroundColor: '#0a0a0a',
        color: '#f5f5f5',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-geist-sans, system-ui, sans-serif)',
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid #222',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          background: '#0a0a0a',
          zIndex: 10,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Staff Check-In
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {loading && !event ? '…' : event?.title ?? 'Event not found'}
          </div>
        </div>
        <button
          onClick={() => setView(v => (v === 'scanner' ? 'list' : 'scanner'))}
          aria-label={view === 'scanner' ? 'Show guest list' : 'Open QR scanner'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 48,
            height: 48,
            flexShrink: 0,
            borderRadius: 10,
            border: '1px solid #333',
            background: view === 'scanner' ? '#f5f5f5' : '#161616',
            color: view === 'scanner' ? '#0a0a0a' : '#f5f5f5',
            cursor: 'pointer',
          }}
        >
          {view === 'scanner' ? <ListChecks size={22} /> : <Camera size={22} />}
        </button>
      </header>

      {/* Running count */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid #222',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 40, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em' }}>
          {checkedInCount}
          <span style={{ color: '#555', fontWeight: 600 }}> / {totalCount}</span>
        </span>
        <span style={{ fontSize: 13, color: '#888' }}>
          checked in{event?.capacity ? ` · cap ${event.capacity}` : ''}
        </span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {view === 'scanner' ? (
          <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <video
              ref={videoRef}
              style={{ width: '100%', maxWidth: 480, aspectRatio: '1', objectFit: 'cover', background: '#111' }}
              playsInline
              muted
            />
            <div
              style={{
                position: 'absolute',
                top: 'calc(50% - 20px)',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 220,
                height: 220,
                border: '2px solid rgba(255,255,255,0.45)',
                borderRadius: 12,
                pointerEvents: 'none',
              }}
            />
            {scanResult && (
              <div
                role="status"
                aria-live="assertive"
                style={{
                  position: 'absolute',
                  bottom: 24,
                  left: 16,
                  right: 16,
                  background: scanResultBg,
                  color: '#fff',
                  borderRadius: 10,
                  padding: '14px 16px',
                  textAlign: 'center',
                  fontWeight: 600,
                  fontSize: 15,
                }}
              >
                {scanResult.status === 'success' && `✓ Checked in · ${scanResult.name}`}
                {scanResult.status === 'already' && `Already in · ${scanResult.name}`}
                {scanResult.status === 'not_found' && 'QR not on guest list'}
                {scanResult.status === 'error' && 'Check-in failed — use search'}
              </div>
            )}
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', flexShrink: 0 }}>
              <input
                type="search"
                aria-label="Search guests by name or email"
                placeholder="Search by name or email…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: '1px solid #333',
                  background: '#161616',
                  color: '#f5f5f5',
                  fontSize: 16,
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
              {orderedRsvps.map(rsvp => (
                <div
                  key={rsvp.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '14px 16px',
                    borderBottom: '1px solid #1a1a1a',
                    background: rsvp.checkedIn ? '#0d0d0d' : 'transparent',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontWeight: 500,
                          fontSize: 16,
                          color: rsvp.checkedIn ? '#999' : '#f5f5f5',
                        }}
                      >
                        {rsvp.firstName} {rsvp.lastName}
                      </span>
                      {rsvp.isComp && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            padding: '2px 7px',
                            borderRadius: 5,
                            background: '#3a2f1a',
                            color: '#e8b04a',
                          }}
                        >
                          {rsvp.compType ?? 'Comp'}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 3 }}>
                      {rsvp.checkedIn ? (
                        <span style={{ color: '#3fae6a' }}>
                          ✓ Checked in{rsvp.checkedInAt ? ` · ${formatTime(rsvp.checkedInAt)}` : ''}
                        </span>
                      ) : (
                        rsvp.email
                      )}
                    </div>
                  </div>
                  {!rsvp.checkedIn && (
                    <button
                      onClick={() => performCheckIn(rsvp.id)}
                      style={{
                        padding: '10px 16px',
                        borderRadius: 8,
                        border: 'none',
                        background: '#f5f5f5',
                        color: '#0a0a0a',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                        flexShrink: 0,
                        minHeight: 44,
                      }}
                    >
                      Check in
                    </button>
                  )}
                </div>
              ))}
              {orderedRsvps.length === 0 && (
                <div style={{ padding: 40, textAlign: 'center', color: '#555', fontSize: 14 }}>
                  {loading ? 'Loading…' : search ? 'No matches' : 'No guests yet'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

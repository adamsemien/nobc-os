'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { checkinDb, type CachedRsvp } from '@/lib/checkin-db';
import { BrowserMultiFormatReader } from '@zxing/library';

const CHECKIN_SECRET = process.env.NEXT_PUBLIC_CHECKIN_SECRET ?? '';

interface EventInfo {
  id: string;
  title: string;
  startAt: string;
  capacity: number | null;
}

type View = 'scanner' | 'list';

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
  const [view, setView] = useState<View>('scanner');
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
      // Seed IndexedDB cache
      await checkinDb.rsvps.bulkPut(data.rsvps);
      setRsvps(data.rsvps);
    } finally {
      setLoading(false);
    }
  }, [eventSlug, workspaceSlug]);

  useEffect(() => {
    // Load from cache first for instant offline display
    checkinDb.rsvps.toArray().then(cached => {
      if (cached.length) setRsvps(cached);
    });
    fetchGuestList();
  }, [fetchGuestList]);

  const performCheckIn = useCallback(async (rsvpId: string): Promise<CachedRsvp | null> => {
    const rsvp = await checkinDb.rsvps.get(rsvpId);
    if (!rsvp) return null;

    if (rsvp.checkedIn) return rsvp;

    const now = new Date().toISOString();

    // Optimistic update in IndexedDB
    await checkinDb.rsvps.update(rsvpId, { checkedIn: true, checkedInAt: now });
    await checkinDb.pending.put({ rsvpId, checkedInAt: now, synced: false });

    setRsvps(prev =>
      prev.map(r => (r.id === rsvpId ? { ...r, checkedIn: true, checkedInAt: now } : r)),
    );
    setCheckedInCount(c => c + 1);

    // Fire-and-forget sync
    fetch(`/api/check-in/${rsvpId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CHECKIN_SECRET}` },
    })
      .then(r => { if (r.ok) checkinDb.pending.update(rsvpId, { synced: true }); })
      .catch(() => {/* stays in pending, retry on next load */});

    return rsvp;
  }, []);

  const handleQrScan = useCallback(async (qrCode: string) => {
    if (!scannerActive) return;

    // Find RSVP by memberQrCode
    const rsvp = await checkinDb.rsvps
      .filter(r => r.memberQrCode === qrCode)
      .first();

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
        if (result) {
          handleQrScan(result.getText());
        }
        void err;
      }).catch(() => {});
    }

    return () => {
      reader.reset();
      setScannerActive(false);
    };
  }, [view, handleQrScan]);

  // Sync pending check-ins on reconnect
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
        } catch { /* offline, try later */ }
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

  const scanResultBg =
    scanResult?.status === 'success'
      ? 'var(--color-success, #16a34a)'
      : scanResult?.status === 'already'
      ? 'var(--color-warning, #d97706)'
      : 'var(--color-error, #dc2626)';

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
          padding: '12px 16px',
          borderBottom: '1px solid #222',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Staff Check-In
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>
            {loading ? '…' : event?.title ?? 'Event not found'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{checkedInCount}</div>
          <div style={{ fontSize: 11, color: '#888' }}>
            of {totalCount}{event?.capacity ? ` (cap ${event.capacity})` : ''}
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #222', flexShrink: 0 }}>
        {(['scanner', 'list'] as View[]).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              flex: 1,
              padding: '10px 0',
              background: 'none',
              border: 'none',
              color: view === v ? '#f5f5f5' : '#555',
              fontSize: 13,
              fontWeight: view === v ? 600 : 400,
              borderBottom: view === v ? '2px solid #f5f5f5' : '2px solid transparent',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {v === 'scanner' ? 'Scan QR' : 'Guest List'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {view === 'scanner' ? (
          <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <video
              ref={videoRef}
              style={{ width: '100%', maxWidth: 480, aspectRatio: '1', objectFit: 'cover', background: '#111' }}
              playsInline
              muted
            />
            {/* Scan overlay frame */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 200,
                height: 200,
                border: '2px solid rgba(255,255,255,0.4)',
                borderRadius: 8,
                pointerEvents: 'none',
              }}
            />
            {scanResult && (
              <div
                role="status"
                aria-live="assertive"
                style={{
                  position: 'absolute',
                  bottom: 80,
                  left: 16,
                  right: 16,
                  background: scanResultBg,
                  color: '#fff',
                  borderRadius: 8,
                  padding: '12px 16px',
                  textAlign: 'center',
                  fontWeight: 600,
                  fontSize: 15,
                }}
              >
                {scanResult.status === 'success' && `✓ Checked in · ${scanResult.name}`}
                {scanResult.status === 'already' && `Already checked in · ${scanResult.name}`}
                {scanResult.status === 'not_found' && 'QR code not on guest list'}
                {scanResult.status === 'error' && 'Check-in failed — try manual search'}
              </div>
            )}
            {/* Manual search shortcut */}
            <div style={{ padding: '12px 16px', width: '100%', maxWidth: 480 }}>
              <input
                type="search"
                aria-label="Search guests by name or email"
                placeholder="Search by name or email…"
                value={search}
                onChange={e => { setSearch(e.target.value); setView('list'); }}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: '1px solid #333',
                  background: '#111',
                  color: '#f5f5f5',
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', flexShrink: 0 }}>
              <input
                type="search"
                placeholder="Search by name or email…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: '1px solid #333',
                  background: '#111',
                  color: '#f5f5f5',
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredRsvps.map(rsvp => (
                <div
                  key={rsvp.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderBottom: '1px solid #1a1a1a',
                    opacity: rsvp.checkedIn ? 0.5 : 1,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 15 }}>
                      {rsvp.firstName} {rsvp.lastName}
                      {rsvp.checkedIn && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: '#16a34a' }}>✓ In</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{rsvp.email}</div>
                  </div>
                  {!rsvp.checkedIn && (
                    <button
                      onClick={() => performCheckIn(rsvp.id)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 5,
                        border: '1px solid #333',
                        background: '#1a1a1a',
                        color: '#f5f5f5',
                        fontSize: 13,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      Check in
                    </button>
                  )}
                </div>
              ))}
              {filteredRsvps.length === 0 && (
                <div style={{ padding: 32, textAlign: 'center', color: '#555', fontSize: 14 }}>
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

'use client';

import { useEffect, useState } from 'react';
import { QAMissionPanel } from '../operator/_components/QAMissionPanel';
import type { ActiveMission } from '@/lib/dev/qa-types';

export default function QAPanelPopoutPage() {
  const [mission, setMission] = useState<ActiveMission | null>(null);
  const [loading, setLoading] = useState(true);

  // Bump the pop-out-active flag on mount so the main window switches to the chip.
  useEffect(() => {
    try {
      localStorage.setItem('nobc-qa-popout-active', 'true');
    } catch {}
    const onUnload = () => {
      try {
        localStorage.setItem('nobc-qa-popout-active', 'false');
        localStorage.setItem('nobc-qa-popout-close-signal', String(Date.now()));
      } catch {}
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  // Fetch + sync mission state via storage events from the main window.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/dev/qa/active');
        if (res.ok) {
          const data = (await res.json()) as { mission: ActiveMission | null };
          if (!cancelled) setMission(data.mission);
        }
      } catch {}
      if (!cancelled) setLoading(false);
    }
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'nobc-qa-tick') load();
      if (e.key === 'nobc-qa-popout-close-signal') window.close();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // Reflect the mission title in the window title.
  useEffect(() => {
    if (!mission) {
      document.title = 'NoBC QA — idle';
      return;
    }
    const title = mission.scenario.split('\n')[0] || 'Mission';
    document.title = `NoBC QA — ${title.slice(0, 60)}`;
  }, [mission]);

  function handleUpdate(next: ActiveMission) {
    setMission(next);
    try {
      localStorage.setItem('nobc-qa-tick', String(Date.now()));
    } catch {}
  }

  function handleDone() {
    setMission(null);
    try {
      localStorage.setItem('nobc-qa-tick', String(Date.now()));
    } catch {}
  }

  function handleAbandon() {
    setMission(null);
    try {
      localStorage.setItem('nobc-qa-tick', String(Date.now()));
    } catch {}
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0710',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        fontFamily: 'monospace',
        color: '#f0eaf6',
      }}
    >
      {loading ? (
        <div style={{ color: '#b0a0c0', textAlign: 'center', marginTop: 40 }}>Loading…</div>
      ) : mission ? (
        <QAMissionPanel
          mission={mission}
          onUpdate={handleUpdate}
          onComplete={handleDone}
          onAbandon={handleAbandon}
          popoutWindow
        />
      ) : (
        <div style={{ color: '#b0a0c0', textAlign: 'center', marginTop: 40, lineHeight: 1.6 }}>
          No active mission.
          <br />
          <span style={{ fontSize: 11, color: '#6a5a7a' }}>
            Start one in the main window — this window will pick it up.
          </span>
        </div>
      )}
    </div>
  );
}

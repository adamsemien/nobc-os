'use client';

import { useEffect, useRef } from 'react';
import { getAudioContext, playWaxStamp } from '@/lib/sounds/wax-stamp';

/** Animated wax seal that fires a layered stamp sound once on mount.
 *  Re-mounts (e.g. when navigating between applications) replay the sound. */
export function WaxSealStamp() {
  const playedRef = useRef(false);

  useEffect(() => {
    if (playedRef.current) return;
    playedRef.current = true;
    const ctx = getAudioContext();
    if (!ctx) return;
    // Match the visual stamp's down-press moment (~80ms into the 400ms cubic curve).
    const start = ctx.currentTime + 0.08;
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => playWaxStamp(ctx, ctx.currentTime + 0.08)).catch(() => {});
    } else {
      playWaxStamp(ctx, start);
    }
  }, []);

  return (
    <div style={{ position: 'relative', height: 0 }}>
      <div
        className="parchment-wax-seal"
        style={{
          position: 'absolute',
          top: -60,
          right: 0,
          width: 64,
          height: 64,
        }}
      >
        <svg viewBox="0 0 64 64" style={{ width: 64, height: 64 }}>
          <circle cx="32" cy="32" r="30" fill="#8b3a2a" />
          <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,240,225,0.3)" strokeWidth="1" />
          <text
            x="32"
            y="37"
            textAnchor="middle"
            fill="rgba(255,240,225,0.9)"
            fontSize="12"
            fontFamily="Georgia, serif"
            fontStyle="italic"
            letterSpacing="2"
          >
            NBC
          </text>
        </svg>
      </div>
    </div>
  );
}

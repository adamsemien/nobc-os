'use client';

import { useSession } from '@clerk/nextjs';
import { useEffect, useRef, useState } from 'react';

const bodyFont = "'Neue Haas Grotesk Display Pro', 'Helvetica Neue', Arial, sans-serif";
const displayFont = "'PP Editorial New', Georgia, serif";

// Warn this far ahead of the session's hard expiry.
const WARN_BEFORE_MS = 2 * 60 * 1000;

/**
 * Warns a signed-in user before Clerk force-logs them out on session expiry,
 * instead of dropping them silently mid-task (e.g. mid-application). Reads the
 * live session.expireAt and arms a warning WARN_BEFORE_MS ahead. Clerk touches
 * the session on activity, which pushes expireAt forward and re-arms the timer,
 * so an active user rarely sees this. "Stay signed in" calls session.touch() to
 * extend the session. Renders nothing when signed out. Mounted globally in
 * Providers so it covers every authed surface (apply, member, operator).
 */
export default function SessionExpiryWarning() {
  const { isLoaded, isSignedIn, session } = useSession();
  const [showWarning, setShowWarning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const expireAtMs = session?.expireAt ? session.expireAt.getTime() : null;

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setShowWarning(false);
    if (!isLoaded || !isSignedIn || expireAtMs == null) return;

    const warnIn = expireAtMs - Date.now() - WARN_BEFORE_MS;
    if (warnIn <= 0) {
      // Already inside the warning window but not yet expired — warn immediately.
      if (expireAtMs - Date.now() > 0) setShowWarning(true);
      return;
    }
    timerRef.current = setTimeout(() => setShowWarning(true), warnIn);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isLoaded, isSignedIn, expireAtMs]);

  if (!showWarning || !session) return null;

  const dismiss = () => setShowWarning(false);
  const staySignedIn = async () => {
    try {
      await session.touch();
    } catch {
      // If touch fails, close anyway — Clerk still handles the eventual expiry.
    }
    setShowWarning(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-expiry-heading"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'color-mix(in srgb, var(--text-primary) 45%, transparent)',
      }}
    >
      <div
        style={{
          maxWidth: 400,
          width: '100%',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          padding: 'clamp(24px, 5vw, 36px)',
          textAlign: 'center',
        }}
      >
        <h2
          id="session-expiry-heading"
          style={{
            fontFamily: displayFont,
            fontStyle: 'italic',
            fontSize: 'clamp(24px, 4vw, 30px)',
            lineHeight: 1.15,
            color: 'var(--text-primary)',
            margin: '0 0 12px 0',
          }}
        >
          Still there?
        </h2>
        <p
          style={{
            fontFamily: bodyFont,
            fontSize: 14,
            lineHeight: 1.6,
            color: 'var(--text-secondary)',
            margin: '0 0 24px 0',
          }}
        >
          Your session is about to time out. Your progress is saved - stay signed in to keep going.
        </p>
        <button
          type="button"
          onClick={staySignedIn}
          style={{
            fontFamily: bodyFont,
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--primary-foreground)',
            background: 'var(--primary)',
            border: 'none',
            borderRadius: 0,
            padding: '0 32px',
            height: 52,
            width: '100%',
            cursor: 'pointer',
          }}
        >
          Stay signed in
        </button>
        <button
          type="button"
          onClick={dismiss}
          style={{
            fontFamily: bodyFont,
            fontSize: 12,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            marginTop: 14,
            padding: 8,
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

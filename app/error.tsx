'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app/error] route-level error caught by boundary', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
    // Fire-and-forget relay to server-side alert dispatcher. Never throws —
    // errors here would suppress the existing log, which must not happen.
    void fetch('/api/alerting/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        boundary: 'error',
        message: error.message,
        digest: error.digest ?? 'none',
      }),
    }).catch(() => {
      // Swallow — the console.error above already captured the event.
    });
  }, [error]);

  return (
    <main
      style={{
        background: 'var(--bg)',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-primary)',
        padding: 24,
        textAlign: 'center',
      }}
    >
      <h1
        style={{
          fontFamily: "'PP Editorial New', Georgia, serif",
          fontStyle: 'italic',
          fontWeight: 300,
          fontSize: 32,
          lineHeight: 1.2,
          margin: 0,
        }}
      >
        something broke.
      </h1>
      <p style={{ fontSize: 16, color: 'var(--text-secondary)', margin: '12px 0 28px' }}>
        it&apos;s not you. give it a second.
      </p>
      <button
        onClick={reset}
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: 'var(--on-primary)',
          background: 'var(--primary)',
          border: 'none',
          borderRadius: 6,
          padding: '10px 20px',
          cursor: 'pointer',
        }}
      >
        try again
      </button>
    </main>
  );
}

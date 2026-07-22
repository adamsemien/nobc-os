'use client';

// TEMPORARY — Sentry verification page. Remove this directory (and
// app/api/sentry-example-api/) once events are confirmed in the Sentry
// dashboard on the preview deploy. Not linked from any navigation.
import { useState } from 'react';

export default function SentryExamplePage() {
  const [serverResult, setServerResult] = useState<string | null>(null);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: 24, margin: 0 }}>Sentry verification (temporary)</h1>
      <p style={{ maxWidth: 480, fontSize: 14 }}>
        Events only send on Vercel production/preview deploys — locally Sentry
        is disabled by design. Remove this page after verifying.
      </p>
      <button
        type="button"
        onClick={() => {
          throw new Error('Sentry example CLIENT error — safe to ignore');
        }}
        style={{ padding: '10px 20px', cursor: 'pointer' }}
      >
        Throw client error
      </button>
      <button
        type="button"
        onClick={async () => {
          const res = await fetch('/api/sentry-example-api');
          setServerResult(`server responded ${res.status} (expected 500)`);
        }}
        style={{ padding: '10px 20px', cursor: 'pointer' }}
      >
        Trigger server error
      </button>
      {serverResult && <p style={{ fontSize: 13 }}>{serverResult}</p>}
    </main>
  );
}

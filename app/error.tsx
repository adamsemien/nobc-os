'use client';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
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

import Link from 'next/link';

export default function NotFound() {
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
      {/* Compass */}
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden style={{ marginBottom: 28 }}>
        <circle cx="28" cy="28" r="25" stroke="var(--border-strong)" strokeWidth="1.5" />
        <path d="M28 14 L33 28 L28 42 L23 28 Z" fill="var(--primary)" />
        <circle cx="28" cy="28" r="2.5" fill="var(--bg)" stroke="var(--primary)" strokeWidth="1.5" />
      </svg>
      <h1
        style={{
          fontFamily: "'PP Editorial New', Georgia, serif",
          fontStyle: 'italic',
          fontWeight: 300,
          fontSize: 38,
          lineHeight: 1.15,
          margin: 0,
        }}
      >
        you wandered off.
      </h1>
      <p style={{ fontSize: 16, color: 'var(--text-secondary)', margin: '12px 0 28px' }}>
        let&apos;s get you back.
      </p>
      <Link
        href="/"
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: 'var(--primary)',
          textDecoration: 'none',
          letterSpacing: '0.02em',
        }}
      >
        → back home
      </Link>
    </main>
  );
}

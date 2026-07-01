import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'signed out - no bad company',
};

const displayFont = "'PP Editorial New', Georgia, serif";
const bodyFont = "'Neue Haas Grotesk Display Pro', 'Helvetica Neue', Arial, sans-serif";

/**
 * Shared sign-out confirmation surface. The neutral landing after a member (or
 * any zone without its own destination) signs out. Kept intentionally minimal
 * and premium: one line of reassurance, one clear way back in. Design tokens
 * only — no raw hex — so it inherits whatever theme the tenant is on.
 */
export default function SignedOutPage() {
  return (
    <main
      style={{
        background: 'var(--bg)',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(48px, 8vw, 96px) 24px',
      }}
    >
      <div style={{ maxWidth: 460, width: '100%', textAlign: 'center' }}>
        <span
          style={{
            fontFamily: bodyFont,
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--primary)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            display: 'block',
            marginBottom: 16,
          }}
        >
          No Bad Company
        </span>
        <h1
          style={{
            fontFamily: displayFont,
            fontSize: 'clamp(30px, 4.5vw, 44px)',
            fontStyle: 'italic',
            lineHeight: 1.12,
            color: 'var(--text-primary)',
            margin: '0 0 16px 0',
          }}
        >
          You&apos;re signed out.
        </h1>
        <p
          style={{
            fontFamily: bodyFont,
            fontSize: 15,
            lineHeight: 1.6,
            color: 'var(--text-secondary)',
            margin: '0 0 32px 0',
          }}
        >
          Your place is saved. Sign back in whenever you&apos;re ready - you&apos;ll pick up right
          where you left off.
        </p>
        <Link
          href="/sign-in"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
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
            textDecoration: 'none',
          }}
        >
          Sign back in
        </Link>
      </div>
    </main>
  );
}

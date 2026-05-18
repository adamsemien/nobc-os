import Link from 'next/link';

/** Footer with links to the three compliance pages.
 *  Order is fixed: Privacy · Terms · Refund Policy. */
export function LegalFooter() {
  const linkStyle: React.CSSProperties = {
    fontSize: 12,
    letterSpacing: '0.04em',
    color: 'var(--text-tertiary)',
    textDecoration: 'none',
  };
  const sep = (
    <span aria-hidden style={{ color: 'var(--text-tertiary)', opacity: 0.5 }}>
      ·
    </span>
  );
  return (
    <footer
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
        padding: '32px 16px 40px',
      }}
    >
      <Link href="/privacy" style={linkStyle}>
        Privacy
      </Link>
      {sep}
      <Link href="/terms" style={linkStyle}>
        Terms
      </Link>
      {sep}
      <Link href="/refund-policy" style={linkStyle}>
        Refund Policy
      </Link>
    </footer>
  );
}

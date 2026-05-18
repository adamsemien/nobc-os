import type { Metadata } from 'next';
import { LegalFooter } from './LegalFooter';

export type LegalSection = {
  heading: string;
  body?: string[];
  bullets?: string[];
};

const SERIF = "'PP Editorial New', Georgia, serif";

/** Shared renderer for /terms, /privacy, /refund-policy.
 *  720px centered · ivory background · editorial type · red-dot bullets. */
export function LegalPage({ title, sections }: { title: string; sections: LegalSection[] }) {
  return (
    <main style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '88px 24px 40px' }}>
        <p
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--primary)',
            margin: 0,
          }}
        >
          Legal
        </p>
        <h1
          style={{
            fontFamily: SERIF,
            fontStyle: 'italic',
            fontWeight: 300,
            fontSize: 46,
            lineHeight: 1.1,
            margin: '14px 0 0',
          }}
        >
          {title}
        </h1>
        <p
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--text-tertiary)',
            margin: '18px 0 0',
          }}
        >
          No Bad Company &nbsp;|&nbsp; Effective: June 1, 2026
        </p>

        <div style={{ marginTop: 52 }}>
          {sections.map((section, i) => (
            <section key={i} style={{ marginBottom: 38 }}>
              <h2
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--text-secondary)',
                  margin: '0 0 16px',
                }}
              >
                {section.heading}
              </h2>
              {section.body?.map((p, j) => (
                <p
                  key={j}
                  style={{
                    fontFamily: SERIF,
                    fontSize: 17,
                    lineHeight: 1.75,
                    color: 'var(--text-primary)',
                    margin: '0 0 16px',
                  }}
                >
                  {p}
                </p>
              ))}
              {section.bullets && (
                <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 0' }}>
                  {section.bullets.map((b, j) => (
                    <li
                      key={j}
                      style={{
                        display: 'flex',
                        gap: 12,
                        fontFamily: SERIF,
                        fontSize: 17,
                        lineHeight: 1.7,
                        marginBottom: 11,
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: 'var(--primary)',
                          marginTop: 11,
                          flexShrink: 0,
                        }}
                      />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <LegalFooter />
      </div>
    </main>
  );
}

export function legalMetadata(title: string): Metadata {
  return {
    title: `${title} — No Bad Company`,
    description: `${title} for No Bad Company.`,
  };
}

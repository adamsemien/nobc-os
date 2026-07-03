'use client';

import Link from 'next/link';
import { useMemo } from 'react';

export function useMemberApplyHref(): string {
  return useMemo(() => {
    const slug = process.env.NEXT_PUBLIC_APPLY_SLUG?.trim();
    return `/apply/${slug && slug.length > 0 ? slug : 'nobc'}`;
  }, []);
}

export function MemberShellNav({
  applyHref,
  theme = 'cream',
}: {
  applyHref: string;
  theme?: 'cream' | 'dark' | 'overlay';
}) {
  const dark = theme === 'dark' || theme === 'overlay'; // light text treatment
  const solidBg = theme === 'dark'; // only 'dark' paints a band
  const overlay = theme === 'overlay'; // floating over a photo — text-shadow for legibility
  return (
    <nav
      className={
        solidBg
          ? 'mx-auto flex max-w-6xl items-center justify-between gap-6 border-b border-events-line-soft bg-events-canvas-raised px-6 pb-6 pt-10 sm:px-8 sm:pt-12'
          : 'mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 pb-6 pt-10 sm:px-8 sm:pt-12'
      }
    >
      <Link
        href="/m/events"
        className={`${
          dark
            ? 'text-[0.65rem] font-normal uppercase tracking-[0.14em] text-events-fg sm:text-[0.7rem] sm:tracking-[0.16em]'
            : 'text-[0.65rem] font-normal uppercase tracking-[0.14em] text-events-ref-ink sm:text-[0.7rem] sm:tracking-[0.16em]'
        }${overlay ? ' [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]' : ''}`}
        // Over a photo, "Company" follows the hero text-mode (light/dark); "No Bad"
        // speaks the brand-accent token below (red on paper, lavender on night -
        // 2-NAV), so the wordmark is always on-brand + legible.
        style={overlay ? { color: 'var(--hero-fg)' } : undefined}
      >
        <span className="text-[var(--ev-brand-accent)]">NO BAD </span>
        <span>COMPANY</span>
      </Link>
      <div className="flex items-center gap-6 sm:gap-8">
        <Link
          href="/m/events"
          className={`${
            dark
              ? 'text-[0.65rem] font-normal uppercase tracking-[0.2em] text-events-fg-soft'
              : 'text-[0.65rem] font-normal uppercase tracking-[0.2em] text-events-ref-ink'
          }${overlay ? ' [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]' : ''}`}
          style={overlay ? { color: 'var(--hero-fg-soft)' } : undefined}
        >
          Events
        </Link>
        <Link
          href="/apply"
          // The Apply CTA resolves through the nav-CTA token slots (2-NAV):
          // paper renders the exact prior treatments (solid brand button on
          // overlay, ink ghost with brand hover elsewhere); night resolves a
          // cream ghost with a lavender hover - red never reaches the plum.
          className={
            overlay
              ? 'border border-[var(--ev-nav-cta-edge)] bg-[var(--ev-nav-cta-bg)] px-3 py-2 text-[0.6rem] font-medium uppercase tracking-[0.22em] text-[var(--ev-nav-cta-ink)] transition-colors hover:border-[var(--ev-nav-cta-hover-bg)] hover:bg-[var(--ev-nav-cta-hover-bg)] hover:text-[var(--ev-nav-cta-hover-ink)] sm:px-4 sm:text-[0.65rem]'
              : dark
                ? 'border border-events-cta-border px-3 py-2 text-[0.6rem] font-medium uppercase tracking-[0.22em] text-events-cta-fg transition-colors hover:border-[var(--ev-accent)] hover:bg-[var(--ev-accent)] hover:text-[var(--ev-on-accent)] sm:px-4 sm:text-[0.65rem]'
                : 'border border-[var(--ev-ink)] px-3 py-2 text-[0.6rem] font-medium uppercase tracking-[0.22em] text-[var(--ev-ink)] transition-colors hover:border-[var(--ev-accent)] hover:bg-[var(--ev-accent)] hover:text-[var(--ev-on-accent)] sm:px-4 sm:text-[0.65rem]'
          }
          style={{ borderRadius: '4px' }}
        >
          Apply
        </Link>
      </div>
    </nav>
  );
}

export function MemberShellFooter({
  applyHref,
  theme = 'cream',
}: {
  applyHref: string;
  theme?: 'cream' | 'dark';
}) {
  const dark = theme === 'dark';
  return (
    <footer
      className={
        dark
          ? 'border-t border-events-line-soft bg-events-canvas-deep'
          : 'border-t border-events-ref-rule bg-events-ref-cream'
      }
    >
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 sm:grid-cols-3 sm:gap-8 sm:px-8 sm:py-16">
        <div>
          <p
            className={
              dark
                ? 'text-[0.65rem] font-normal uppercase tracking-[0.14em] text-events-fg sm:text-[0.7rem] sm:tracking-[0.16em]'
                : 'text-[0.65rem] font-normal uppercase tracking-[0.14em] text-events-ref-ink sm:text-[0.7rem] sm:tracking-[0.16em]'
            }
          >
            <span className="text-[var(--ev-brand-accent)]">NO BAD </span>
            <span>COMPANY</span>
          </p>
        </div>
        <div
          className={
            dark
              ? 'flex flex-col gap-3 text-[0.65rem] font-normal uppercase tracking-[0.18em] text-events-fg-soft'
              : 'flex flex-col gap-3 text-[0.65rem] font-normal uppercase tracking-[0.18em] text-events-ref-ink'
          }
        >
          <Link
            href="/m/events"
            className={dark ? 'w-fit hover:text-events-warm-accent' : 'w-fit hover:text-events-ref-accent'}
          >
            Programme
          </Link>
          <Link href={applyHref} className="w-fit hover:text-[var(--ev-accent)]">
            Apply
          </Link>
        </div>
        <div>
          <a
            href="mailto:team@thenobadcompany.com"
            className={
              dark
                ? 'text-sm font-normal tracking-wide text-events-fg-quiet underline-offset-4 hover:underline'
                : 'text-sm font-normal tracking-wide text-events-ref-muted underline-offset-4 hover:underline'
            }
          >
            team@thenobadcompany.com
          </a>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-6 pb-10 sm:px-8">
        <p
          className={
            dark
              ? 'text-[0.6rem] font-normal uppercase tracking-[0.14em] text-events-fg-quiet'
              : 'text-[0.6rem] font-normal uppercase tracking-[0.14em] text-events-ref-muted'
          }
        >
          <span className="text-[var(--ev-brand-accent)]">No Bad </span>
          <span>Company · By application</span>
        </p>
      </div>
    </footer>
  );
}

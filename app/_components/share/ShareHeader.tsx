/**
 * Centered NoBC wordmark + share folder title. Mirrors the minimal-template
 * editorial header (`app/m/events/[slug]/_components/TemplateMinimal.tsx`).
 *
 * Server component — purely presentational. `brandingOverride.companyName`
 * overrides the wordmark for white-label tenants.
 */
import type { ReactNode } from 'react';

interface Branding {
  companyName?: string;
}

export function ShareHeader({
  title,
  kicker,
  branding,
}: {
  title: string;
  kicker: string;
  branding?: Branding | null;
}) {
  const company = (branding?.companyName ?? '').trim();

  return (
    <header className="mx-auto w-full max-w-3xl px-6 pt-10 text-center">
      <Wordmark company={company} />
      <div className="my-10 h-px w-full bg-[var(--apply-rule)]" aria-hidden />
      <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
        {kicker}
      </p>
      <h1 className="mt-6 text-[clamp(2rem,5vw,3.25rem)] font-normal leading-[1.05] text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
        {title}
      </h1>
    </header>
  );
}

function Wordmark({ company }: { company: string }): ReactNode {
  if (company) {
    return (
      <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
        {company}
      </span>
    );
  }
  return (
    <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
      <span className="text-[var(--nobc-red)]">NO BAD </span>
      <span>COMPANY</span>
    </span>
  );
}

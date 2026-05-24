'use client';

import type { WorkflowPath } from '@/lib/workflows/types';
import { renderPathSummary } from '@/lib/workflows/render';

/** Surfaces the workflow paths for an event as an elevated "How to attend"
 *  card — the ways a guest can get in, previewed before they click into the
 *  flow (which lives in EventAccessFlow). Cream paper surface so it reads as
 *  part of the page, not a dark drawer. Read-only. */
export function WorkflowPathsCard({ paths }: { paths: WorkflowPath[] }) {
  if (!paths || paths.length === 0) return null;

  return (
    <section className="rounded-md border border-[var(--apply-rule)] bg-events-paper-card p-6 shadow-[0_2px_12px_rgba(28,16,8,0.05)] sm:p-8">
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
        How to attend
      </p>
      <div className="mt-5 flex flex-col">
        {paths.map((p, i) => (
          <div
            key={p.id}
            className={`flex gap-4 py-4 ${i > 0 ? 'border-t border-[var(--apply-rule)]' : ''}`}
          >
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--apply-rule)] text-[11px] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[19px] italic leading-snug text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
                {p.label}
              </p>
              {p.description ? (
                <p className="mt-1 text-[14px] leading-relaxed text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
                  {p.description}
                </p>
              ) : null}
              <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                {renderPathSummary(p)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

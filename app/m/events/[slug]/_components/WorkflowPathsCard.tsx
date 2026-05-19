'use client';

import type { WorkflowPath } from '@/lib/workflows/types';
import { renderPathSummary } from '@/lib/workflows/render';

/** Surfaces the workflow paths for an event as clickable CTAs.
 *  This is read-only — the actual flow lives in EventAccessFlow (paid/free
 *  routes are still wired through the eventAccess JSON). For V1 this is a
 *  "you have these ways in" preview that helps non-members understand their
 *  options before they click into the existing flow. */
export function WorkflowPathsCard({ paths }: { paths: WorkflowPath[] }) {
  if (!paths || paths.length === 0) return null;

  return (
    <section
      className="rounded-lg border p-5 sm:p-6"
      style={{ borderColor: 'var(--events-line-soft)', background: 'var(--events-card)' }}
    >
      <p
        className="mb-4 text-[0.6rem] uppercase tracking-[0.22em]"
        style={{ color: 'var(--events-fg-quiet)' }}
      >
        How to attend
      </p>
      <div className="flex flex-col gap-3">
        {paths.map((p) => (
          <div
            key={p.id}
            className="rounded-md border p-4"
            style={{ borderColor: 'var(--events-line-soft)' }}
          >
            <p
              className="text-base italic"
              style={{ color: 'var(--events-fg)', fontFamily: 'var(--font-display)' }}
            >
              {p.label}
            </p>
            {p.description ? (
              <p
                className="mt-0.5 text-sm leading-relaxed"
                style={{ color: 'var(--events-fg-soft)' }}
              >
                {p.description}
              </p>
            ) : null}
            <p
              className="mt-2 text-xs leading-relaxed"
              style={{ color: 'var(--events-fg-quiet)' }}
            >
              {renderPathSummary(p)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

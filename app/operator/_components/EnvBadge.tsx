'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { AppEnvInfo } from '@/lib/app-env';

/**
 * "Which instance am I in" badge + the consolidated environment switcher. Colour is
 * semantic (danger=production, warning=sandbox, muted=local) so a glance answers
 * "am I about to write to prod?". Click to see every environment with a you-are-here
 * marker and the current branch/commit.
 */
export function EnvBadge({ info }: { info: AppEnvInfo }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative mr-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-opacity hover:opacity-90"
        style={{ color: info.colorVar, borderColor: info.colorVar, background: info.softVar }}
        aria-label={`Environment: ${info.label}. Open environment switcher.`}
        aria-expanded={open}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: info.colorVar }} aria-hidden />
        {info.label}
        <ChevronDown className="h-3 w-3" aria-hidden />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-border p-1.5 shadow-xl"
          style={{ background: 'var(--surface-elevated, var(--surface))' }}
          role="menu"
        >
          <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
            Environments
          </div>
          {info.environments.map((env) => (
            <a
              key={env.label}
              href={env.url}
              target={env.current ? undefined : '_blank'}
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              role="menuitem"
            >
              <span className="flex min-w-0 flex-col">
                <span className="font-medium text-text-primary">{env.label}</span>
                <span className="truncate text-[11px] text-text-muted">
                  {env.url.replace(/^https?:\/\//, '')}
                </span>
              </span>
              {env.current && (
                <Check className="h-4 w-4 shrink-0" style={{ color: info.colorVar }} aria-label="current" />
              )}
            </a>
          ))}
          {(info.branch || info.sha) && (
            <div className="mt-1 border-t border-border px-2 pb-1 pt-1.5 font-mono text-[11px] text-text-muted">
              {info.branch ?? ''}
              {info.branch && info.sha ? ' · ' : ''}
              {info.sha ?? ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

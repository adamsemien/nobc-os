'use client';

import { Wrench } from 'lucide-react';
import { DEV_TOOLBAR_OPEN_EVENT, DEV_TOOLBAR_OPEN_STORAGE_KEY } from '../_components/DevToolbar';

/**
 * Settings → Developer entry point. Opens the global DevToolbar (mounted in the
 * operator layout) without the ⌘⇧⌥D shortcut: persists the open flag and
 * dispatches the open event the toolbar listens for. Rendered only for dev
 * users — the parent server component gates on DEV_USER_IDS.
 */
export function OpenDevToolbarButton() {
  const openDevToolbar = () => {
    try {
      localStorage.setItem(DEV_TOOLBAR_OPEN_STORAGE_KEY, 'true');
    } catch {}
    window.dispatchEvent(new CustomEvent(DEV_TOOLBAR_OPEN_EVENT));
  };

  return (
    <button
      type="button"
      onClick={openDevToolbar}
      className="group flex w-full max-w-md flex-col gap-3 rounded-lg border border-border bg-card p-5 text-left transition-colors hover:border-primary"
    >
      <div className="flex items-center gap-3">
        <span
          className="inline-flex h-8 w-8 items-center justify-center rounded-md"
          style={{ background: 'var(--primary-soft, var(--muted))', color: 'var(--primary)' }}
        >
          <Wrench className="h-4 w-4" aria-hidden />
        </span>
        <h3 className="text-base font-semibold text-text-primary">Dev Tools &amp; QA Panel</h3>
      </div>
      <p className="text-sm leading-relaxed text-text-secondary">
        Seed demo data, run AI QA personas, and play QA missions. Also opens anywhere with ⌘⇧⌥D.
      </p>
      <span className="mt-auto text-xs font-medium text-primary opacity-70 transition-opacity group-hover:opacity-100">
        Open Dev Tools →
      </span>
    </button>
  );
}

'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * 420px right-rail drawer on desktop, full-screen on mobile.
 * 220ms in / 180ms out, Esc closes, focus trap, scrim on mobile.
 *
 * URL syncing is opt-in via `urlParam`: when set, opening/closing the drawer
 * also updates `?${urlParam}=${id}` so the state is deep-linkable.
 */
export function DetailDrawer({
  open,
  onClose,
  title,
  children,
  footer,
  width = 420,
  ariaLabel,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  ariaLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  // Hold the latest onClose in a ref so the focus effect below depends only on
  // `open`. Consumers commonly pass an inline onClose (new identity every
  // render); if the effect depended on it, every keystroke in a controlled
  // field would tear down and re-arm focus — yanking focus out of the field
  // and onto whatever opened the drawer. See the focus-flicker bug fix.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    lastFocused.current = (document.activeElement as HTMLElement) ?? null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key === 'Tab') {
        // Focus trap
        const root = containerRef.current;
        if (!root) return;
        const focusables = root.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    // Focus first focusable
    const t = window.setTimeout(() => {
      const root = containerRef.current;
      const f = root?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      f?.focus();
    }, 50);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      lastFocused.current?.focus?.();
    };
  }, [open]);

  return (
    <>
      {/* Scrim — visible on mobile, subtle dim on desktop */}
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-40 transition-opacity duration-[180ms] ${
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        style={{
          background:
            'color-mix(in srgb, var(--foreground, #000) 18%, transparent)',
        }}
      />
      <aside
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? (typeof title === 'string' ? title : 'Details')}
        className="fixed right-0 top-0 z-50 flex h-screen w-full flex-col border-l border-border shadow-xl"
        style={{
          maxWidth: `min(100vw, ${width}px)`,
          background: 'var(--surface-elevated, var(--surface))',
          transition:
            'transform 220ms cubic-bezier(0.2,0,0,1), opacity 220ms cubic-bezier(0.2,0,0,1)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          opacity: open ? 1 : 0,
          willChange: 'transform',
        }}
      >
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          {typeof title === 'string' || !title ? (
            <span
              className="text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              {title ?? 'Details'}
            </span>
          ) : (
            title
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-muted hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {children}
        </div>
        {footer ? (
          <div
            className="shrink-0 border-t border-border p-3"
            style={{ background: 'var(--surface)' }}
          >
            {footer}
          </div>
        ) : null}
      </aside>
    </>
  );
}

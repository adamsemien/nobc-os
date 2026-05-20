'use client';

import { useEffect } from 'react';

export function ConfirmModal({
  title,
  subtitle,
  confirmLabel,
  cancelLabel = 'Cancel',
  confirmTone = 'primary',
  onConfirm,
  onCancel,
  busy = false,
}: {
  title: string;
  subtitle?: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmTone?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[200] flex items-center justify-center px-4"
      style={{
        background: 'color-mix(in srgb, var(--foreground, #000) 38%, transparent)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border shadow-xl"
        style={{ background: 'var(--surface-elevated, var(--surface))' }}
      >
        <div className="p-5">
          <h3 className="text-base font-semibold text-text-primary">{title}</h3>
          {subtitle ? (
            <p className="mt-1.5 text-sm text-text-secondary">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-muted disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold text-on-primary disabled:opacity-50 ${
              confirmTone === 'danger'
                ? 'bg-danger hover:opacity-90'
                : 'bg-primary hover:bg-primary-hover'
            }`}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

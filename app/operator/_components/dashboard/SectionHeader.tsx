import type { ReactNode } from 'react';

/**
 * Editorial section label: a `--primary` icon, a tracked-out uppercase title, a
 * hairline rule that fills the remaining width, and an optional action link.
 */
export function SectionHeader({
  icon,
  title,
  action,
}: {
  icon?: ReactNode;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-[18px] flex items-center gap-4">
      {icon ? (
        <span className="flex items-center" style={{ color: 'var(--primary)' }}>
          {icon}
        </span>
      ) : null}
      <span
        className="text-[11.5px] font-semibold uppercase tracking-[0.2em]"
        style={{ color: 'var(--text-secondary)' }}
      >
        {title}
      </span>
      <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
      {action}
    </div>
  );
}

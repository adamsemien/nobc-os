import type { ReactNode } from 'react';

/**
 * Editorial section label: a `--primary` icon, a tracked-out uppercase title, a
 * hairline rule that fills the remaining width, and an optional action link.
 *
 * `folio` (e.g. "01") renders a mono section number before the label — hidden
 * in every theme except editorial, where it reads as a broadsheet folio.
 */
export function SectionHeader({
  icon,
  title,
  action,
  folio,
}: {
  icon?: ReactNode;
  title: string;
  action?: ReactNode;
  folio?: string;
}) {
  return (
    <div className="mb-[18px] flex items-center gap-4">
      {folio ? (
        <span className="op-folio" aria-hidden>
          {folio}
        </span>
      ) : null}
      {icon ? (
        <span className="flex items-center" style={{ color: 'var(--primary)' }}>
          {icon}
        </span>
      ) : null}
      <span
        className="text-[13px] font-semibold uppercase tracking-[0.2em]"
        style={{ color: 'var(--text-secondary)' }}
      >
        {title}
      </span>
      <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
      {action}
    </div>
  );
}

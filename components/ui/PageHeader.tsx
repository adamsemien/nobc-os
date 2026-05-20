import Link from 'next/link';
import type { ReactNode } from 'react';

export type Crumb = { href?: string; label: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className="mb-3 text-xs">
      <ol
        className="flex flex-wrap items-center gap-1.5"
        style={{ color: 'var(--text-muted)' }}
      >
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
              {c.href && !last ? (
                <Link
                  href={c.href}
                  className="hover:underline"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {c.label}
                </Link>
              ) : (
                <span
                  style={{
                    color: last
                      ? 'var(--text-secondary)'
                      : 'var(--text-muted)',
                  }}
                >
                  {c.label}
                </span>
              )}
              {!last ? (
                <span aria-hidden className="opacity-50">
                  /
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function PageHeader({
  title,
  subtitle,
  crumbs,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  crumbs?: Crumb[];
  action?: ReactNode;
}) {
  return (
    <header className="mb-6">
      {crumbs && crumbs.length > 0 ? <Breadcrumbs items={crumbs} /> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold tracking-tight text-text-primary font-[family-name:var(--font-dm-sans)]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>
          ) : null}
        </div>
        {action ? (
          <div className="flex shrink-0 items-center gap-2">{action}</div>
        ) : null}
      </div>
      <hr className="mt-4 border-border" />
    </header>
  );
}

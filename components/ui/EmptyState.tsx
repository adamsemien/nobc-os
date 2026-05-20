import type { ComponentType, ReactNode } from 'react';
import { Inbox } from 'lucide-react';

type LucideIcon = ComponentType<{ className?: string; strokeWidth?: number; size?: number | string }>;

export function EmptyState({
  icon: Icon = Inbox,
  title,
  subtitle,
  action,
  compact = false,
  className = '',
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  if (compact) {
    return (
      <div
        className={`py-6 text-center ${className}`}
        style={{ color: 'var(--text-secondary)' }}
      >
        <p className="text-[15px] font-medium text-text-primary">{title}</p>
        {subtitle ? (
          <p className="mt-1 text-[13px] text-text-secondary">{subtitle}</p>
        ) : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    );
  }
  return (
    <div
      className={`page-fade-in flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background/50 px-6 py-16 text-center ${className}`}
      style={{ borderRadius: '8px' }}
    >
      <div
        className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-border"
        style={{ background: 'var(--raised, var(--surface-elevated, var(--surface)))' }}
      >
        <Icon className="h-6 w-6 text-text-tertiary" strokeWidth={1.5} />
      </div>
      <p className="text-[17px] font-semibold tracking-tight text-text-primary">
        {title}
      </p>
      {subtitle ? (
        <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-text-secondary">
          {subtitle}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

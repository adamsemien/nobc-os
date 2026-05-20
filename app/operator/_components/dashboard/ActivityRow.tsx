import { actionColor, actionLabel, formatRelativeTime } from './format';

/**
 * A single editorial row in the "Lately" audit-log feed.
 *
 * The leading 2px vertical rule (color from `actionColor`) replaces the dot pattern —
 * it reads as a magazine accent rather than a notification badge.
 */
export function ActivityRow({
  action,
  entityType,
  createdAt,
}: {
  action: string;
  entityType: string;
  createdAt: Date;
}) {
  return (
    <li className="flex items-start gap-4 py-3">
      <span
        aria-hidden
        className="mt-1.5 inline-block h-3 w-[2px] shrink-0"
        style={{ background: actionColor(action) }}
      />
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-sm leading-snug"
          style={{ color: 'var(--text-primary)' }}
        >
          {actionLabel(action)}
        </div>
        <div className="mt-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {entityType.toLowerCase()} · {formatRelativeTime(createdAt)}
        </div>
      </div>
    </li>
  );
}

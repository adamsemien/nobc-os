import { actionColor, actionLabel, formatRelativeTime } from './format';

/**
 * A row in the "Recent activity" feed: a small colored tick (from `actionColor`),
 * the bold action label, and the relative time. Dividers are drawn by the parent
 * feed except after the last row (`last`).
 */
export function ActivityRow({
  action,
  createdAt,
  last = false,
}: {
  action: string;
  createdAt: Date;
  last?: boolean;
}) {
  return (
    <div
      className="flex gap-[13px] py-[14px]"
      style={last ? undefined : { borderBottom: '1px solid var(--border)' }}
    >
      <span
        aria-hidden
        className="mt-[6px] h-[7px] w-[7px] shrink-0 rounded-full"
        style={{ background: actionColor(action) }}
      />
      <div className="min-w-0 flex-1 text-[13.5px]">
        <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          {actionLabel(action)}
        </div>
        <div className="mt-[2px] text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
          {formatRelativeTime(createdAt)}
        </div>
      </div>
    </div>
  );
}

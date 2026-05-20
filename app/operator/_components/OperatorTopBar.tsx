import { NotificationCenter } from '@/components/notifications/NotificationCenter';

/**
 * Slim top bar pinned to the right edge — currently just the notification bell.
 * Rendered absolutely in the operator layout so existing page chrome stays
 * intact (operator pages all have their own `<PageHeader>`).
 */
export function OperatorTopBar() {
  return (
    <div
      className="pointer-events-none fixed top-2 right-3 z-30 flex items-center gap-2"
      aria-label="Operator top bar"
    >
      <div className="pointer-events-auto">
        <NotificationCenter />
      </div>
    </div>
  );
}

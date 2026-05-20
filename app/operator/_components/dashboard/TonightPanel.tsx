import Link from 'next/link';
import { Avatar } from '../Avatar';
import { ScoreBadge } from '../ScoreBadge';
import { fmtTime, formatRelativeTime } from './format';

export type TonightEvent = {
  id: string;
  slug: string;
  title: string;
  startAt: Date;
  location: string | null;
  capacity: number | null;
};

export type PendingApp = {
  id: string;
  fullName: string;
  email: string;
  archetype: string | null;
  aiScore: number | null;
  city: string | null;
  createdAt: Date;
};

/**
 * The single urgent moment on the operator home.
 *
 * Renders an editorial feature block when there is either:
 *  - one or more events happening today, or
 *  - pending applications waiting for review.
 *
 * Tonight is the only place on this page where a filled `--primary` button (The Room →) is allowed.
 * Returns null when there is nothing tonight and no pending apps.
 */
export function TonightPanel({
  todaysEvents,
  pendingApps,
}: {
  todaysEvents: TonightEvent[];
  pendingApps: PendingApp[];
}) {
  if (todaysEvents.length === 0 && pendingApps.length === 0) return null;

  return (
    <section
      className="border-y py-10"
      style={{ borderColor: 'var(--border)' }}
      aria-label="Tonight"
    >
      <div
        className="mb-6 text-[10px] font-medium uppercase tracking-[0.28em]"
        style={{ color: 'var(--primary)' }}
      >
        Tonight
      </div>

      {todaysEvents.length > 0 ? (
        <div className="space-y-6">
          {todaysEvents.map((e) => (
            <div
              key={e.id}
              className="flex flex-wrap items-end justify-between gap-4"
            >
              <div className="min-w-0">
                <Link
                  href={`/operator/events/${e.id}`}
                  className="block truncate text-3xl leading-tight transition-opacity hover:opacity-80 md:text-4xl"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 400,
                    color: 'var(--text-primary)',
                  }}
                >
                  {e.title}
                </Link>
                <div
                  className="mt-1 text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {fmtTime(e.startAt)}
                  {e.location ? ` · ${e.location}` : ''}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <a
                  href={`/check-in/${e.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 border px-4 py-2 text-xs font-medium transition-opacity hover:opacity-80"
                  style={{
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                    borderRadius: 'var(--radius-base)',
                  }}
                >
                  Check In
                </a>
                <Link
                  href={`/operator/events/${e.id}/room`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-90"
                  style={{
                    background: 'var(--primary)',
                    color: 'var(--on-primary)',
                    borderRadius: 'var(--radius-base)',
                  }}
                >
                  The Room →
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {pendingApps.length > 0 ? (
        <div className={todaysEvents.length > 0 ? 'mt-10' : ''}>
          <div
            className="mb-3 text-[10px] font-medium uppercase tracking-[0.22em]"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Waiting on you
          </div>
          <ul className="space-y-1">
            {pendingApps.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/operator/applications/${a.id}`}
                  className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface"
                >
                  <Avatar name={a.fullName} email={a.email} size={32} />
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate text-sm"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {a.fullName}
                    </div>
                    <div
                      className="truncate text-xs"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      {a.archetype ?? 'archetype TBD'}
                      {a.city ? ` · ${a.city}` : ''}
                    </div>
                  </div>
                  <ScoreBadge value={a.aiScore} size="sm" />
                  <span
                    className="hidden text-xs sm:inline"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {formatRelativeTime(a.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

import Link from 'next/link';
import { ArrowRight, MapPin, QrCode } from 'lucide-react';
import { GlassPanel } from './GlassPanel';
import { CapacityBar } from './CapacityBar';
import { fmtTime } from './format';

export type TonightEvent = {
  id: string;
  slug: string;
  title: string;
  startAt: Date;
  location: string | null;
  capacity: number | null;
  confirmed: number;
};

/**
 * The "Tonight" band: one frosted-glass panel split into a gig per event
 * happening today (a hairline divides them). Each gig shows a `--primary` "when"
 * eyebrow, serif title, location, capacity, and the Check-in / The Room actions.
 * The Room is an ink (op-btn-primary) button — never red.
 *
 * Returns null when nothing is on tonight.
 */
export function TonightPanel({ events }: { events: TonightEvent[] }) {
  if (events.length === 0) return null;

  return (
    <GlassPanel className="grid grid-cols-1 md:grid-cols-2">
      {events.map((e, i) => (
        <div
          key={e.id}
          className={`px-[32px] py-[30px] ${i > 0 ? 'border-t md:border-l md:border-t-0' : ''}`}
          style={i > 0 ? { borderColor: 'var(--border)' } : undefined}
        >
          <div
            className="text-[11px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: 'var(--primary)' }}
          >
            Tonight · {fmtTime(e.startAt)}
          </div>
          <h3
            className="mb-[6px] mt-3 text-[30px] leading-[1.04]"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
            }}
          >
            {e.title}
          </h3>
          <div
            className="flex items-center gap-[7px] text-[13px]"
            style={{ color: 'var(--text-secondary)' }}
          >
            <MapPin className="h-[14px] w-[14px]" aria-hidden />
            {e.location ?? 'Location TBD'}
          </div>
          <div className="my-5">
            <CapacityBar confirmed={e.confirmed} capacity={e.capacity} />
          </div>
          <div className="flex gap-[10px]">
            <a
              href={`/check-in/${e.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="op-btn"
            >
              <QrCode className="h-4 w-4" aria-hidden />
              Check in
            </a>
            <Link href={`/operator/events/${e.id}/room`} className="op-btn op-btn-primary">
              The Room
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      ))}
    </GlassPanel>
  );
}

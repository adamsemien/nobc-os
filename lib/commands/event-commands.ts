/** Dynamic event commands for the Cmd+K palette.
 *
 *  Events are workspace-scoped DB rows, not static registry entries. The
 *  operator layout fetches them; the palette builds commands at render time.
 *  Past events carry a right-aligned month-year stamp so they read distinct
 *  from upcoming ones. */
import type { Command } from './types';

export interface EventLite {
  id: string;
  title: string;
  /** ISO string — the Event.startAt DateTime serialized server → client. */
  startAt: string;
  /** 'DRAFT' | 'PUBLISHED' | 'CANCELLED'. */
  status: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/** Maps events to palette commands. Selecting one jumps to its detail page. */
export function buildEventCommands(events: EventLite[], now: number): Command[] {
  return events.map((event) => {
    const isPast = new Date(event.startAt).getTime() < now;
    const statusHint =
      event.status === 'DRAFT' ? 'Draft' : event.status === 'CANCELLED' ? 'Cancelled' : '';
    const description = isPast
      ? statusHint || undefined
      : [formatDate(event.startAt), statusHint].filter(Boolean).join(' · ');

    return {
      id: `event.${event.id}`,
      name: event.title,
      description,
      keywords: ['event'],
      group: 'event',
      trailing: isPast ? formatMonthYear(event.startAt) : undefined,
      execute: (ctx) => {
        ctx.router.push(`/operator/events/${event.id}`);
        ctx.closeCommandPalette();
      },
    } satisfies Command;
  });
}

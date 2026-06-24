/**
 * Timezone helpers for event date/time.
 *
 * Events run from Austin, so every stored `startAt`/`endAt` (a UTC instant) is
 * read, displayed, and entered in Central (America/Chicago) - matching the
 * convention already used by lib/ticket-view.ts and lib/email-templates.ts.
 *
 * `Date.getHours()/getDate()/getFullYear()` and an `Intl.DateTimeFormat` with no
 * `timeZone` both read the *ambient* zone (UTC on the Vercel server, the
 * viewer's zone in the browser), which drifts an evening Central event into the
 * next UTC day. These helpers pin the zone instead. Pure `Intl` - no deps, safe
 * on both server and client.
 */

export const EVENT_TZ = 'America/Chicago';

/** Wall-clock parts of a UTC instant as seen in `timeZone` (all zero-padded strings). */
function zonedParts(instant: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  // Some ICU builds emit "24" for midnight with hour12:false - normalize to "00".
  const hour = map.hour === '24' ? '00' : map.hour;
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour,
    minute: map.minute,
    second: map.second,
  };
}

/** UTC instant -> "YYYY-MM-DD" date as seen in `timeZone` (for a <input type=date>). */
export function toZonedDateInput(instant: Date, timeZone = EVENT_TZ): string {
  const p = zonedParts(instant, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** UTC instant -> "HH:mm" 24h time as seen in `timeZone` (for a <input type=time>). */
export function toZonedTimeInput(instant: Date, timeZone = EVENT_TZ): string {
  const p = zonedParts(instant, timeZone);
  return `${p.hour}:${p.minute}`;
}

/** Offset (ms) between `timeZone`'s wall clock and UTC at a given instant. */
function tzOffsetMs(instantMs: number, timeZone: string): number {
  const p = zonedParts(new Date(instantMs), timeZone);
  const wallAsUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return wallAsUtc - instantMs;
}

/**
 * Interpret a *naive* wall-clock string ("YYYY-MM-DD" or "YYYY-MM-DDTHH:mm") as
 * a time in `timeZone` and return the matching UTC instant. DST-correct: the
 * offset is read from Intl at the resolved instant, so e.g. 9:30 AM Central on
 * 2026-07-11 (CDT, UTC-5) -> 2026-07-11T14:30:00.000Z.
 */
export function zonedWallClockToUtc(wallClock: string, timeZone = EVENT_TZ): Date {
  const [datePart, timePart = '00:00'] = wallClock.split('T');
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi] = timePart.split(':').map(Number);

  // Treat the digits as if they were UTC, then subtract the zone's offset.
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const offset = tzOffsetMs(asUtc, timeZone);
  let utc = asUtc - offset;
  // Re-check the offset at the resolved instant to handle DST transitions.
  const offset2 = tzOffsetMs(utc, timeZone);
  if (offset2 !== offset) utc = asUtc - offset2;
  return new Date(utc);
}

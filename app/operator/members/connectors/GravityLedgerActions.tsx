'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The one primary action per ledger row. Posts to the real comp write-path
 * (`/api/operator/events/[id]/comp`) against the soonest upcoming event, then shows
 * inline confirmation. No optimistic lie: the button only flips to ✓ on a real 2xx.
 * The server `requireRole(STAFF)` on the route is the actual boundary.
 */
type Queue = 'earned_comp' | 'win_back' | 'get_in_room';

const LABEL: Record<Queue, string> = {
  earned_comp: 'Comp Access',
  win_back: 'Invite back',
  get_in_room: 'Invite',
};
const DONE: Record<Queue, string> = {
  earned_comp: 'Comped',
  win_back: 'Invited',
  get_in_room: 'Invited',
};

export function GravityLedgerActions({
  memberName,
  email,
  queue,
  eventId,
  eventTitle,
}: {
  memberName: string;
  email: string;
  queue: Queue;
  eventId: string | null;
  eventTitle: string | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  if (!eventId) {
    return <span className="text-xs text-text-muted">Publish an upcoming event to act</span>;
  }

  async function act() {
    setState('busy');
    const [firstName, ...rest] = memberName.split(' ');
    try {
      const res = await fetch(`/api/operator/events/${eventId}/comp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName || memberName,
          lastName: rest.join(' ') || '—',
          email,
          compType: 'Other',
          note: `From the Gravity Ledger (${queue}).`,
        }),
      });
      if (!res.ok) {
        setState('error');
        return;
      }
      setState('done');
      router.refresh();
    } catch {
      setState('error');
    }
  }

  if (state === 'done') {
    return (
      <span className="text-sm text-text-secondary">
        {DONE[queue]} for {eventTitle} ✓
      </span>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={act}
        disabled={state === 'busy'}
        aria-label={`${LABEL[queue]} for ${memberName}${eventTitle ? ` to ${eventTitle}` : ''}`}
        className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {state === 'busy' ? '…' : LABEL[queue]}
      </button>
      {state === 'error' && (
        <button type="button" onClick={act} className="text-xs text-text-muted underline">
          Couldn’t complete — try again
        </button>
      )}
    </div>
  );
}

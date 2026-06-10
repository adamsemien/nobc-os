import Link from 'next/link';
import { OperatorRole } from '@prisma/client';
import { requireRolePage } from '@/lib/operator-role';
import { getGravityLedger, type LedgerRow, type LedgerView } from '@/lib/gravity-ledger-data';
import type { GravityQueue } from '@/lib/gravity-ledger';
import { PageHeader } from '../../_components/PageHeader';
import { Avatar } from '../../_components/Avatar';
import { GravityLedgerActions } from './GravityLedgerActions';

// The Gravity Ledger — who's driving the room and the revenue, as three action queues.
// Spec: _context/16-member-intelligence/UI-GRAVITY-LEDGER.md. Ranks by CAPTURED dollars
// driven (never a centrality score — see the falsification in lib/member-connections.ts).
// Operator-internal only; never sponsor-facing.

const QUEUE_META: Record<GravityQueue, { eyebrow: string; subline: string }> = {
  earned_comp: { eyebrow: 'Earned a comp', subline: 'Their pull filled seats. Reward it.' },
  win_back: { eyebrow: 'Worth winning back', subline: 'Their people still come. They’ve stopped.' },
  get_in_room: { eyebrow: 'Get them in the room', subline: 'Proven pull, no spot reserved yet.' },
};
const QUEUE_ORDER: GravityQueue[] = ['earned_comp', 'win_back', 'get_in_room'];

const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;

function evidenceLine(row: LedgerRow, queue: GravityQueue, upcomingTitle: string | null, now: Date): string {
  const parts: string[] = [];
  if (row.broughtCount > 0) {
    parts.push(
      `Brought ${row.broughtCount} as plus-one${row.broughtCount > 1 ? 's' : ''}` +
        (row.broughtStuck > 0 ? `; ${row.broughtStuck} now come on their own` : ''),
    );
  }
  if (row.referredCount > 0) {
    parts.push(`Referred ${row.referredCount}` + (row.referredStuck > 0 ? `; ${row.referredStuck} stuck` : ''));
  }
  let line = parts.join('. ') + (parts.length ? '.' : '');
  if (queue === 'win_back' && row.lastCheckInAt) {
    const days = Math.floor((now.getTime() - row.lastCheckInAt.getTime()) / 86_400_000);
    line += ` Hasn’t checked in in ${days} days.`;
  }
  if (queue === 'get_in_room' && upcomingTitle) line += ` Not on the list for ${upcomingTitle}.`;
  return line;
}

function Row({
  row,
  queue,
  view,
  now,
}: {
  row: LedgerRow;
  queue: GravityQueue;
  view: LedgerView;
  now: Date;
}) {
  return (
    <li className="border-b border-border py-5 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <Link href={`/operator/members/${row.memberId}`} className="flex min-w-0 items-center gap-3">
          <Avatar name={row.name} email={row.email} size={36} />
          <div className="min-w-0">
            <div className="truncate font-medium text-text-primary">{row.name}</div>
          </div>
        </Link>
        {view.workspaceHasRevenue ? (
          <div className="shrink-0 text-right tabular-nums text-text-primary">
            {dollars(row.dollarsCents)} <span className="text-text-muted">captured</span>
          </div>
        ) : (
          <div className="shrink-0 text-right tabular-nums text-text-primary">
            {row.broughtStuck + row.referredStuck} <span className="text-text-muted">stuck</span>
          </div>
        )}
      </div>

      <p className="mt-1.5 text-sm text-text-secondary">{evidenceLine(row, queue, view.upcoming?.title ?? null, now)}</p>

      {row.receipts.length > 0 && (
        <details className="mt-2 group">
          <summary className="cursor-pointer list-none text-sm text-text-muted">
            <span className="inline-block transition-transform group-open:rotate-90">▸</span> Receipts
          </summary>
          <ul className="mt-2 space-y-1 pl-4 text-sm text-text-muted">
            {row.receipts.map((r) => (
              <li key={`${r.edge}-${r.memberId}`}>
                <Link href={`/operator/members/${r.memberId}`} className="text-text-secondary hover:underline">
                  {r.name}
                </Link>
                {' — '}
                {r.edge === 'plus-one' ? `plus-one${r.originEvent ? ` at ${r.originEvent}` : ''}` : 'referred'}
                {' · '}
                {r.checkIns} check-in{r.checkIns === 1 ? '' : 's'}
                {view.workspaceHasRevenue && r.spendCents > 0 ? ` · ${dollars(r.spendCents)} captured` : ''}
                {!r.stuck ? ' · not yet stuck' : ''}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-3 flex items-center gap-4">
        <GravityLedgerActions
          memberName={row.name}
          email={row.email}
          queue={queue}
          eventId={view.upcoming?.id ?? null}
          eventTitle={view.upcoming?.title ?? null}
        />
        <Link href={`/operator/members/${row.memberId}`} className="text-sm text-text-muted hover:underline">
          View record →
        </Link>
      </div>
    </li>
  );
}

export default async function ConnectorsPage() {
  const { workspaceId } = await requireRolePage(OperatorRole.READ_ONLY);
  const now = new Date();
  const view = await getGravityLedger(workspaceId, now);

  const populatedQueues = QUEUE_ORDER.filter((q) => view.queues[q].length > 0);

  return (
    <div className="px-6 pb-16 pt-8 sm:px-10 lg:px-14 xl:px-20">
      <PageHeader
        crumbs={[{ href: '/operator/members', label: 'Members' }, { label: 'Connectors' }]}
        title="Connectors"
        subtitle="Who’s driving your room — and your revenue."
      />

      {populatedQueues.length === 0 ? (
        view.hasEdgesButNoneCleared ? (
          <div className="mt-10 max-w-xl">
            <h2 className="font-medium text-text-primary">Pull is forming.</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Plus-one and referral edges are on the books, but no one has hit two check-ins of their own yet —
              that’s the bar for “stuck.” Nothing to act on until they do.
            </p>
          </div>
        ) : (
          <div className="mt-10 max-w-xl">
            <h2 className="font-medium text-text-primary">No provable pull yet.</h2>
            <p className="mt-2 text-sm text-text-secondary">
              This ledger builds itself from Event Access: plus-ones create brought edges when they check in, and
              referrals create referred edges. Set a referrer on a member record to start the graph.
            </p>
            <Link
              href="/operator/members"
              className="mt-4 inline-block rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-white"
            >
              Open Members
            </Link>
          </div>
        )
      ) : (
        <div className="mt-8 space-y-12">
          {populatedQueues.map((q) => (
            <section key={q} aria-label={QUEUE_META[q].eyebrow}>
              <div className="text-xs font-medium uppercase tracking-widest text-text-muted">{QUEUE_META[q].eyebrow}</div>
              <div className="mt-1 text-sm text-text-muted">{QUEUE_META[q].subline}</div>
              <ul className="mt-3">
                {view.queues[q].slice(0, 8).map((row) => (
                  <Row key={row.memberId} row={row} queue={q} view={view} now={now} />
                ))}
              </ul>
              {view.queues[q].length > 8 && (
                <div className="mt-2 text-sm text-text-muted">Showing 8 of {view.queues[q].length}.</div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

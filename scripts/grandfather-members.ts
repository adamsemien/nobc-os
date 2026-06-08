/** Grandfather backfill for the approval-bypass cleanup (member-intelligence).
 *
 *  Two independent, idempotent passes. SAFE BY DEFAULT: dry-run unless --execute.
 *
 *  PART 1 — flag legacy bypass-minted APPROVED members (DEFAULT ON, NO DEMOTE).
 *    Before PR1, several paths (plus-one, walk-in, checkout) could mint a Member straight
 *    to APPROVED without going through the approval gate. Both legitimate approval paths
 *    (lib/applications/approve.ts and promoteMemberToApproved) stamp `approvedAt`, so a row
 *    with status=APPROVED AND approvedAt IS NULL is a precise "legacy bypass" signal.
 *    This pass FLAGS those rows by writing a `_grandfather` marker into fieldProvenance —
 *    it does NOT change status/approved (no demote, per instruction). Idempotent: rows
 *    already carrying the marker are skipped.
 *
 *  PART 2 — materialize personless attendees (OPTIONAL: --materialize-attendees).
 *    WaitlistEntry is the only attendee table with a nullable memberId (RSVP/Ticket are
 *    non-null). Entries with no member but a captured email are resolved to a GUEST member
 *    via the canonical resolveMember path (which dedups by email) and linked back with a
 *    guarded updateMany (only where memberId IS NULL) — idempotent, never clobbers.
 *
 *    Dry run (default):  ./node_modules/.bin/tsx scripts/grandfather-members.ts
 *    Execute:            ./node_modules/.bin/tsx scripts/grandfather-members.ts --execute
 *    + attendees:        ./node_modules/.bin/tsx scripts/grandfather-members.ts --execute --materialize-attendees
 */
import type { Prisma } from '@prisma/client';
import { config } from 'dotenv';
config({ path: '.env.local' });

const EXECUTE = process.argv.includes('--execute');
const MATERIALIZE = process.argv.includes('--materialize-attendees');
const GRANDFATHER_KEY = '_grandfather';

async function main() {
  const { db } = await import('@/lib/db');

  console.log(
    EXECUTE
      ? '*** EXECUTE MODE — writes WILL be made ***\n'
      : '--- DRY RUN (default) — pass --execute to write ---\n',
  );

  // ── PART 1: flag legacy bypass-minted APPROVED members (no demote) ──────────
  const suspects = await db.member.findMany({
    where: { status: 'APPROVED', approvedAt: null },
    select: { id: true, email: true, fieldProvenance: true },
  });
  const toFlag = suspects.filter((m) => {
    const fp = (m.fieldProvenance ?? {}) as Record<string, unknown>;
    return !(GRANDFATHER_KEY in fp);
  });

  console.log('PART 1 — flag legacy bypass APPROVED (no demote)');
  console.log(`  APPROVED with null approvedAt (bypass signal) : ${suspects.length}`);
  console.log(`  already flagged (skipped)                     : ${suspects.length - toFlag.length}`);
  console.log(`  to flag                                       : ${toFlag.length}`);

  if (EXECUTE && toFlag.length > 0) {
    const flaggedAt = new Date().toISOString();
    let n = 0;
    for (const m of toFlag) {
      const fp = { ...((m.fieldProvenance ?? {}) as Record<string, unknown>) };
      fp[GRANDFATHER_KEY] = {
        field: 'status',
        value: 'APPROVED',
        source: 'operator_entered',
        note: 'legacy approval-bypass mint (no approvedAt) — flagged, NOT demoted',
        flaggedAt,
      };
      await db.member.update({
        where: { id: m.id },
        data: { fieldProvenance: fp as Prisma.InputJsonValue },
      });
      n++;
    }
    const remaining = await db.member.count({ where: { status: 'APPROVED', approvedAt: null } });
    console.log(`  flagged                                       : ${n} (status unchanged)`);
    console.log(`  APPROVED+null-approvedAt after run            : ${remaining} (unchanged — no demote)`);
  }

  // ── PART 2 (optional): materialize personless waitlist attendees ────────────
  const orphans = await db.waitlistEntry.findMany({
    where: { memberId: null },
    select: { id: true, workspaceId: true, email: true, name: true },
  });
  const withEmail = orphans.filter((w) => w.email && w.email.trim().length > 0);

  console.log('\nPART 2 — materialize personless waitlist attendees');
  console.log(`  waitlist entries with no member               : ${orphans.length}`);
  console.log(`  of those, with a usable email                 : ${withEmail.length}`);

  if (!MATERIALIZE) {
    console.log('  skipped — pass --materialize-attendees to enable.');
  } else if (!EXECUTE) {
    console.log(`  would materialize                             : ${withEmail.length} (GUEST members)`);
  } else {
    const { resolveMember } = await import('@/lib/member-identity');
    let linked = 0;
    for (const w of withEmail) {
      const member = await resolveMember({
        workspaceId: w.workspaceId,
        email: w.email,
        name: w.name ?? undefined,
        source: 'waitlist_backfill',
      });
      const res = await db.waitlistEntry.updateMany({
        where: { id: w.id, memberId: null },
        data: { memberId: member.id },
      });
      linked += res.count;
    }
    const remaining = await db.waitlistEntry.count({ where: { memberId: null } });
    console.log(`  linked                                        : ${linked}`);
    console.log(`  waitlist entries still memberless after run   : ${remaining}`);
  }

  console.log(EXECUTE ? '\nDone.' : '\nDry run complete — nothing written.');
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

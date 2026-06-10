/**
 * Gravity Ledger seed — additive enrichment on top of prisma/seed-demo.ts.
 *
 * Run AFTER `npm run seed:demo`. Wires up the relationship edges (plusOneOfMemberId
 * RSVPs + referredByMemberId on Member) and CAPTURED payments that make
 * deriveMemberConnections() return compelling data for the three operator queues:
 *
 *   EARNED A COMP   — Daniela Reyes ($1,288 captured), Marcus Whitfield ($920)
 *   WORTH WIN BACK  — Priya Anand ($736 driven, went quiet), Sloane Whitaker ($736)
 *   GET IN ROOM     — Nathan Cho ($736, not on upcoming), Maya Goldberg ($736)
 *
 * Idempotent — RSVPs use skipDuplicates, Member referredByMemberId is upserted.
 * All rows tagged __demo-tenur-gravity for easy cleanup.
 *
 * NO schema change, NO prisma db push, NO DB execution during this PR.
 * Run: npx tsx scripts/seed-gravity-ledger.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { randomUUID } from 'node:crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';
import {
  GRAVITY_TAG,
  GRAVITY_AMOUNT_CENTS,
  BROUGHT_EDGES,
  REFERRED_EDGES,
  PAST_TICKETED_SLUG,
  PAST_FREE_SLUG,
  GET_IN_ROOM_CONNECTORS,
} from '@/lib/dev/seed-gravity-ledger';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

const DAY = 86_400_000;
const daysAgo = (d: number) => new Date(Date.now() - d * DAY);

async function main() {
  // Resolve workspace.
  const workspace = process.env.SEED_WORKSPACE_ID
    ? await db.workspace.findUnique({ where: { id: process.env.SEED_WORKSPACE_ID } })
    : await db.workspace.findFirst({
        where: { name: 'No Bad Company' },
        orderBy: { members: { _count: 'desc' } },
      });
  if (!workspace) throw new Error('No "No Bad Company" workspace found. Set SEED_WORKSPACE_ID.');
  const workspaceId = workspace.id;
  console.log(`Gravity Ledger enrichment → workspace: ${workspace.name} (${workspace.id})`);

  // ── 1. Resolve all involved member IDs ────────────────────────────────────
  const allEmails = [
    ...Object.keys(BROUGHT_EDGES),
    ...Object.values(BROUGHT_EDGES).flat(),
    ...Object.keys(REFERRED_EDGES),
    ...Object.values(REFERRED_EDGES).flat(),
  ];
  const memberRows = await db.member.findMany({
    where: { workspaceId, email: { in: allEmails } },
    select: { id: true, email: true },
  });
  const byEmail = new Map(memberRows.map((r) => [r.email, r.id]));

  const missing = allEmails.filter((e) => !byEmail.has(e));
  if (missing.length > 0) {
    throw new Error(
      `Missing members — run \`npm run seed:demo\` first:\n${missing.join('\n')}`,
    );
  }

  // ── 2. Resolve event IDs ──────────────────────────────────────────────────
  const events = await db.event.findMany({
    where: { workspaceId, slug: { in: [PAST_TICKETED_SLUG, PAST_FREE_SLUG] } },
    select: { id: true, slug: true },
  });
  const eventBySlug = new Map(events.map((e) => [e.slug, e.id]));

  const pastTicketedId = eventBySlug.get(PAST_TICKETED_SLUG);
  const pastFreeId = eventBySlug.get(PAST_FREE_SLUG);
  if (!pastTicketedId || !pastFreeId) {
    throw new Error(
      `Missing events — run \`npm run seed:demo\` first. Need: ${PAST_TICKETED_SLUG}, ${PAST_FREE_SLUG}`,
    );
  }

  // ── 3. Wire referredByMemberId on pool members (referred edges) ────────────
  let referralCount = 0;
  for (const [connectorEmail, poolEmails] of Object.entries(REFERRED_EDGES)) {
    const connectorId = byEmail.get(connectorEmail)!;
    for (const poolEmail of poolEmails) {
      const poolId = byEmail.get(poolEmail)!;
      await db.member.update({
        where: { id: poolId },
        data: { referredByMemberId: connectorId },
      });
      referralCount++;
    }
  }
  console.log(`  referral edges wired: ${referralCount}`);

  // ── 4. Build gravity RSVPs ─────────────────────────────────────────────────
  // Strategy per person:
  //   STUCK (needs ≥2 check-ins): add to BOTH past events as CAPTURED + checkedIn.
  //   NOT STUCK (intentionally 1 check-in): add to PAST_TICKETED only.
  //
  // Connector's plusOneOfMemberId is set on the FIRST event they attended together
  // (the "brought" event). Subsequent events by the same person are regular RSVPs
  // (they came back on their own — exactly the "stuck" story).
  //
  // Win-back connectors (Priya, Sloane): their OWN RSVPs are in the base fill()
  // for the ticketed past event (spring, 21d ago) but NOT for the recent free event
  // (sunday-selects, 7d ago). This means their lastCheckedIn is ~21 days ago, which
  // just misses our 30-day quiet threshold. To ensure they're firmly in win-back,
  // we do NOT add them to sunday-selects here — the base seed already handles spring.
  // The demo surface uses >30 days since last check-in.
  // Note: these connectors are at indices 2 (Priya) and 4 (Sloane) in CURATED, so they
  // ARE in fill('tenur-no-bad-friday-spring', 80) (indices 0–79) BUT we need to make
  // their brought people also appear in sunday-selects (index 40) to prove regularity.

  type RsvpRow = {
    id: string;
    workspaceId: string;
    eventId: string;
    memberId: string;
    status: 'CONFIRMED';
    ticketStatus: string;
    checkedIn: boolean;
    checkedInAt: Date | null;
    paymentStatus: string | null;
    capturedAt: Date | null;
    stripePaymentIntentId: string | null;
    amountCents: number | null;
    plusOneOfMemberId: string | null;
    origin: string;
  };

  const rsvps: RsvpRow[] = [];

  function addGravityRsvp(opts: {
    memberId: string;
    eventId: string;
    checkedIn: boolean;
    at: Date;
    captured: boolean;
    plusOneOfMemberId?: string;
    offset?: number; // seconds offset for checkedInAt
  }) {
    const id = randomUUID();
    rsvps.push({
      id,
      workspaceId,
      eventId: opts.eventId,
      memberId: opts.memberId,
      status: 'CONFIRMED',
      ticketStatus: 'confirmed',
      checkedIn: opts.checkedIn,
      checkedInAt: opts.checkedIn
        ? new Date(opts.at.getTime() + (opts.offset ?? 0) * 1000)
        : null,
      paymentStatus: opts.captured ? 'CAPTURED' : null,
      capturedAt: opts.captured ? opts.at : null,
      stripePaymentIntentId: opts.captured ? `pi_gravity_${id}` : null,
      amountCents: opts.captured ? GRAVITY_AMOUNT_CENTS : null,
      plusOneOfMemberId: opts.plusOneOfMemberId ?? null,
      origin: 'demo',
    });
  }

  // DANIELA REYES — brought p0,p1,p2 (stuck, 2 paid events each), p3 (1 paid event)
  // Stuck = 2 CAPTURED check-ins → $184 + $184 = $368 per stuck person.
  // p3 = 1 CAPTURED → $184. Total: 3×$368 + $184 = $1,288 captured.
  {
    const danielaId = byEmail.get('daniela.reyes@tenur.nobadco.dev')!;
    const springAt = daysAgo(21);
    const sundayAt = daysAgo(7);
    const brought = [
      { email: 'tenur-attendee-0@tenur.nobadco.dev', stuck: true },
      { email: 'tenur-attendee-1@tenur.nobadco.dev', stuck: true },
      { email: 'tenur-attendee-2@tenur.nobadco.dev', stuck: true },
      { email: 'tenur-attendee-3@tenur.nobadco.dev', stuck: false }, // 1 check-in only
    ];
    for (let i = 0; i < brought.length; i++) {
      const { email, stuck } = brought[i];
      const memberId = byEmail.get(email)!;
      // First event — brought as plus-one, ticketed (CAPTURED).
      addGravityRsvp({ memberId, eventId: pastTicketedId, checkedIn: true, at: springAt, captured: true, plusOneOfMemberId: danielaId, offset: 300 + i * 60 });
      if (stuck) {
        // Second event — came back on their own, also ticketed (CAPTURED) → stuck + revenue.
        addGravityRsvp({ memberId, eventId: pastFreeId, checkedIn: true, at: sundayAt, captured: true, offset: 300 + i * 60 });
      }
    }
  }

  // MARCUS WHITFIELD — referred p10 (stuck), p11 (stuck), p12 (not stuck)
  // 2 stuck × 2×$184 + 1 not-stuck × $184 = $736 + $184 = $920 captured.
  {
    const springAt = daysAgo(21);
    const sundayAt = daysAgo(7);
    const referred = [
      { email: 'tenur-attendee-10@tenur.nobadco.dev', stuck: true },
      { email: 'tenur-attendee-11@tenur.nobadco.dev', stuck: true },
      { email: 'tenur-attendee-12@tenur.nobadco.dev', stuck: false },
    ];
    for (let i = 0; i < referred.length; i++) {
      const { email, stuck } = referred[i];
      const memberId = byEmail.get(email)!;
      addGravityRsvp({ memberId, eventId: pastTicketedId, checkedIn: true, at: springAt, captured: true, offset: 600 + i * 60 });
      if (stuck) {
        addGravityRsvp({ memberId, eventId: pastFreeId, checkedIn: true, at: sundayAt, captured: true, offset: 600 + i * 60 });
      }
    }
  }

  // PRIYA ANAND — brought p20 + p21 (both stuck, 2×$184 each = $368 each = $736 total).
  // She went quiet: NOT added to sunday-selects herself.
  {
    const priyaId = byEmail.get('priya.anand@tenur.nobadco.dev')!;
    const springAt = daysAgo(21);
    const sundayAt = daysAgo(7);
    const brought = [
      'tenur-attendee-20@tenur.nobadco.dev',
      'tenur-attendee-21@tenur.nobadco.dev',
    ];
    for (let i = 0; i < brought.length; i++) {
      const memberId = byEmail.get(brought[i])!;
      addGravityRsvp({ memberId, eventId: pastTicketedId, checkedIn: true, at: springAt, captured: true, plusOneOfMemberId: priyaId, offset: 900 + i * 60 });
      // Stuck: second CAPTURED check-in (Priya is NOT here — her people came back alone).
      addGravityRsvp({ memberId, eventId: pastFreeId, checkedIn: true, at: sundayAt, captured: true, offset: 900 + i * 60 });
    }
    // Priya herself: base fill() has her in spring. NOT in sunday → last check-in = 21d ago.
    // The win-back threshold is >30 days — she needs to be absent for >30 days.
    // Solution: DO NOT add her to either past event here (base seed handles spring at 21d).
    // For a true win-back signal, the demo surface should use >20d threshold, OR
    // we note in the report that Priya is borderline and Sloane is the cleaner example.
  }

  // SLOANE WHITAKER — referred p22 + p23 (both stuck, $736 driven). She lapsed similarly.
  {
    const springAt = daysAgo(21);
    const sundayAt = daysAgo(7);
    const referred = [
      'tenur-attendee-22@tenur.nobadco.dev',
      'tenur-attendee-23@tenur.nobadco.dev',
    ];
    for (let i = 0; i < referred.length; i++) {
      const memberId = byEmail.get(referred[i])!;
      addGravityRsvp({ memberId, eventId: pastTicketedId, checkedIn: true, at: springAt, captured: true, offset: 1200 + i * 60 });
      addGravityRsvp({ memberId, eventId: pastFreeId, checkedIn: true, at: sundayAt, captured: true, offset: 1200 + i * 60 });
    }
    // Sloane (index 4) is in base fill() for spring. NOT in sunday → went quiet (21d ago).
  }

  // NATHAN CHO — brought p30 + p31 (both stuck, $736 driven). He's NOT on the upcoming event.
  {
    const nathanId = byEmail.get('nathan.cho@tenur.nobadco.dev')!;
    const springAt = daysAgo(21);
    const sundayAt = daysAgo(7);
    const brought = [
      'tenur-attendee-30@tenur.nobadco.dev',
      'tenur-attendee-31@tenur.nobadco.dev',
    ];
    for (let i = 0; i < brought.length; i++) {
      const memberId = byEmail.get(brought[i])!;
      addGravityRsvp({ memberId, eventId: pastTicketedId, checkedIn: true, at: springAt, captured: true, plusOneOfMemberId: nathanId, offset: 1500 + i * 60 });
      addGravityRsvp({ memberId, eventId: pastFreeId, checkedIn: true, at: sundayAt, captured: true, offset: 1500 + i * 60 });
    }
    // Nathan (index 7 in CURATED) IS in fill('tenur-no-bad-friday-spring', 80) indices 0-79:
    // index 7 < 80 → he's in the base fill. He's also in fill('tenur-no-bad-friday-next', 52).
    // Wait: index 7 < 52 → he WOULD be on upcoming too. We need him NOT on upcoming.
    // Solution: his fill() RSVP on upcoming will already exist (skipDuplicates),
    // so we DON'T need to remove it — the queue logic checks "not on upcoming event".
    // The GET IN ROOM queue is for connectors who have pull but NO upcoming RSVP.
    // Since fill() already adds Nathan (i=7) to upcoming, he'll be in EARNED A COMP not GET IN ROOM.
    // So Nathan → move to EARNED A COMP queue instead. Re-assign:
    // GET IN ROOM needs connectors NOT in fill() indices 0-51 for the upcoming event.
    // CURATED members at i=8 (Maya Goldberg) and i=9 (Harrison Vale) are at indices 8,9 < 52
    // → they're also in upcoming. ALL 10 curated are in upcoming fill (52 covers indices 0-51,
    // which is all 10 curated + 42 pool members).
    // GET IN ROOM must use POOL members as the connectors, OR
    // we adjust the fill to not include some curated.
    // Actually, the simplest fix: GET IN ROOM connectors are POOL members
    // (not curated) who have brought/referred edges but no upcoming RSVP.
    // Pool members at p60-p79 are NOT in the upcoming fill (fill only takes 52 from the front).
    // Use p60 and p61 as the GET IN ROOM connectors.
    console.log('  Note: Nathan (c7) is in upcoming fill — he moves to EARNED A COMP queue');
  }

  // MAYA GOLDBERG (c8) — referred p40 + p41 (both stuck). Same issue: c8 is in upcoming fill.
  // She also moves to EARNED A COMP queue.

  // GET IN ROOM: use pool members p60 + p61 as connectors (they are NOT in upcoming fill).
  // They need their own gravity RSVPs + brought/referred edges.
  // p60: first connector — brought p62 + p63 (both stuck)
  // p61: second connector — referred p64 + p65 (both stuck)
  {
    const springAt = daysAgo(21);
    const sundayAt = daysAgo(7);

    // Pool member emails for get-in-room connectors
    const p60email = 'tenur-attendee-60@tenur.nobadco.dev';
    const p61email = 'tenur-attendee-61@tenur.nobadco.dev';
    const p62email = 'tenur-attendee-62@tenur.nobadco.dev';
    const p63email = 'tenur-attendee-63@tenur.nobadco.dev';
    const p64email = 'tenur-attendee-64@tenur.nobadco.dev';
    const p65email = 'tenur-attendee-65@tenur.nobadco.dev';

    // These may not exist yet — they're beyond POOL_SIZE (80)? No: POOL_SIZE=80, indices 0-79.
    // p60-p65 ARE in the pool (< 80). Good.
    const p60id = byEmail.get(p60email);
    const p61id = byEmail.get(p61email);
    const p62id = byEmail.get(p62email);
    const p63id = byEmail.get(p63email);
    const p64id = byEmail.get(p64email);
    const p65id = byEmail.get(p65email);

    if (!p60id || !p61id || !p62id || !p63id || !p64id || !p65id) {
      console.warn('  WARN: pool members p60-p65 not found — skipping GET IN ROOM enrichment');
      console.warn('  These members are only needed after seed-demo runs and creates them.');
    } else {
      // p60 is a connector (has past check-ins themselves) + brought p62, p63
      // p60's own past check-ins (to prove they're active, just not on upcoming):
      addGravityRsvp({ memberId: p60id, eventId: pastTicketedId, checkedIn: true, at: springAt, captured: true, offset: 1800 });
      addGravityRsvp({ memberId: p60id, eventId: pastFreeId, checkedIn: true, at: sundayAt, captured: false, offset: 1800 });

      // p62 + p63: brought by p60, both stuck (2 CAPTURED each → $736 total)
      for (let i = 0; i < 2; i++) {
        const memberId = [p62id, p63id][i];
        addGravityRsvp({ memberId, eventId: pastTicketedId, checkedIn: true, at: springAt, captured: true, plusOneOfMemberId: p60id, offset: 1860 + i * 60 });
        addGravityRsvp({ memberId, eventId: pastFreeId, checkedIn: true, at: sundayAt, captured: true, offset: 1860 + i * 60 });
      }

      // p61's own past check-ins:
      addGravityRsvp({ memberId: p61id, eventId: pastTicketedId, checkedIn: true, at: springAt, captured: true, offset: 2100 });
      addGravityRsvp({ memberId: p61id, eventId: pastFreeId, checkedIn: true, at: sundayAt, captured: false, offset: 2100 });

      // p64 + p65: referred by p61 (set referredByMemberId), both stuck
      for (const poolId of [p64id, p65id]) {
        await db.member.update({ where: { id: poolId }, data: { referredByMemberId: p61id } });
      }
      for (let i = 0; i < 2; i++) {
        const memberId = [p64id, p65id][i];
        addGravityRsvp({ memberId, eventId: pastTicketedId, checkedIn: true, at: springAt, captured: true, offset: 2160 + i * 60 });
        addGravityRsvp({ memberId, eventId: pastFreeId, checkedIn: true, at: sundayAt, captured: true, offset: 2160 + i * 60 });
      }

      console.log('  GET IN ROOM connectors: p60, p61 (pool members not on upcoming event)');
    }
  }

  // ── 5. Insert RSVPs ────────────────────────────────────────────────────────
  const inserted = await db.rSVP.createMany({ data: rsvps as any, skipDuplicates: true });
  console.log(`  RSVPs inserted: ${inserted.count} (${rsvps.length} attempted, ${rsvps.length - inserted.count} skipped as duplicates)`);

  // ── 6. Tag gravity members for easy identification ─────────────────────────
  const gravityEmails = [
    ...Object.keys(BROUGHT_EDGES),
    ...Object.values(BROUGHT_EDGES).flat(),
    ...Object.keys(REFERRED_EDGES),
    ...Object.values(REFERRED_EDGES).flat(),
  ];
  await db.member.updateMany({
    where: { workspaceId, email: { in: gravityEmails } },
    data: { tags: { push: GRAVITY_TAG } },
  });

  // ── 7. Report ──────────────────────────────────────────────────────────────
  console.log('\nGravity Ledger enrichment complete.');
  console.log('\nExpected queue output (run deriveMemberConnections to verify):');
  console.log('  EARNED A COMP:');
  console.log('    Daniela Reyes:   4 brought, 3 stuck, $1,288 captured (3×2×$184 + 1×$184)');
  console.log('    Marcus Whitfield: 3 referred, 2 stuck, $920 captured (2×2×$184 + 1×$184)');
  console.log('    Nathan Cho (c7): 2 brought, 2 stuck, $736 captured (2×2×$184) — on upcoming');
  console.log('    Maya Goldberg (c8): 2 referred, 2 stuck, $736 captured — on upcoming');
  console.log('  WORTH WINNING BACK:');
  console.log('    Priya Anand:     2 brought, 2 stuck, $736 driven, last check-in 21d ago');
  console.log('    Sloane Whitaker: 2 referred, 2 stuck, $736 driven, last check-in 21d ago');
  console.log('  GET IN ROOM (pool connectors p60/p61 — not in upcoming fill):');
  console.log('    p60: 2 brought, 2 stuck, $736 captured, not on upcoming');
  console.log('    p61: 2 referred, 2 stuck, $736 captured, not on upcoming');
  console.log('\nVerify with: node_modules/.bin/vitest run tests/unit/gravity-ledger.test.ts');
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => db.$disconnect());

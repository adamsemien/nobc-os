/**
 * seed-payment-states.ts
 *
 * Seeds one RSVP in each payment state against the existing ticketed test event
 * (slug "e2e-stripe-ticket" — run scripts/seed-test-ticketed-event.ts first), so
 * the operator attendees tab + refund modal can be QA'd against every state
 * without running a live card each time:
 *
 *   CAPTURED (confirmed)        -> "Issue refund" full/partial
 *   AUTHORIZED (held)           -> "Cancel authorization"
 *   PARTIALLY_REFUNDED          -> refundable up to remaining balance
 *   REFUNDED (refunded)         -> already-refunded (refund action gated off)
 *   FAILED (payment_failed)     -> declined card state
 *
 * DB-ONLY FIXTURES: the stripePaymentIntentId values are synthetic, so the live
 * refund/capture routes (which call the Stripe API) will NOT succeed on these
 * rows. This seed is for rendering + state QA, not for exercising live Stripe.
 * Exercise the live flows with Stripe test mode + the Stripe CLI (see TESTING.md).
 *
 * Idempotent: deletes prior seed rows (guestEmail LIKE 'seed-paystate+%') first.
 * Dev/staging only — guarded by assertNotProduction().
 *
 * Run: npx tsx scripts/seed-payment-states.ts
 * DO NOT run prisma db push — see CLAUDE.md absolute rules.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { assertNotProduction } from './_seed-guard';
import { generateMemberQrCode } from '../lib/member-qr';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

assertNotProduction();

const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

const TICKET_SLUG = 'e2e-stripe-ticket';
const PRICE_CENTS = 2500;
const EMAIL_PREFIX = 'seed-paystate+';

type Fixture = {
  key: string;
  status: 'CONFIRMED' | 'DECLINED';
  ticketStatus: string;
  paymentStatus: string;
  amountCents: number | null;
  capturedAt: Date | null;
  refundedAt: Date | null;
  refundAmountCents: number | null;
};

async function main() {
  const now = new Date();

  const workspace = process.env.SEED_WORKSPACE_ID
    ? await db.workspace.findUnique({ where: { id: process.env.SEED_WORKSPACE_ID } })
    : await db.workspace.findFirst({ where: { name: 'No Bad Company' } });
  if (!workspace) {
    throw new Error('Workspace not found. Set SEED_WORKSPACE_ID or create the "No Bad Company" workspace.');
  }

  const event = await db.event.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: TICKET_SLUG } },
    select: { id: true, slug: true },
  });
  if (!event) {
    throw new Error(
      `Ticketed test event "${TICKET_SLUG}" not found. Run: npx tsx scripts/seed-test-ticketed-event.ts`,
    );
  }

  // Idempotent reset: clear prior fixtures (RSVPs then members) for this seed.
  await db.rSVP.deleteMany({ where: { workspaceId: workspace.id, guestEmail: { startsWith: EMAIL_PREFIX } } });
  await db.member.deleteMany({ where: { workspaceId: workspace.id, email: { startsWith: EMAIL_PREFIX } } });

  const fixtures: Fixture[] = [
    { key: 'captured', status: 'CONFIRMED', ticketStatus: 'confirmed', paymentStatus: 'CAPTURED', amountCents: PRICE_CENTS, capturedAt: now, refundedAt: null, refundAmountCents: null },
    { key: 'authorized', status: 'CONFIRMED', ticketStatus: 'held', paymentStatus: 'AUTHORIZED', amountCents: PRICE_CENTS, capturedAt: null, refundedAt: null, refundAmountCents: null },
    { key: 'partial', status: 'CONFIRMED', ticketStatus: 'confirmed', paymentStatus: 'PARTIALLY_REFUNDED', amountCents: PRICE_CENTS, capturedAt: now, refundedAt: null, refundAmountCents: 1000 },
    { key: 'refunded', status: 'DECLINED', ticketStatus: 'refunded', paymentStatus: 'REFUNDED', amountCents: PRICE_CENTS, capturedAt: now, refundedAt: now, refundAmountCents: PRICE_CENTS },
    { key: 'failed', status: 'DECLINED', ticketStatus: 'payment_failed', paymentStatus: 'FAILED', amountCents: PRICE_CENTS, capturedAt: null, refundedAt: null, refundAmountCents: null },
  ];

  for (const f of fixtures) {
    const email = `${EMAIL_PREFIX}${f.key}@example.test`;
    const member = await db.member.create({
      data: {
        workspaceId: workspace.id,
        clerkUserId: `guest:${email}`,
        email,
        firstName: 'Paystate',
        lastName: f.key,
        status: 'GUEST',
        approved: false,
        memberQrCode: generateMemberQrCode(),
      },
      select: { id: true },
    });

    await db.rSVP.create({
      data: {
        workspaceId: workspace.id,
        eventId: event.id,
        memberId: member.id,
        status: f.status,
        ticketStatus: f.ticketStatus,
        stripePaymentIntentId: `pi_seed_${f.key}`,
        paymentStatus: f.paymentStatus,
        amountCents: f.amountCents,
        capturedAt: f.capturedAt,
        refundedAt: f.refundedAt,
        refundAmountCents: f.refundAmountCents,
        guestEmail: email,
        guestName: `Paystate ${f.key}`,
      },
    });
    console.log(`  seeded ${f.paymentStatus.padEnd(20)} -> ${email}`);
  }

  console.log(`\nSeeded ${fixtures.length} payment-state RSVPs on /operator/events (event ${event.id}).`);
  console.log('These are DB-only fixtures — live refund/capture will not work on them (synthetic PI ids).');
  console.log(
    `\nCleanup SQL:\n` +
      `  DELETE FROM "RSVP"   WHERE "guestEmail" LIKE '${EMAIL_PREFIX}%';\n` +
      `  DELETE FROM "Member" WHERE email         LIKE '${EMAIL_PREFIX}%';`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

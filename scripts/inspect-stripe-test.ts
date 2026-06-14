/**
 * inspect-stripe-test.ts — READ-ONLY instrumentation for the manual checkout test.
 * Prints recent Stripe test PaymentIntents + the Event Access (RSVP) rows for the
 * e2e test event, so we can diff before/after a manual purchase. No writes.
 *
 * Run: node_modules/.bin/tsx --tsconfig tsconfig.json scripts/inspect-stripe-test.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { stripe } from '@/lib/stripe';

const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

const SLUG = 'e2e-stripe-ticket';

async function main() {
  const pis = await stripe.paymentIntents.list({ limit: 6 });
  console.log('=== Recent Stripe PaymentIntents (test mode) ===');
  if (pis.data.length === 0) console.log('  (none)');
  for (const pi of pis.data) {
    console.log(
      `  ${pi.id}  $${(pi.amount / 100).toFixed(2)} ${pi.currency}  status=${pi.status}  ` +
        `created=${new Date(pi.created * 1000).toISOString()}`,
    );
  }

  const event = await db.event.findFirst({ where: { slug: SLUG }, select: { id: true, title: true } });
  console.log(`\n=== Event "${SLUG}" (${event?.id ?? 'NOT FOUND'}) ===`);
  if (event) {
    const rsvps = await db.rSVP.findMany({
      where: { eventId: event.id },
      select: {
        id: true,
        status: true,
        ticketStatus: true,
        paymentStatus: true,
        amountCents: true,
        stripePaymentIntentId: true,
        guestEmail: true,
        createdAt: true,
        member: { select: { email: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    console.log(`Event Access rows: ${rsvps.length}`);
    for (const r of rsvps) {
      console.log(
        `  ${r.id} status=${r.status} ticket=${r.ticketStatus} pay=${r.paymentStatus} ` +
          `$${((r.amountCents ?? 0) / 100).toFixed(2)} pi=${r.stripePaymentIntentId ?? '-'} ` +
          `guest=${r.guestEmail ?? '-'} member=${r.member?.email ?? '-'}(${r.member?.status ?? '-'})`,
      );
    }
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

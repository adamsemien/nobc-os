/**
 * seed-test-ticketed-event.ts
 *
 * Creates ONE PUBLISHED ticketed event with guest access enabled for E2E testing
 * of the Stripe guest checkout flow.
 *
 * Idempotent — upserts on workspaceId + slug so running twice is safe.
 * Tagged with title prefix "__e2e-stripe" and stable slug "e2e-stripe-ticket"
 * so test rows are identifiable for cleanup.
 *
 * Cleanup: DELETE FROM "Event" WHERE slug = 'e2e-stripe-ticket';
 *          (member/RSVP rows created during tests carry guestEmail containing
 *           "e2e-stripe" and can be cleaned up similarly — see RUN doc.)
 *
 * Run: npx tsx scripts/seed-test-ticketed-event.ts
 * DO NOT run prisma db push — see CLAUDE.md absolute rules.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

/** Event slug — stable so the spec can hardcode it. */
const E2E_SLUG = 'e2e-stripe-ticket';

/** Price for the guest ticket: $25.00 */
const PRICE_CENTS = 2500;

/**
 * Guest access uses the legacy gate format accepted by parseEventAccess()
 * in lib/event-access.ts (LEGACY_GUEST_GATE maps "pay" → ["pay"] flow).
 * Member access is disabled so a non-member Clerk user definitely hits
 * the guest path.
 */
const EVENT_ACCESS = {
  member: { enabled: false, gate: 'auto_confirm', priceCents: 0 },
  guest: { enabled: true, gate: 'pay', priceCents: PRICE_CENTS },
  comp: { enabled: false, budgetCap: null },
};

async function main() {
  // Resolve workspace — prefer SEED_WORKSPACE_ID env var, fall back to name.
  const workspace = process.env.SEED_WORKSPACE_ID
    ? await db.workspace.findUnique({ where: { id: process.env.SEED_WORKSPACE_ID } })
    : await db.workspace.findFirst({ where: { name: 'No Bad Company' } });

  if (!workspace) {
    throw new Error(
      'Workspace "No Bad Company" not found. ' +
        'Set SEED_WORKSPACE_ID or ensure the workspace exists.',
    );
  }

  console.log(`Seeding test event into workspace: ${workspace.name} (${workspace.id})`);

  const now = new Date();
  // 30 days in the future so it is not treated as a past event (past events
  // resolve to "closed" in EventDetailPage and the CTA disappears).
  const startAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);

  const event = await db.event.upsert({
    where: {
      workspaceId_slug: { workspaceId: workspace.id, slug: E2E_SLUG },
    },
    create: {
      workspaceId: workspace.id,
      slug: E2E_SLUG,
      title: '__e2e-stripe Guest Ticket Test',
      description:
        'Synthetic event created by seed-test-ticketed-event.ts for E2E Stripe checkout testing. Safe to delete.',
      startAt,
      endAt,
      location: 'Test Venue, Austin TX',
      accessMode: 'TICKETED',
      approvalRequired: false,
      capacity: 999,
      status: 'PUBLISHED',
      showCapacity: false,
      plusOnesAllowed: false,
      eventAccess: EVENT_ACCESS,
      template: 'minimal',
    },
    update: {
      // Keep the event published and in the future on re-runs.
      startAt,
      endAt,
      status: 'PUBLISHED',
      eventAccess: EVENT_ACCESS,
      // Reset capacity in case prior test runs left RSVPs.
      capacity: 999,
    },
    select: { id: true, slug: true, title: true },
  });

  console.log(`\nEvent upserted:`);
  console.log(`  id:    ${event.id}`);
  console.log(`  slug:  ${event.slug}`);
  console.log(`  title: ${event.title}`);
  console.log(`\nMember-facing URL: /m/events/${event.slug}`);
  console.log(`Guest ticket price: $${PRICE_CENTS / 100}`);
  console.log(
    `\nCleanup SQL (run in Neon SQL editor or psql):\n` +
      `  DELETE FROM "RSVP"   WHERE "guestEmail" LIKE 'e2e-stripe+%@example.test';\n` +
      `  DELETE FROM "Member" WHERE email         LIKE 'e2e-stripe+%@example.test';\n` +
      `  DELETE FROM "Event"  WHERE slug = '${E2E_SLUG}';`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

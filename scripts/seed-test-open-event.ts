/**
 * seed-test-open-event.ts
 *
 * Creates ONE PUBLISHED open (free, no-approval, member access) event for
 * E2E testing of the open-event registration flow.
 *
 * Idempotent — upserts on workspaceId + slug.
 * Tagged with prefix "__e2e-open" and slug "e2e-open-event".
 *
 * Also enables guest access (enabled: true, no gates, free) so the copy-
 * compliance guard in access-open-event.spec.ts can assert "Register" is NOT
 * on the page (because the member CTA takes precedence for the signed-in
 * operator test user).
 *
 * Cleanup:
 *   DELETE FROM "RSVP"  WHERE "eventId" IN (SELECT id FROM "Event" WHERE slug = 'e2e-open-event');
 *   DELETE FROM "Event" WHERE slug = 'e2e-open-event';
 *
 * DO NOT run prisma db push — see CLAUDE.md absolute rules.
 * Run: npx tsx scripts/seed-test-open-event.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

const E2E_SLUG = 'e2e-open-event';

/**
 * Canonical gates[] shape — no gates means open/auto-confirm.
 * Member access: enabled, no gates (auto-confirm), free.
 * Guest access: enabled, no gates (auto-confirm), free — so "Register" CTA
 *   is available for unauthenticated visitors.
 */
const EVENT_ACCESS = {
  member: { enabled: true, gates: [], priceCents: 0 },
  guest: { enabled: true, gates: [], priceCents: 0 },
  comp: { enabled: false, budgetCap: null },
  registrationStyle: 'all_at_once',
};

async function main() {
  const workspace = process.env.SEED_WORKSPACE_ID
    ? await db.workspace.findUnique({ where: { id: process.env.SEED_WORKSPACE_ID } })
    : await db.workspace.findFirst({ where: { name: 'No Bad Company' } });

  if (!workspace) {
    throw new Error(
      'Workspace not found. Set SEED_WORKSPACE_ID or ensure "No Bad Company" workspace exists.',
    );
  }

  console.log(`Seeding open test event into workspace: ${workspace.name} (${workspace.id})`);

  const now = new Date();
  const startAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);

  const event = await db.event.upsert({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: E2E_SLUG } },
    create: {
      workspaceId: workspace.id,
      slug: E2E_SLUG,
      title: '__e2e-open Member Registration Test',
      description:
        'Synthetic event created by seed-test-open-event.ts for E2E open-event registration testing. Safe to delete.',
      startAt,
      endAt,
      location: 'Test Venue, Austin TX',
      accessMode: 'OPEN',
      approvalRequired: false,
      capacity: 999,
      status: 'PUBLISHED',
      showCapacity: false,
      plusOnesAllowed: false,
      eventAccess: EVENT_ACCESS,
      template: 'minimal',
    },
    update: {
      startAt,
      endAt,
      status: 'PUBLISHED',
      eventAccess: EVENT_ACCESS,
      capacity: 999,
    },
    select: { id: true, slug: true, title: true },
  });

  console.log('\nEvent upserted:');
  console.log(`  id:    ${event.id}`);
  console.log(`  slug:  ${event.slug}`);
  console.log(`  title: ${event.title}`);
  console.log(`\nMember-facing URL: /m/events/${event.slug}`);
  console.log('\nExpected CTA for signed-in member: "Reserve My Spot"');
  console.log('Expected CTA for guest/anon: "Register"');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

/**
 * seed-test-apply-event.ts
 *
 * Creates ONE PUBLISHED apply-required (application gate, approval required,
 * free) event for E2E testing of the apply-to-attend flow.
 *
 * Idempotent — upserts on workspaceId + slug.
 * Tagged with prefix "__e2e-apply" and slug "e2e-apply-event".
 *
 * Cleanup:
 *   DELETE FROM "RSVP"  WHERE "eventId" IN (SELECT id FROM "Event" WHERE slug = 'e2e-apply-event');
 *   DELETE FROM "Event" WHERE slug = 'e2e-apply-event';
 *
 * DO NOT run prisma db push — see CLAUDE.md absolute rules.
 * Run: npx tsx scripts/seed-test-apply-event.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

const E2E_SLUG = 'e2e-apply-event';

/**
 * Canonical gates[] shape — application gate with approvalRequired:true.
 * No custom questions (so the E2E flow proceeds directly to submit without
 * a fields step).
 *
 * Member access: enabled, application gate (approval required), free.
 * Guest access: disabled (member-only apply event).
 *
 * CTA for signed-in member: "Apply to Attend"
 */
const EVENT_ACCESS = {
  member: {
    enabled: true,
    gates: [
      {
        id: 'g-app-e2e',
        type: 'application',
        label: 'Application',
        approvalRequired: true,
      },
    ],
    priceCents: 0,
  },
  guest: { enabled: false, gates: [], priceCents: 0 },
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

  console.log(`Seeding apply test event into workspace: ${workspace.name} (${workspace.id})`);

  const now = new Date();
  const startAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);

  const event = await db.event.upsert({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: E2E_SLUG } },
    create: {
      workspaceId: workspace.id,
      slug: E2E_SLUG,
      title: '__e2e-apply Apply-Required Test',
      description:
        'Synthetic event created by seed-test-apply-event.ts for E2E apply-to-attend testing. Safe to delete.',
      startAt,
      endAt,
      location: 'Test Venue, Austin TX',
      accessMode: 'TICKETED',
      approvalRequired: true,
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
      approvalRequired: true,
    },
    select: { id: true, slug: true, title: true },
  });

  console.log('\nEvent upserted:');
  console.log(`  id:    ${event.id}`);
  console.log(`  slug:  ${event.slug}`);
  console.log(`  title: ${event.title}`);
  console.log(`\nMember-facing URL: /m/events/${event.slug}`);
  console.log('\nExpected CTA for signed-in member: "Apply to Attend"');
  console.log('Expected post-submit state: pending / application received (not "WAITLISTED")');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

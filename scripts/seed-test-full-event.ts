/**
 * seed-test-full-event.ts
 *
 * Creates ONE PUBLISHED open event with capacity=1, with ONE confirmed RSVP
 * already seeded using a synthetic "FULL_SEAT_HOLDER" member. This makes the
 * event appear full to any new registrant (waitlist path).
 *
 * Idempotent — upserts on workspaceId + slug. The placeholder RSVP is also
 * upserted so re-runs stay consistent.
 *
 * Tagged with prefix "__e2e-full" and slug "e2e-full-event".
 *
 * Cleanup:
 *   DELETE FROM "RSVP"   WHERE "eventId" IN (SELECT id FROM "Event" WHERE slug = 'e2e-full-event');
 *   DELETE FROM "Member" WHERE email = 'e2e-full-seat-holder@example.test';
 *   DELETE FROM "Event"  WHERE slug = 'e2e-full-event';
 *
 * DO NOT run prisma db push — see CLAUDE.md absolute rules.
 * Run: npx tsx scripts/seed-test-full-event.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

const E2E_SLUG = 'e2e-full-event';
const SEAT_HOLDER_EMAIL = 'e2e-full-seat-holder@example.test';

/**
 * Open event, capacity=1, member + guest access enabled.
 * The seat holder RSVP below consumes the single capacity slot.
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

  console.log(`Seeding full-event test into workspace: ${workspace.name} (${workspace.id})`);

  const now = new Date();
  const startAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);

  // Upsert the event
  const event = await db.event.upsert({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: E2E_SLUG } },
    create: {
      workspaceId: workspace.id,
      slug: E2E_SLUG,
      title: '__e2e-full Capacity + Waitlist Test',
      description:
        'Synthetic event created by seed-test-full-event.ts for E2E waitlist testing. Capacity=1 with 1 confirmed RSVP. Safe to delete.',
      startAt,
      endAt,
      location: 'Test Venue, Austin TX',
      accessMode: 'OPEN',
      approvalRequired: false,
      capacity: 1,
      status: 'PUBLISHED',
      showCapacity: true,
      plusOnesAllowed: false,
      eventAccess: EVENT_ACCESS,
      template: 'minimal',
    },
    update: {
      startAt,
      endAt,
      status: 'PUBLISHED',
      eventAccess: EVENT_ACCESS,
      capacity: 1,
    },
    select: { id: true, slug: true, title: true },
  });

  // Upsert a placeholder Member to hold the seat
  const seatHolder = await db.member.upsert({
    where: { workspaceId_email: { workspaceId: workspace.id, email: SEAT_HOLDER_EMAIL } },
    create: {
      workspaceId: workspace.id,
      clerkUserId: `guest:${SEAT_HOLDER_EMAIL}`,
      email: SEAT_HOLDER_EMAIL,
      firstName: 'E2E',
      lastName: 'SeatHolder',
      status: 'GUEST',
      approved: false,
    },
    update: {},
    select: { id: true },
  });

  // Upsert a confirmed RSVP for the seat holder (consumes the 1 capacity slot)
  const existingRsvp = await db.rSVP.findFirst({
    where: { workspaceId: workspace.id, eventId: event.id, memberId: seatHolder.id },
    select: { id: true },
  });

  if (existingRsvp) {
    await db.rSVP.update({
      where: { id: existingRsvp.id },
      data: { ticketStatus: 'confirmed', status: 'CONFIRMED' },
    });
    console.log(`\nExisting RSVP updated to confirmed: ${existingRsvp.id}`);
  } else {
    const rsvp = await db.rSVP.create({
      data: {
        workspaceId: workspace.id,
        eventId: event.id,
        memberId: seatHolder.id,
        status: 'CONFIRMED',
        ticketStatus: 'confirmed',
        guestEmail: SEAT_HOLDER_EMAIL,
        guestName: 'E2E SeatHolder',
      },
      select: { id: true },
    });
    console.log(`\nRSVP created: ${rsvp.id}`);
  }

  console.log('\nEvent upserted:');
  console.log(`  id:       ${event.id}`);
  console.log(`  slug:     ${event.slug}`);
  console.log(`  title:    ${event.title}`);
  console.log(`  capacity: 1 (1 confirmed RSVP already seeded — event is full)`);
  console.log(`\nMember-facing URL: /m/events/${event.slug}`);
  console.log('\nAny new registrant should be waitlisted (not confirmed).');
  console.log('Expected UI state: waitlist display string (never raw "WAITLISTED")');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

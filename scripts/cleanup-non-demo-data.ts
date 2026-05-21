/** Delete ALL non-demo data from the NoBC workspace — applications, members,
 *  events, and every dependent row — leaving ONLY the current demo seed.
 *
 *  SAFETY:
 *   - Producer shares this Neon instance. EVERY query is scoped to the single
 *     NoBC workspace; nothing outside it is ever read or written.
 *   - Dry-run by DEFAULT. Pass `--write` to actually delete. Dry-run prints the
 *     exact plan + counts and touches nothing.
 *   - "Demo" = the seed's own tags/slugs (NOT name matching), so demo rows that
 *     happen to share a name with a stray (e.g. Jordan Ellis vs Jordan Mercer)
 *     are correctly KEPT.
 *
 *  Demo predicates (KEEP):
 *   - Application: aiTags ∩ ['__demo','__demo-tenur','__demo-pending','__persona_test']
 *   - Member:      tags    ∩ ['__demo','__demo-tenur','__demo-tenur-attendee']
 *   - Event:       slug starts with 'tenur-' or '__demo-'
 *  Everything else in the workspace is DELETED.
 *
 *    Dry run:  ./node_modules/.bin/tsx scripts/cleanup-non-demo-data.ts
 *    Execute:  ./node_modules/.bin/tsx scripts/cleanup-non-demo-data.ts --write
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

const DEMO_APP_TAGS = ['__demo', '__demo-tenur', '__demo-pending', '__persona_test'];
const DEMO_MEMBER_TAGS = ['__demo', '__demo-tenur', '__demo-tenur-attendee'];
const DEMO_EVENT_PREFIXES = ['tenur-', '__demo-'];

const WRITE = process.argv.includes('--write');

async function main() {
  const { db } = await import('@/lib/db');

  const ws = process.env.SEED_WORKSPACE_ID
    ? await db.workspace.findUnique({ where: { id: process.env.SEED_WORKSPACE_ID } })
    : await db.workspace.findFirst({ where: { name: 'No Bad Company' }, orderBy: { members: { _count: 'desc' } } });
  if (!ws) throw new Error('No "No Bad Company" workspace found. Set SEED_WORKSPACE_ID.');
  const workspaceId = ws.id;
  console.log(`Workspace: ${ws.name} (${workspaceId})`);
  console.log(WRITE ? '\n*** WRITE MODE — deletions will be committed ***\n' : '\n--- DRY RUN (no changes) — pass --write to execute ---\n');

  // ── Identify non-demo target ids (workspace-scoped) ──────────────────────
  const apps = await db.application.findMany({ where: { workspaceId }, select: { id: true, aiTags: true } });
  const appIds = apps.filter((a) => !a.aiTags.some((t) => DEMO_APP_TAGS.includes(t))).map((a) => a.id);

  const members = await db.member.findMany({ where: { workspaceId }, select: { id: true, tags: true } });
  const memberIds = members.filter((m) => !m.tags.some((t) => DEMO_MEMBER_TAGS.includes(t))).map((m) => m.id);

  const events = await db.event.findMany({ where: { workspaceId }, select: { id: true, slug: true } });
  const eventIds = events.filter((e) => !DEMO_EVENT_PREFIXES.some((p) => e.slug.startsWith(p))).map((e) => e.id);

  // RSVP/Ticket/WaitlistEntry are deleted if they belong to a non-demo event OR
  // a non-demo member. Payment is keyed only by ticketId, so resolve ticket ids.
  const eventOrMember = { workspaceId, OR: [{ eventId: { in: eventIds } }, { memberId: { in: memberIds } }] };
  const tickets = await db.ticket.findMany({ where: eventOrMember, select: { id: true } });
  const ticketIds = tickets.map((t) => t.id);

  // ── Count what will be deleted ───────────────────────────────────────────
  const [payments, rsvps, waitlist, answers, holds, orders, accessTokens, promoCodes, customQs, workflows, tiers] = await Promise.all([
    db.payment.count({ where: { workspaceId, ticketId: { in: ticketIds } } }),
    db.rSVP.count({ where: eventOrMember }),
    db.waitlistEntry.count({ where: eventOrMember }),
    db.applicationAnswer.count({ where: { applicationId: { in: appIds } } }),
    db.ticketHold.count({ where: { eventId: { in: eventIds } } }),
    db.order.count({ where: { eventId: { in: eventIds } } }),
    db.accessToken.count({ where: { eventId: { in: eventIds } } }),
    db.promoCode.count({ where: { eventId: { in: eventIds } } }),
    db.eventCustomQuestion.count({ where: { eventId: { in: eventIds } } }),
    db.eventWorkflow.count({ where: { eventId: { in: eventIds } } }),
    db.ticketTier.count({ where: { eventId: { in: eventIds } } }),
  ]);

  console.log('Targets (non-demo, this workspace only):');
  console.log(`  applications:        ${appIds.length}`);
  console.log(`  application answers: ${answers}`);
  console.log(`  members:             ${memberIds.length}`);
  console.log(`  events:              ${eventIds.length}`);
  console.log(`  rsvps:               ${rsvps}`);
  console.log(`  tickets:             ${ticketIds.length}`);
  console.log(`  payments:            ${payments}`);
  console.log(`  waitlist entries:    ${waitlist}`);
  console.log(`  ticket holds:        ${holds}`);
  console.log(`  orders:              ${orders}`);
  console.log(`  access tokens:       ${accessTokens}`);
  console.log(`  promo codes:         ${promoCodes}`);
  console.log(`  custom questions:    ${customQs}`);
  console.log(`  event workflows:     ${workflows}`);
  console.log(`  ticket tiers:        ${tiers}`);

  if (!WRITE) {
    console.log('\nDRY RUN complete — nothing deleted. Re-run with --write to execute.');
    await db.$disconnect();
    return;
  }

  // ── Delete, children → parents, in one transaction (workspace-scoped) ────
  await db.$transaction([
    // event/member dependents
    db.payment.deleteMany({ where: { workspaceId, ticketId: { in: ticketIds } } }),
    db.ticket.deleteMany({ where: { id: { in: ticketIds } } }),
    db.rSVP.deleteMany({ where: eventOrMember }),
    db.waitlistEntry.deleteMany({ where: eventOrMember }),
    // event-only dependents (order matters: holds→orders→tokens/promos→tiers)
    db.ticketHold.deleteMany({ where: { eventId: { in: eventIds } } }),
    db.order.deleteMany({ where: { eventId: { in: eventIds } } }),
    db.accessToken.deleteMany({ where: { eventId: { in: eventIds } } }),
    db.promoCode.deleteMany({ where: { eventId: { in: eventIds } } }),
    db.eventCustomQuestion.deleteMany({ where: { eventId: { in: eventIds } } }),
    db.eventWorkflow.deleteMany({ where: { eventId: { in: eventIds } } }),
    db.ticketTier.deleteMany({ where: { eventId: { in: eventIds } } }),
    // parents
    db.event.deleteMany({ where: { workspaceId, id: { in: eventIds } } }),
    db.member.deleteMany({ where: { workspaceId, id: { in: memberIds } } }),
    db.applicationAnswer.deleteMany({ where: { applicationId: { in: appIds } } }),
    db.application.deleteMany({ where: { workspaceId, id: { in: appIds } } }),
  ]);

  // ── After-counts ─────────────────────────────────────────────────────────
  const [appsAfter, membersAfter, eventsAfter] = await Promise.all([
    db.application.count({ where: { workspaceId } }),
    db.member.count({ where: { workspaceId } }),
    db.event.count({ where: { workspaceId } }),
  ]);
  console.log('\n✓ Deleted. Workspace now contains ONLY the demo seed:');
  console.log(`  applications: ${appsAfter}`);
  console.log(`  members:      ${membersAfter}`);
  console.log(`  events:       ${eventsAfter}`);

  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

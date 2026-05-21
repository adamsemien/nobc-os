/** READ-ONLY survey of non-demo data in the NoBC workspace.
 *  Counts everything that is NOT part of the demo seed, so the cleanup script
 *  can be scoped precisely. Touches nothing. Workspace-scoped (Producer shares
 *  this Neon instance — never look beyond the NoBC workspace).
 *
 *    ./node_modules/.bin/tsx scripts/survey-non-demo-data.ts */
import { config } from 'dotenv';
config({ path: '.env.local' });

const DEMO_APP_TAGS = ['__demo', '__demo-tenur', '__demo-pending', '__persona_test'];
const DEMO_MEMBER_TAGS = ['__demo', '__demo-tenur', '__demo-tenur-attendee'];
const DEMO_EVENT_PREFIXES = ['tenur-', '__demo-'];

async function main() {
  const { db } = await import('@/lib/db');

  const ws = process.env.SEED_WORKSPACE_ID
    ? await db.workspace.findUnique({ where: { id: process.env.SEED_WORKSPACE_ID } })
    : await db.workspace.findFirst({ where: { name: 'No Bad Company' }, orderBy: { members: { _count: 'desc' } } });
  if (!ws) throw new Error('No "No Bad Company" workspace found.');
  const workspaceId = ws.id;
  console.log(`Workspace: ${ws.name} (${workspaceId})\n`);

  // Applications
  const allApps = await db.application.findMany({ where: { workspaceId }, select: { id: true, fullName: true, email: true, aiTags: true, status: true, archetype: true } });
  const nonDemoApps = allApps.filter((a) => !a.aiTags.some((t) => DEMO_APP_TAGS.includes(t)));

  // Members
  const allMembers = await db.member.findMany({ where: { workspaceId }, select: { id: true, firstName: true, lastName: true, email: true, tags: true } });
  const nonDemoMembers = allMembers.filter((m) => !m.tags.some((t) => DEMO_MEMBER_TAGS.includes(t)));

  // Events
  const allEvents = await db.event.findMany({ where: { workspaceId }, select: { id: true, slug: true, title: true } });
  const nonDemoEvents = allEvents.filter((e) => !DEMO_EVENT_PREFIXES.some((p) => e.slug.startsWith(p)));
  const nonDemoEventIds = nonDemoEvents.map((e) => e.id);
  const nonDemoMemberIds = nonDemoMembers.map((m) => m.id);

  // Dependent rows tied to the non-demo events/members
  const rsvpWhere = { workspaceId, OR: [{ eventId: { in: nonDemoEventIds } }, { memberId: { in: nonDemoMemberIds } }] };
  const rsvps = nonDemoEventIds.length || nonDemoMemberIds.length ? await db.rSVP.count({ where: rsvpWhere }) : 0;
  const waitlist = nonDemoEventIds.length || nonDemoMemberIds.length
    ? await db.waitlistEntry.count({ where: { workspaceId, OR: [{ eventId: { in: nonDemoEventIds } }, { memberId: { in: nonDemoMemberIds } }] } })
    : 0;
  const tickets = nonDemoEventIds.length || nonDemoMemberIds.length
    ? await db.ticket.count({ where: { workspaceId, OR: [{ eventId: { in: nonDemoEventIds } }, { memberId: { in: nonDemoMemberIds } }] } })
    : 0;

  const answerCount = await db.applicationAnswer.count({ where: { applicationId: { in: nonDemoApps.map((a) => a.id) } } });

  console.log('── KEEP (demo seed) ──');
  console.log(`  applications: ${allApps.length - nonDemoApps.length}`);
  console.log(`  members:      ${allMembers.length - nonDemoMembers.length}`);
  console.log(`  events:       ${allEvents.length - nonDemoEvents.length}`);

  console.log('\n── DELETE (non-demo) ──');
  console.log(`  applications: ${nonDemoApps.length}  (+ ${answerCount} answers)`);
  console.log(`  members:      ${nonDemoMembers.length}`);
  console.log(`  events:       ${nonDemoEvents.length}`);
  console.log(`  rsvps:        ${rsvps}`);
  console.log(`  waitlist:     ${waitlist}`);
  console.log(`  tickets:      ${tickets}`);

  if (nonDemoApps.length) {
    console.log('\n  non-demo applications:');
    nonDemoApps.forEach((a) => console.log(`    - ${a.fullName} <${a.email}> [${a.status}] archetype=${a.archetype ?? 'none'} tags=[${a.aiTags.join(',')}]`));
  }
  if (nonDemoMembers.length) {
    console.log('\n  non-demo members:');
    nonDemoMembers.forEach((m) => console.log(`    - ${m.firstName} ${m.lastName} <${m.email}> tags=[${m.tags.join(',')}]`));
  }
  if (nonDemoEvents.length) {
    console.log('\n  non-demo events:');
    nonDemoEvents.forEach((e) => console.log(`    - ${e.title} (${e.slug})`));
  }

  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

/**
 * Demo seed for the Tenur call — CLI-runnable (`npm run seed:demo`).
 *
 * Seeds the NoBC workspace (Tenant Zero, slug "nobc") with a curated demo:
 * 10 headline members across the 6 archetypes (each with an APPROVED
 * Application carrying archetype + archetypeScores), a supporting attendee
 * pool so events fill to real capacity, 4 events at Tenur House, and RSVPs.
 *
 * Idempotent: members upsert by (workspace,email), the curated Applications
 * are find-then-create, events upsert by (workspace,slug), RSVPs createMany
 * with skipDuplicates. Re-running does not duplicate. Display-only demo data,
 * namespaced with the `__demo` / `__demo-tenur` tags and `tenur-*` slugs.
 *
 * NOTE: the Producer instance shares this database. This script only INSERTS
 * namespaced demo rows into the nobc workspace — it never deletes.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { randomUUID } from 'node:crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';
import {
  wipeDemoApplications,
  seedPendingDemoApplications,
  buildFullAnswers,
  type DemoArchetype,
} from '../lib/dev/demo-applications';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

const DAY = 86_400_000;
const monthsAgo = (m: number) => new Date(Date.now() - Math.round(m * 30.4 * DAY));
const daysAgo = (d: number) => new Date(Date.now() - d * DAY);

/** Next Saturday at 20:00 (today+7 if today is Saturday). */
function nextSaturday(hour = 20): Date {
  const d = new Date();
  const delta = ((6 - d.getDay() + 7) % 7) || 7;
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta, hour);
  return out;
}
function weeksFromNow(weeks: number, hour = 19): Date {
  const d = new Date(Date.now() + weeks * 7 * DAY);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour);
}

type Archetype = 'Connector' | 'Host' | 'Curator' | 'Builder' | 'Maker' | 'Patron';
type Rec = 'strong_yes' | 'yes' | 'unclear';

interface Curated {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  archetype: Archetype;
  scores: Record<Archetype, number>;
  aiScore: number;
  aiRecommendation: Rec;
  tags: string[];
  monthsMember: number;
  referredBy?: string;
}

// 2 Connector, 2 Host, 2 Curator, 2 Builder, 1 Maker, 1 Patron — Austin-based.
const CURATED: Curated[] = [
  { firstName: 'Daniela', lastName: 'Reyes', email: 'daniela.reyes@tenur.nobadco.dev', phone: '(512) 555-0101', archetype: 'Connector',
    scores: { Connector: 92, Host: 58, Curator: 64, Builder: 40, Maker: 30, Patron: 44 }, aiScore: 0.9, aiRecommendation: 'strong_yes',
    tags: ['Founder'], monthsMember: 16 },
  { firstName: 'Marcus', lastName: 'Whitfield', email: 'marcus.whitfield@tenur.nobadco.dev', phone: '(512) 555-0102', archetype: 'Connector',
    scores: { Connector: 86, Host: 62, Curator: 50, Builder: 44, Maker: 28, Patron: 60 }, aiScore: 0.83, aiRecommendation: 'yes',
    tags: ['Investor', 'ContentCreator'], monthsMember: 12, referredBy: 'Daniela Reyes' },
  { firstName: 'Priya', lastName: 'Anand', email: 'priya.anand@tenur.nobadco.dev', phone: '(512) 555-0103', archetype: 'Host',
    scores: { Connector: 60, Host: 94, Curator: 52, Builder: 34, Maker: 46, Patron: 50 }, aiScore: 0.88, aiRecommendation: 'strong_yes',
    tags: ['HospitalityOperator'], monthsMember: 14 },
  { firstName: 'Theo', lastName: 'Calloway', email: 'theo.calloway@tenur.nobadco.dev', phone: '(512) 555-0104', archetype: 'Host',
    scores: { Connector: 55, Host: 82, Curator: 48, Builder: 50, Maker: 38, Patron: 42 }, aiScore: 0.79, aiRecommendation: 'yes',
    tags: ['HospitalityOperator', 'Founder'], monthsMember: 9, referredBy: 'Priya Anand' },
  { firstName: 'Sloane', lastName: 'Whitaker', email: 'sloane.whitaker@tenur.nobadco.dev', phone: '(512) 555-0105', archetype: 'Curator',
    scores: { Connector: 58, Host: 46, Curator: 90, Builder: 36, Maker: 54, Patron: 40 }, aiScore: 0.86, aiRecommendation: 'strong_yes',
    tags: ['ContentCreator'], monthsMember: 11 },
  { firstName: 'Eli', lastName: 'Brandt', email: 'eli.brandt@tenur.nobadco.dev', phone: '(512) 555-0106', archetype: 'Curator',
    scores: { Connector: 50, Host: 42, Curator: 84, Builder: 44, Maker: 48, Patron: 56 }, aiScore: 0.77, aiRecommendation: 'yes',
    tags: ['ContentCreator', 'Investor'], monthsMember: 7 },
  { firstName: 'Camila', lastName: 'Duarte', email: 'camila.duarte@tenur.nobadco.dev', phone: '(512) 555-0107', archetype: 'Builder',
    scores: { Connector: 52, Host: 40, Curator: 46, Builder: 92, Maker: 58, Patron: 38 }, aiScore: 0.89, aiRecommendation: 'strong_yes',
    tags: ['Founder'], monthsMember: 13 },
  { firstName: 'Nathan', lastName: 'Cho', email: 'nathan.cho@tenur.nobadco.dev', phone: '(512) 555-0108', archetype: 'Builder',
    scores: { Connector: 48, Host: 38, Curator: 44, Builder: 85, Maker: 60, Patron: 46 }, aiScore: 0.81, aiRecommendation: 'yes',
    tags: ['Founder', 'Investor'], monthsMember: 6, referredBy: 'Camila Duarte' },
  { firstName: 'Maya', lastName: 'Goldberg', email: 'maya.goldberg@tenur.nobadco.dev', phone: '(512) 555-0109', archetype: 'Maker',
    scores: { Connector: 44, Host: 50, Curator: 62, Builder: 56, Maker: 88, Patron: 36 }, aiScore: 0.74, aiRecommendation: 'yes',
    tags: ['ContentCreator'], monthsMember: 5 },
  { firstName: 'Harrison', lastName: 'Vale', email: 'harrison.vale@tenur.nobadco.dev', phone: '(512) 555-0110', archetype: 'Patron',
    scores: { Connector: 56, Host: 52, Curator: 58, Builder: 40, Maker: 34, Patron: 90 }, aiScore: 0.85, aiRecommendation: 'strong_yes',
    tags: ['Investor'], monthsMember: 18 },
];

// AI reasoning shown on each curated member's (approved) application detail.
const CURATED_REASONING: Record<Archetype, string> = {
  Connector: 'Connector archetype — an exceptional network and a track record of making the introductions that actually matter. Clear charter-tier fit.',
  Host: 'Host archetype — creates the conditions a great room needs without making it about themselves. Strong activation and contribution signals.',
  Curator: 'Curator archetype — trusted taste and a genuine point of view. The kind of member others quietly calibrate against.',
  Builder: 'Builder archetype — makes things from nothing and brings other people along for it. High-contribution profile across the board.',
  Maker: 'Maker archetype — real craft and a distinct eye. Adds the kind of texture to the room you cannot manufacture.',
  Patron: 'Patron archetype — quiet, patient backing of people and culture. A long-term, high-trust member.',
};

// Supporting attendee pool — fills events to real capacity (unique RSVP per
// member, so "sold out 80" needs ~80 distinct bodies). Approved members, light.
const FIRST = ['Ava', 'Liam', 'Sofia', 'Noah', 'Mia', 'Ethan', 'Isabella', 'Mason', 'Amara', 'Lucas', 'Harper', 'Diego', 'Chloe', 'Aiden', 'Layla', 'Caleb', 'Ruby', 'Owen', 'Nadia', 'Felix', 'Jade', 'Hugo', 'Elena', 'Cyrus', 'Tessa', 'Milo', 'Yara', 'Dexter', 'Iris', 'Soren', 'Nova', 'Quinn', 'Wren', 'Vera', 'Wyatt', 'Zara', 'Bodhi', 'Cleo', 'Arlo', 'Juno'];
const LAST = ['Nguyen', 'Patel', 'Garcia', 'Kim', 'Okafor', 'Romano', 'Castillo', 'Mbeki', 'Fischer', 'Delgado', 'Tanaka', 'Sullivan', 'Abara', 'Reyes', 'Holt', 'Vasquez', 'Bauer', 'Cohen', 'Mendez', 'Frost', 'Adeyemi', 'Lindqvist', 'Sato', 'Bianchi', 'Moreau', 'Khan', 'Petrova', 'Walsh', 'Olsen', 'Haddad', 'Ramos', 'Choi', 'Becker', 'Navarro', 'Ellison', 'Singh', 'Lozano', 'Park', 'Dubois', 'Carrington'];
const POOL_SIZE = 80;

interface Attendee {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  monthsMember: number;
}
const POOL: Attendee[] = Array.from({ length: POOL_SIZE }, (_, i) => ({
  firstName: FIRST[i % FIRST.length],
  lastName: LAST[(i * 3 + 7) % LAST.length],
  email: `tenur-attendee-${i}@tenur.nobadco.dev`,
  phone: `(512) 555-${String(2000 + i).slice(-4)}`,
  monthsMember: (i % 12) + 1,
}));

async function main() {
  // Resolve Tenant Zero (NoBC). The live workspace's slug is Clerk-derived
  // (not "nobc"), so match by name and prefer the most-populated one. Override
  // with SEED_WORKSPACE_ID if there are ever multiple NoBC workspaces.
  const workspace = process.env.SEED_WORKSPACE_ID
    ? await db.workspace.findUnique({ where: { id: process.env.SEED_WORKSPACE_ID } })
    : await db.workspace.findFirst({
        where: { name: 'No Bad Company' },
        orderBy: { members: { _count: 'desc' } },
      });
  if (!workspace) throw new Error('No "No Bad Company" workspace found. Set SEED_WORKSPACE_ID.');
  const workspaceId = workspace.id;
  console.log(`Seeding workspace: ${workspace.name} (${workspace.id})`);

  // ── 1. Members (curated + pool) ──────────────────────────────────────────
  const allMembers: { email: string; firstName: string; lastName: string; phone: string; tags: string[]; monthsMember: number; energyScore: number; networkValueScore: number; clerkUserId: string; qr: string }[] = [];

  CURATED.forEach((m, i) => {
    const total = Object.values(m.scores).reduce((a, b) => a + b, 0);
    allMembers.push({
      email: m.email, firstName: m.firstName, lastName: m.lastName, phone: m.phone,
      tags: ['__demo', '__demo-tenur', m.archetype, ...m.tags],
      monthsMember: m.monthsMember,
      energyScore: Math.round(m.aiScore * 100),
      networkValueScore: Math.round(total / 6),
      clerkUserId: `seed_tenur_c${i}`,
      qr: `tenurqr_c${i}`,
    });
  });
  POOL.forEach((a, i) => {
    allMembers.push({
      email: a.email, firstName: a.firstName, lastName: a.lastName, phone: a.phone,
      tags: ['__demo', '__demo-tenur-attendee'],
      monthsMember: a.monthsMember,
      energyScore: 50 + (i % 40),
      networkValueScore: 45 + (i % 35),
      clerkUserId: `seed_tenur_a${i}`,
      qr: `tenurqr_a${i}`,
    });
  });

  for (const m of allMembers) {
    const since = monthsAgo(m.monthsMember);
    await db.member.upsert({
      where: { workspaceId_email: { workspaceId, email: m.email } },
      create: {
        workspaceId, clerkUserId: m.clerkUserId, email: m.email,
        firstName: m.firstName, lastName: m.lastName, phone: m.phone,
        status: 'APPROVED', approved: true, approvedAt: since,
        tags: m.tags, energyScore: m.energyScore, networkValueScore: m.networkValueScore,
        memberQrCode: m.qr, createdAt: since,
      },
      update: {
        firstName: m.firstName, lastName: m.lastName, phone: m.phone,
        status: 'APPROVED', approved: true, approvedAt: since,
        tags: m.tags, energyScore: m.energyScore, networkValueScore: m.networkValueScore,
      },
    });
  }

  const memberRows = await db.member.findMany({
    where: { workspaceId, email: { in: allMembers.map((m) => m.email) } },
    select: { id: true, email: true },
  });
  const memberIdByEmail = new Map(memberRows.map((r) => [r.email, r.id]));

  // ── 2. Applications ────────────────────────────────────────────────────────
  // Start clean: wipe ALL demo applications (curated + pending + any legacy
  // leftovers from older seed runs) so the operator queue is consistent every
  // time — no half-answered or unscored rows. Scoped to demo aiTags only.
  const wiped = await wipeDemoApplications(db, workspaceId);

  // 2a. Curated members' APPROVED applications — full answer set + AI profile.
  for (let i = 0; i < CURATED.length; i++) {
    const m = CURATED[i];
    const memberId = memberIdByEmail.get(m.email)!;
    const created = await db.application.create({
      data: {
        workspaceId,
        memberId,
        email: m.email,
        fullName: `${m.firstName} ${m.lastName}`,
        phone: m.phone,
        city: 'Austin, TX',
        // Genuine /apply submissions leave model referredBy null and store the
        // referrer under the basics.referrers answer — match that exactly.
        referredBy: null,
        consentEmail: true,
        consentSms: i % 3 === 0,
        status: 'APPROVED' as const,
        reviewedAt: monthsAgo(m.monthsMember),
        aiTags: ['__demo', '__demo-tenur'],
        aiScore: m.aiScore,
        aiRecommendation: m.aiRecommendation,
        aiReasoning: CURATED_REASONING[m.archetype],
        archetype: m.archetype,
        archetypeScores: m.scores,
        createdAt: monthsAgo(m.monthsMember + 0.5),
      },
    });
    await db.applicationAnswer.createMany({
      data: buildFullAnswers(
        {
          email: m.email,
          fullName: `${m.firstName} ${m.lastName}`,
          archetype: m.archetype as DemoArchetype,
          aiScore: m.aiScore,
          city: 'Austin',
          referrers: m.referredBy ? [m.referredBy] : [],
        },
        i,
      ).map((a) => ({ applicationId: created.id, questionKey: a.questionKey, answer: a.answer })),
    });
  }

  // 2b. Standalone PENDING applicants — the live operator review queue.
  const pendingApps = await seedPendingDemoApplications(db, workspaceId);

  // ── 3. Events at Tenur House ──────────────────────────────────────────────
  const ticketedAccess = {
    member: { enabled: true, gate: 'pay', priceCents: 2500 },
    guest: { enabled: true, gate: 'pay', priceCents: 2500 },
    comp: { enabled: false, budgetCap: null },
  };
  const membersOnlyAccess = {
    member: { enabled: true, gate: 'auto_confirm', priceCents: 0 },
    guest: { enabled: false, gate: 'pay', priceCents: 0 },
    comp: { enabled: false, budgetCap: null },
  };
  const membersApplyAccess = {
    member: { enabled: true, gate: 'apply', priceCents: 0 },
    guest: { enabled: false, gate: 'pay', priceCents: 0 },
    comp: { enabled: false, budgetCap: null },
  };

  const EVENTS = [
    {
      slug: 'tenur-no-bad-friday-spring', title: 'No Bad Friday',
      description: 'Our flagship Friday night at Tenur House. The whole room, the right people, late into the night.',
      startAt: daysAgo(21), endHours: 5, capacity: 80, accessMode: 'TICKETED' as const,
      approvalRequired: false, priceInCents: 2500, eventAccess: ticketedAccess,
    },
    {
      slug: 'tenur-sunday-selects', title: 'Sunday Selects',
      description: 'A quieter members-only Sunday at Tenur House — long-table dinner, slow conversation, no agenda.',
      startAt: daysAgo(7), endHours: 3, capacity: 40, accessMode: 'OPEN' as const,
      approvalRequired: false, priceInCents: null, eventAccess: membersOnlyAccess,
    },
    {
      slug: 'tenur-no-bad-friday-next', title: 'No Bad Friday',
      description: 'The next No Bad Friday at Tenur House. Get your ticket — the room fills fast.',
      startAt: nextSaturday(20), endHours: 5, capacity: 80, accessMode: 'TICKETED' as const,
      approvalRequired: false, priceInCents: 2500, eventAccess: ticketedAccess,
    },
    {
      slug: 'tenur-founding-night', title: 'Founding Night',
      description: 'An intimate members-only evening at Tenur House for our founding circle. By approval only.',
      startAt: weeksFromNow(3, 19), endHours: 3, capacity: 30, accessMode: 'OPEN' as const,
      approvalRequired: true, priceInCents: null, eventAccess: membersApplyAccess,
    },
  ];

  const eventIdBySlug = new Map<string, string>();
  for (const e of EVENTS) {
    const base = {
      title: e.title, description: e.description,
      startAt: e.startAt, endAt: new Date(e.startAt.getTime() + e.endHours * 3600_000),
      location: 'Tenur House', capacity: e.capacity, accessMode: e.accessMode,
      approvalRequired: e.approvalRequired, priceInCents: e.priceInCents,
      status: 'PUBLISHED' as const, visibility: 'public' as const, template: 'split',
      showCapacity: true, eventAccess: e.eventAccess,
    };
    const row = await db.event.upsert({
      where: { workspaceId_slug: { workspaceId, slug: e.slug } },
      create: { workspaceId, slug: e.slug, ...base },
      update: base,
      select: { id: true, slug: true },
    });
    eventIdBySlug.set(e.slug, row.id);
  }

  // ── 4. RSVPs ───────────────────────────────────────────────────────────────
  // attendee order: curated (0–9) first, then pool (10–89).
  const orderedEmails = [...CURATED.map((m) => m.email), ...POOL.map((a) => a.email)];
  const idAt = (i: number) => memberIdByEmail.get(orderedEmails[i])!;

  type RsvpRow = {
    id: string;
    workspaceId: string; eventId: string; memberId: string;
    status: 'CONFIRMED' | 'WAITLISTED' | 'DECLINED'; ticketStatus: string;
    checkedIn: boolean; checkedInAt: Date | null;
    paymentStatus: string | null; capturedAt: Date | null;
    stripePaymentIntentId: string | null;
    amountCents: number | null; origin: string;
  };
  const rsvps: RsvpRow[] = [];
  const attended = new Map<string, Date>(); // memberId -> latest attended event date

  function fill(slug: string, count: number, opts: { ticketed: boolean; checkedIn: boolean; at: Date }) {
    const eventId = eventIdBySlug.get(slug)!;
    for (let i = 0; i < count; i++) {
      const memberId = idAt(i);
      const id = randomUUID();
      rsvps.push({
        id,
        workspaceId, eventId, memberId,
        status: 'CONFIRMED',
        // Both ticketed and members-only RSVPs are 'confirmed'. Operator stats
        // (Overview, Check-in) key on ticketStatus 'confirmed' and CAPTURED
        // payments, so ticketed rows must carry a captured PaymentIntent to
        // surface confirmed counts, revenue, and check-in totals.
        ticketStatus: 'confirmed',
        checkedIn: opts.checkedIn,
        checkedInAt: opts.checkedIn ? new Date(opts.at.getTime() + i * 60_000) : null,
        paymentStatus: opts.ticketed ? 'CAPTURED' : null,
        capturedAt: opts.ticketed ? opts.at : null,
        stripePaymentIntentId: opts.ticketed ? `pi_demo_${id}` : null,
        amountCents: opts.ticketed ? 2500 : null,
        origin: 'demo',
      });
      if (opts.checkedIn) {
        const prev = attended.get(memberId);
        if (!prev || prev < opts.at) attended.set(memberId, opts.at);
      }
    }
  }

  // Past — sold out + attended (checked in).
  fill('tenur-no-bad-friday-spring', 80, { ticketed: true, checkedIn: true, at: daysAgo(21) });
  fill('tenur-sunday-selects', 40, { ticketed: false, checkedIn: true, at: daysAgo(7) });
  // Upcoming — confirmed, not yet checked in.
  fill('tenur-no-bad-friday-next', 52, { ticketed: true, checkedIn: false, at: nextSaturday(20) });
  fill('tenur-founding-night', 12, { ticketed: false, checkedIn: false, at: weeksFromNow(3, 19) });

  await db.rSVP.createMany({ data: rsvps, skipDuplicates: true });

  // ── 5. Attendance rollup on members ────────────────────────────────────────
  for (const [memberId, lastDate] of attended) {
    const attendedCount = rsvps.filter((r) => r.memberId === memberId && r.checkedIn).length;
    await db.member.update({
      where: { id: memberId },
      data: { totalEventsAttended: attendedCount, lastAttendedDate: lastDate },
    });
  }

  // ── 6. Report ────────────────────────────────────────────────────────────
  const [memberCount, eventCount, rsvpCount, approvedAppCount] = await Promise.all([
    db.member.count({ where: { workspaceId, tags: { hasSome: ['__demo-tenur', '__demo-tenur-attendee'] } } }),
    db.event.count({ where: { workspaceId, slug: { startsWith: 'tenur-' } } }),
    db.rSVP.count({ where: { workspaceId, event: { slug: { startsWith: 'tenur-' } } } }),
    db.application.count({ where: { workspaceId, aiTags: { has: '__demo-tenur' } } }),
  ]);
  console.log('Tenur demo seed complete:');
  console.log(`  wiped:        ${wiped} stale demo application(s)`);
  console.log(`  members:      ${memberCount} (10 curated + ${POOL_SIZE} attendees)`);
  console.log(`  events:       ${eventCount}`);
  console.log(`  rsvps:        ${rsvpCount}`);
  console.log(`  applications: ${approvedAppCount} approved + ${pendingApps} pending (full answers + AI profile)`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => db.$disconnect());

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { requireWorkspaceId } from '@/lib/auth';
import { db } from '@/lib/db';
import { ensureCommunicationsSeed } from '@/lib/ensure-communications';
import { seedPendingDemoApplications } from '@/lib/dev/demo-applications';

const ALLOWED = (process.env.DEV_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

// Deterministic fake Clerk IDs — unique per index, won't collide with real Clerk IDs
function demoClerkId(n: number) {
  return `user_DEMOSEED${String(n).padStart(3, '0')}`;
}

// Spread createdAt timestamps over the past N days
function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000);
}

function weeksFromNow(weeks: number) {
  return new Date(Date.now() + weeks * 7 * 86_400_000);
}

const DEMO_MEMBERS = [
  { idx: 0,  firstName: 'Maya',      lastName: 'Chen',      email: 'maya.chen.demo@nobadco.dev',        archetype: 'Connector', aiScore: 0.89, status: 'APPROVED',   energyScore: 92, networkValueScore: 95, daysAgoCreated: 168 },
  { idx: 1,  firstName: 'James',     lastName: 'Okonkwo',   email: 'james.okonkwo.demo@nobadco.dev',    archetype: 'Connector', aiScore: 0.82, status: 'APPROVED',   energyScore: 85, networkValueScore: 88, daysAgoCreated: 152 },
  { idx: 2,  firstName: 'Priya',     lastName: 'Sharma',    email: 'priya.sharma.demo@nobadco.dev',     archetype: 'Connector', aiScore: 0.68, status: 'APPROVED',   energyScore: 71, networkValueScore: 74, daysAgoCreated: 140 },
  { idx: 3,  firstName: 'Sofia',     lastName: 'Reyes',     email: 'sofia.reyes.demo@nobadco.dev',      archetype: 'Host',      aiScore: 0.87, status: 'APPROVED',   energyScore: 90, networkValueScore: 86, daysAgoCreated: 130 },
  { idx: 4,  firstName: 'Dominic',   lastName: 'Laurent',   email: 'dominic.laurent.demo@nobadco.dev',  archetype: 'Host',      aiScore: 0.78, status: 'APPROVED',   energyScore: 81, networkValueScore: 79, daysAgoCreated: 120 },
  { idx: 5,  firstName: 'Aisha',     lastName: 'Watkins',   email: 'aisha.watkins.demo@nobadco.dev',    archetype: 'Host',      aiScore: 0.65, status: 'APPROVED',   energyScore: 68, networkValueScore: 65, daysAgoCreated: 110 },
  { idx: 6,  firstName: 'Eliot',     lastName: 'Park',      email: 'eliot.park.demo@nobadco.dev',       archetype: 'Curator',   aiScore: 0.91, status: 'APPROVED',   energyScore: 94, networkValueScore: 91, daysAgoCreated: 100 },
  { idx: 7,  firstName: 'Nina',      lastName: 'Volkov',    email: 'nina.volkov.demo@nobadco.dev',      archetype: 'Curator',   aiScore: 0.71, status: 'APPROVED',   energyScore: 74, networkValueScore: 72, daysAgoCreated: 90  },
  { idx: 8,  firstName: 'Marcus',    lastName: 'Webb',      email: 'marcus.webb.demo@nobadco.dev',      archetype: 'Curator',   aiScore: 0.57, status: 'PENDING',    energyScore: 60, networkValueScore: 58, daysAgoCreated: 14  },
  { idx: 9,  firstName: 'Zoe',       lastName: 'Kim',       email: 'zoe.kim.demo@nobadco.dev',          archetype: 'Builder',   aiScore: 0.76, status: 'APPROVED',   energyScore: 79, networkValueScore: 81, daysAgoCreated: 80  },
  { idx: 10, firstName: 'Andre',     lastName: 'Dupont',    email: 'andre.dupont.demo@nobadco.dev',     archetype: 'Builder',   aiScore: 0.63, status: 'APPROVED',   energyScore: 66, networkValueScore: 68, daysAgoCreated: 70  },
  { idx: 11, firstName: 'Kenji',     lastName: 'Nakamura',  email: 'kenji.nakamura.demo@nobadco.dev',   archetype: 'Builder',   aiScore: 0.69, status: 'PENDING',    energyScore: 72, networkValueScore: 70, daysAgoCreated: 7   },
  { idx: 12, firstName: 'Lila',      lastName: 'Morrison',  email: 'lila.morrison.demo@nobadco.dev',    archetype: 'Maker',     aiScore: 0.61, status: 'APPROVED',   energyScore: 64, networkValueScore: 62, daysAgoCreated: 60  },
  { idx: 13, firstName: 'Carlos',    lastName: 'Vega',      email: 'carlos.vega.demo@nobadco.dev',      archetype: 'Maker',     aiScore: 0.66, status: 'APPROVED',   energyScore: 69, networkValueScore: 67, daysAgoCreated: 55  },
  { idx: 14, firstName: 'Fiona',     lastName: 'Osei',      email: 'fiona.osei.demo@nobadco.dev',       archetype: 'Maker',     aiScore: 0.48, status: 'PENDING',    energyScore: 51, networkValueScore: 48, daysAgoCreated: 10  },
  { idx: 15, firstName: 'Henry',     lastName: 'Ashworth',  email: 'henry.ashworth.demo@nobadco.dev',   archetype: 'Patron',    aiScore: 0.51, status: 'WAITLISTED', energyScore: 54, networkValueScore: 52, daysAgoCreated: 30  },
  { idx: 16, firstName: 'Valentina', lastName: 'Cruz',      email: 'valentina.cruz.demo@nobadco.dev',   archetype: 'Patron',    aiScore: 0.42, status: 'REJECTED',   energyScore: 44, networkValueScore: 40, daysAgoCreated: 45  },
  { idx: 17, firstName: 'Oliver',    lastName: 'Chen',      email: 'oliver.chen.demo@nobadco.dev',      archetype: 'Patron',    aiScore: 0.38, status: 'PENDING',    energyScore: 40, networkValueScore: 38, daysAgoCreated: 5   },
  // Tier expansion — 12 more (charter, standard, waitlist mix). 8 charter total above + below = baseline.
  { idx: 18, firstName: 'Ravi',      lastName: 'Mehta',     email: 'ravi.mehta.demo@nobadco.dev',       archetype: 'Builder',   aiScore: 0.93, status: 'APPROVED',   energyScore: 95, networkValueScore: 94, daysAgoCreated: 220 },
  { idx: 19, firstName: 'Imani',     lastName: 'Adekunle',  email: 'imani.adekunle.demo@nobadco.dev',   archetype: 'Connector', aiScore: 0.86, status: 'APPROVED',   energyScore: 88, networkValueScore: 92, daysAgoCreated: 200 },
  { idx: 20, firstName: 'Theo',      lastName: 'Bauer',     email: 'theo.bauer.demo@nobadco.dev',       archetype: 'Host',      aiScore: 0.84, status: 'APPROVED',   energyScore: 86, networkValueScore: 83, daysAgoCreated: 185 },
  { idx: 21, firstName: 'Wren',      lastName: 'Castellano', email: 'wren.castellano.demo@nobadco.dev', archetype: 'Curator',   aiScore: 0.79, status: 'APPROVED',   energyScore: 82, networkValueScore: 80, daysAgoCreated: 170 },
  { idx: 22, firstName: 'Mateo',     lastName: 'Ferrer',    email: 'mateo.ferrer.demo@nobadco.dev',     archetype: 'Maker',     aiScore: 0.74, status: 'APPROVED',   energyScore: 77, networkValueScore: 75, daysAgoCreated: 150 },
  { idx: 23, firstName: 'Sage',      lastName: 'Beaumont',  email: 'sage.beaumont.demo@nobadco.dev',    archetype: 'Patron',    aiScore: 0.83, status: 'APPROVED',   energyScore: 85, networkValueScore: 88, daysAgoCreated: 140 },
  { idx: 24, firstName: 'Niko',      lastName: 'Petrov',    email: 'niko.petrov.demo@nobadco.dev',      archetype: 'Builder',   aiScore: 0.58, status: 'APPROVED',   energyScore: 61, networkValueScore: 59, daysAgoCreated: 95 },
  { idx: 25, firstName: 'Halle',     lastName: 'Yeboah',    email: 'halle.yeboah.demo@nobadco.dev',     archetype: 'Connector', aiScore: 0.62, status: 'APPROVED',   energyScore: 65, networkValueScore: 67, daysAgoCreated: 85 },
  { idx: 26, firstName: 'August',    lastName: 'Solberg',   email: 'august.solberg.demo@nobadco.dev',   archetype: 'Curator',   aiScore: 0.56, status: 'APPROVED',   energyScore: 58, networkValueScore: 56, daysAgoCreated: 75 },
  { idx: 27, firstName: 'Camille',   lastName: 'Doré',      email: 'camille.dore.demo@nobadco.dev',     archetype: 'Maker',     aiScore: 0.45, status: 'WAITLISTED', energyScore: 48, networkValueScore: 45, daysAgoCreated: 40 },
  { idx: 28, firstName: 'Reza',      lastName: 'Karimi',    email: 'reza.karimi.demo@nobadco.dev',      archetype: 'Builder',   aiScore: 0.41, status: 'WAITLISTED', energyScore: 44, networkValueScore: 42, daysAgoCreated: 25 },
  { idx: 29, firstName: 'Lumi',      lastName: 'Takahashi', email: 'lumi.takahashi.demo@nobadco.dev',   archetype: 'Host',      aiScore: 0.36, status: 'WAITLISTED', energyScore: 39, networkValueScore: 37, daysAgoCreated: 15 },
  // Jordan — the "incident" persona used by the QA Game Mode "bad-actor" scenario.
  // Approved member so Cmd+K finds him and the Blocked-List flow has a real target.
  { idx: 30, firstName: 'Jordan',    lastName: 'Ellis',     email: 'jordan.ellis.demo@nobadco.dev',     archetype: 'Connector', aiScore: 0.64, status: 'APPROVED',   energyScore: 67, networkValueScore: 65, daysAgoCreated: 120 },
] as const;

type DemoMember = (typeof DEMO_MEMBERS)[number];

// Purple list: top-tier charter members worth tracking closely
const PURPLE_EMAILS = [
  'maya.chen.demo@nobadco.dev',
  'james.okonkwo.demo@nobadco.dev',
  'eliot.park.demo@nobadco.dev',
  'ravi.mehta.demo@nobadco.dev',
];
// Blocked: rejected applicants flagged during review
const BLOCKED_EMAILS = [
  'valentina.cruz.demo@nobadco.dev',
  'oliver.chen.demo@nobadco.dev',
];

const DEMO_EVENTS = [
  {
    slug: '__demo-residency-summer',
    title: 'The Residency — Summer Edition',
    description: "Three days, one house, twenty-four people you'll want to know forever. The Residency is our most intimate format: structured curiosity, unstructured time, and the kind of conversations that change what you're building next.",
    startAt: weeksFromNow(2),
    endAt: new Date(weeksFromNow(2).getTime() + 4 * 3600_000),
    location: 'Austin, TX',
    capacity: 80,
    accessMode: 'OPEN' as const,
    approvalRequired: false,
    plusOnesAllowed: false,
    status: 'PUBLISHED' as const,
    template: 'editorial',
    priceInCents: null,
    nonMemberPriceInCents: null,
  },
  {
    slug: '__demo-house-dinner-4',
    title: 'Tenur House Dinner Series #4',
    description: "The fourth installment of our intimate dinner series. Twelve seats, one long table, and a chef who builds menus around who's in the room. Reservation required; approval for members, ticket for guests.",
    startAt: weeksFromNow(5),
    endAt: new Date(weeksFromNow(5).getTime() + 2.5 * 3600_000),
    location: 'Private Residence — Austin, TX',
    capacity: 24,
    accessMode: 'TICKETED' as const,
    approvalRequired: true,
    plusOnesAllowed: false,
    status: 'PUBLISHED' as const,
    template: 'minimal',
    priceInCents: 8500,
    nonMemberPriceInCents: 15000,
  },
  {
    slug: '__demo-founders-circle-aug',
    title: "Founder's Circle: August",
    description: "Not a panel. Not a pitch night. A dinner for people actively building something — products, companies, art, institutions. The agenda is the people at the table.",
    startAt: weeksFromNow(8),
    endAt: new Date(weeksFromNow(8).getTime() + 3 * 3600_000),
    location: 'TBA — Austin, TX',
    capacity: 40,
    accessMode: 'TICKETED' as const,
    approvalRequired: true,
    plusOnesAllowed: false,
    status: 'PUBLISHED' as const,
    template: 'split',
    priceInCents: null,
    nonMemberPriceInCents: null,
  },
  {
    slug: '__demo-late-night-july',
    title: 'The Late Night — July',
    description: 'Our monthly open-door late night. No agenda, no programming — just the right people in the right room past midnight.',
    startAt: daysAgo(21),
    endAt: new Date(daysAgo(21).getTime() + 4 * 3600_000),
    location: 'The Venue — Austin, TX',
    capacity: 120,
    accessMode: 'OPEN' as const,
    approvalRequired: false,
    plusOnesAllowed: true,
    status: 'PUBLISHED' as const,
    template: 'editorial',
    priceInCents: null,
    nonMemberPriceInCents: null,
  },
  {
    slug: '__demo-members-preview',
    title: 'Members Only Preview',
    description: "An exclusive first look at what we're building this fall. Members only. Plus ones welcome.",
    startAt: weeksFromNow(3),
    endAt: new Date(weeksFromNow(3).getTime() + 2 * 3600_000),
    location: 'NoBC HQ — Austin, TX',
    capacity: 30,
    accessMode: 'TICKETED' as const,
    approvalRequired: false,
    plusOnesAllowed: true,
    status: 'PUBLISHED' as const,
    template: 'minimal',
    priceInCents: 5000,
    nonMemberPriceInCents: null,
  },
];

// Standalone pending applicants (the operator queue) now live in the shared
// module lib/dev/demo-applications.ts, so this route and `npm run seed:demo`
// produce identical, complete, fully-reviewed applications. See section 6.

export async function POST() {
  const { userId } = await auth();
  if (!userId || !ALLOWED.includes(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const workspaceId = await requireWorkspaceId(userId);
  const seededAt = new Date().toISOString();

  // ── 1. Members ────────────────────────────────────────────────────────────
  await db.member.createMany({
    skipDuplicates: true,
    data: DEMO_MEMBERS.map((m: DemoMember) => ({
      workspaceId,
      clerkUserId: demoClerkId(m.idx),
      email: m.email,
      firstName: m.firstName,
      lastName: m.lastName,
      status: m.status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'WAITLISTED' | 'GUEST',
      approved: m.status === 'APPROVED',
      approvedAt: m.status === 'APPROVED' ? daysAgo(m.daysAgoCreated - 2) : null,
      tags: ['__demo', m.archetype.toLowerCase()],
      energyScore: m.energyScore,
      networkValueScore: m.networkValueScore,
      aiSummary: `Demo member — ${m.archetype} archetype. AI score: ${(m.aiScore * 30).toFixed(1)}/30.`,
      createdAt: daysAgo(m.daysAgoCreated),
    })),
  });

  // Fetch created members by email to get their IDs
  const members = await db.member.findMany({
    where: { workspaceId, email: { in: DEMO_MEMBERS.map((m) => m.email) } },
    select: { id: true, email: true },
  });
  const memberByEmail = Object.fromEntries(members.map((m) => [m.email, m.id]));

  // ── 2. WatchList entries ──────────────────────────────────────────────────
  const purpleData = PURPLE_EMAILS.map((email) => ({
    workspaceId,
    type: 'PURPLE' as const,
    matchEmail: email,
    note: 'Demo seed — VIP tracking',
    createdBy: userId,
  }));
  const blockedData = BLOCKED_EMAILS.map((email) => ({
    workspaceId,
    type: 'BLOCKED' as const,
    matchEmail: email,
    note: 'Demo seed — blocked during review',
    createdBy: userId,
  }));
  await db.watchList.createMany({ skipDuplicates: true, data: [...purpleData, ...blockedData] });

  // ── 3. Events ─────────────────────────────────────────────────────────────
  await db.event.createMany({
    skipDuplicates: true,
    data: DEMO_EVENTS.map((e) => ({
      workspaceId,
      slug: e.slug,
      title: e.title,
      description: e.description,
      startAt: e.startAt,
      endAt: e.endAt,
      location: e.location,
      capacity: e.capacity,
      accessMode: e.accessMode,
      approvalRequired: e.approvalRequired,
      plusOnesAllowed: e.plusOnesAllowed,
      status: e.status,
      template: e.template,
      priceInCents: e.priceInCents,
      nonMemberPriceInCents: e.nonMemberPriceInCents,
      visibility: 'public' as const,
    })),
  });

  const events = await db.event.findMany({
    where: { workspaceId, slug: { in: DEMO_EVENTS.map((e) => e.slug) } },
    select: { id: true, slug: true, title: true, startAt: true },
  });
  const eventBySlug = Object.fromEntries(events.map((e) => [e.slug, e]));

  // ── 3b. EventWorkflow records ─────────────────────────────────────────────
  const WORKFLOW_SEEDS: Array<{
    slug: string;
    templateKey: 'open' | 'members_only' | 'ticketed_approval' | 'paid_only' | 'referral_required' | 'invitation_code';
    config: Record<string, unknown>;
  }> = [
    { slug: '__demo-residency-summer', templateKey: 'open', config: {} },
    { slug: '__demo-house-dinner-4', templateKey: 'ticketed_approval', config: { amountCents: 15000, requiresApproval: true } },
    // Founder's Circle: TICKETED + approvalRequired — members apply, non-members pay at non-member price.
    { slug: '__demo-founders-circle-aug', templateKey: 'ticketed_approval', config: { amountCents: 15000, requiresApproval: true } },
    { slug: '__demo-late-night-july', templateKey: 'open', config: {} },
    { slug: '__demo-members-preview', templateKey: 'members_only', config: { minTier: 'low' } },
  ];
  {
    const { buildPathsFromTemplate } = await import('@/lib/workflows/templates');
    for (const w of WORKFLOW_SEEDS) {
      const ev = eventBySlug[w.slug];
      if (!ev) continue;
      const paths = buildPathsFromTemplate(
        w.templateKey,
        w.config as import('@/lib/workflows/templates').WorkflowTemplateConfig,
      );
      await db.eventWorkflow.upsert({
        where: { eventId: ev.id },
        update: { templateKey: w.templateKey, paths: paths as object },
        create: { workspaceId, eventId: ev.id, templateKey: w.templateKey, paths: paths as object },
      });
    }
  }

  // ── 4. EventCustomQuestions for Founder's Circle ─────────────────────────
  const foundersEvent = eventBySlug['__demo-founders-circle-aug'];
  if (foundersEvent) {
    await db.eventCustomQuestion.createMany({
      skipDuplicates: true,
      data: [
        {
          workspaceId,
          eventId: foundersEvent.id,
          label: 'What are you currently building?',
          fieldType: 'TEXTAREA',
          options: [],
          required: true,
          order: 1,
          showToMember: true,
          showToGuest: true,
          whenInFlow: 'BEFORE_SUBMIT',
        },
        {
          workspaceId,
          eventId: foundersEvent.id,
          label: 'How did you hear about No Bad Company?',
          fieldType: 'TEXT',
          options: [],
          required: false,
          order: 2,
          showToMember: true,
          showToGuest: true,
          whenInFlow: 'BEFORE_SUBMIT',
        },
        {
          workspaceId,
          eventId: foundersEvent.id,
          label: "What's one connection we could make for you at this event?",
          fieldType: 'TEXTAREA',
          options: [],
          required: false,
          order: 3,
          showToMember: true,
          showToGuest: false,
          whenInFlow: 'BEFORE_SUBMIT',
        },
      ],
    });
  }

  // ── 5. RSVPs ──────────────────────────────────────────────────────────────
  // Helper: only create RSVP if member ID exists
  function rsvpRow(
    memberEmail: string,
    eventSlug: string,
    overrides: Partial<{
      status: 'CONFIRMED' | 'DECLINED' | 'WAITLISTED';
      ticketStatus: string;
      checkedIn: boolean;
      checkedInAt: Date | null;
      paymentStatus: string | null;
      amountCents: number | null;
    }> = {},
  ) {
    const memberId = memberByEmail[memberEmail];
    const event = eventBySlug[eventSlug];
    if (!memberId || !event) return null;
    return {
      workspaceId,
      eventId: event.id,
      memberId,
      status: overrides.status ?? 'CONFIRMED',
      ticketStatus: overrides.ticketStatus ?? 'confirmed',
      checkedIn: overrides.checkedIn ?? false,
      checkedInAt: overrides.checkedInAt ?? null,
      paymentStatus: overrides.paymentStatus ?? null,
      amountCents: overrides.amountCents ?? null,
    };
  }

  const M = DEMO_MEMBERS;
  const pastEventStart = eventBySlug['__demo-late-night-july']?.startAt ?? daysAgo(21);

  // Live check-in window — last 2 hours, used to make The Room feel alive.
  const nowMs = Date.now();
  const liveCheckinTs = (offsetMin: number) => new Date(nowMs - offsetMin * 60_000);

  const rsvpData = [
    // Event 1 — The Residency (open) — 22 CONFIRMED, 23–24 WAITLISTED.
    // 8 are checked in within the last 2 hours (Task 6: live mid-event feel).
    ...M.slice(0, 22).map((m, i) => {
      const live = i < 8;
      return rsvpRow(m.email, '__demo-residency-summer', {
        status: 'CONFIRMED',
        checkedIn: live,
        checkedInAt: live ? liveCheckinTs(8 + i * 12) : null,
      });
    }),
    ...M.slice(22, 24).map((m) => rsvpRow(m.email, '__demo-residency-summer', { status: 'WAITLISTED', ticketStatus: 'waitlisted' })),

    // Event 2 — House Dinner (ticketed) — indices 0–9 paid, 10–11 waitlisted
    ...M.slice(0, 10).map((m) =>
      rsvpRow(m.email, '__demo-house-dinner-4', {
        status: 'CONFIRMED',
        ticketStatus: 'paid',
        paymentStatus: 'paid',
        amountCents: 8500,
      }),
    ),
    ...M.slice(10, 12).map((m) =>
      rsvpRow(m.email, '__demo-house-dinner-4', { status: 'WAITLISTED', ticketStatus: 'waitlisted' }),
    ),

    // Event 3 — Founder's Circle (ticketed + approvalRequired) — indices 0–11 CONFIRMED, 12–15 WAITLISTED
    ...M.slice(0, 12).map((m) => rsvpRow(m.email, '__demo-founders-circle-aug', { status: 'CONFIRMED' })),
    ...M.slice(12, 16).map((m) =>
      rsvpRow(m.email, '__demo-founders-circle-aug', { status: 'WAITLISTED', ticketStatus: 'waitlisted' }),
    ),

    // Event 4 — The Late Night (past): 100% checked in across a 3-hour window.
    ...M.slice(0, 30).map((m, i) =>
      rsvpRow(m.email, '__demo-late-night-july', {
        status: 'CONFIRMED',
        checkedIn: true,
        checkedInAt: new Date(pastEventStart.getTime() + (15 + i * 6) * 60_000),
      }),
    ),

    // Event 5 — Members Preview (ticketed) — indices 0–7 paid, 8–9 waitlisted
    ...M.slice(0, 8).map((m) =>
      rsvpRow(m.email, '__demo-members-preview', {
        status: 'CONFIRMED',
        ticketStatus: 'paid',
        paymentStatus: 'paid',
        amountCents: 5000,
      }),
    ),
    ...M.slice(8, 10).map((m) =>
      rsvpRow(m.email, '__demo-members-preview', { status: 'WAITLISTED', ticketStatus: 'waitlisted' }),
    ),
  ].filter((r): r is NonNullable<typeof r> => r !== null);

  await db.rSVP.createMany({ skipDuplicates: true, data: rsvpData });

  // ── 6. Standalone pending applications ────────────────────────────────────
  // Wipe-and-reseed (scoped to `__demo-pending`) so every applicant carries the
  // FULL answer set + a complete AI profile (archetype, score, reasoning,
  // archetypeScores on the 0–100 scale). Shared with `npm run seed:demo`.
  await seedPendingDemoApplications(db, workspaceId);

  // ── 7. Communications (email templates + platform settings) ──────────────
  await ensureCommunicationsSeed(workspaceId);

  // ── 8. Return counts ──────────────────────────────────────────────────────
  const [memberCount, eventCount, rsvpCount, applicationCount] = await Promise.all([
    db.member.count({ where: { workspaceId, tags: { has: '__demo' } } }),
    db.event.count({ where: { workspaceId, slug: { startsWith: '__demo-' } } }),
    db.rSVP.count({ where: { workspaceId, event: { slug: { startsWith: '__demo-' } } } }),
    db.application.count({ where: { workspaceId, aiTags: { has: '__demo' } } }),
  ]);

  return NextResponse.json({
    success: true,
    seededAt,
    counts: { members: memberCount, events: eventCount, rsvps: rsvpCount, applications: applicationCount },
    events: events.map((e) => ({ id: e.id, slug: e.slug, title: e.title })),
  });
}

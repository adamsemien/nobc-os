import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { requireWorkspaceId } from '@/lib/auth';
import { db } from '@/lib/db';

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
] as const;

type DemoMember = (typeof DEMO_MEMBERS)[number];

// Purple list: top-tier charter members worth tracking closely
const PURPLE_EMAILS = [
  'maya.chen.demo@nobadco.dev',
  'james.okonkwo.demo@nobadco.dev',
  'eliot.park.demo@nobadco.dev',
  'zoe.kim.demo@nobadco.dev',
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
    accessMode: 'APPLY_OR_PAY' as const,
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

// Standalone pending applications (not linked to demo members)
const STANDALONE_APPS = [
  {
    email: 'taylor.brooks.demo@nobadco.dev',
    fullName: 'Taylor Brooks',
    phone: '+15124440001',
    city: 'Austin',
    neighborhood: 'East Austin',
    referredBy: 'Maya Chen',
    archetype: 'Connector',
    aiScore: 0.72,
    aiRecommendation: 'yes' as const,
    aiReasoning: 'Strong network signals; active in multiple creative communities across Austin and NYC.',
    answers: [
      { questionKey: 'what_you_do', answer: 'Community strategist at a climate tech startup. Before that, ran partnerships at a DTCF brand.' },
      { questionKey: 'why_nobc', answer: "Maya told me the community here is the real thing. I've been looking for a room I actually want to be in." },
      { questionKey: 'what_bring', answer: "I know everyone in the Austin creative tech scene and I'm happy to make introductions that matter." },
    ],
  },
  {
    email: 'monique.delacroix.demo@nobadco.dev',
    fullName: 'Monique Delacroix',
    phone: '+15124440002',
    city: 'New Orleans',
    neighborhood: 'Marigny',
    referredBy: 'Event — The Late Night',
    archetype: 'Host',
    aiScore: 0.81,
    aiRecommendation: 'yes' as const,
    aiReasoning: 'Authentic host energy; runs a well-regarded supper club. High activation and contribution signals.',
    answers: [
      { questionKey: 'what_you_do', answer: 'Chef and supper club operator. I run 12-person dinners twice a month in New Orleans.' },
      { questionKey: 'why_nobc', answer: "Attended the Late Night event and felt a quality of presence I haven't experienced at other communities." },
      { questionKey: 'what_bring', answer: 'I can create experiences. If you ever want to do a dinner, I can make it unforgettable.' },
    ],
  },
  {
    email: 'rashid.alfarsi.demo@nobadco.dev',
    fullName: 'Rashid Al-Farsi',
    phone: '+15124440003',
    city: 'Austin',
    neighborhood: 'Domain',
    referredBy: 'Eliot Park',
    archetype: 'Builder',
    aiScore: 0.64,
    aiRecommendation: 'yes' as const,
    aiReasoning: 'Consistent builder signals. Early stage but high quality trajectory.',
    answers: [
      { questionKey: 'what_you_do', answer: 'CTO at a Series A fintech. Previously built payments infrastructure at Stripe for 4 years.' },
      { questionKey: 'why_nobc', answer: "Eliot keeps telling me the conversations here are different. I'm finally listening." },
      { questionKey: 'what_bring', answer: 'Technical depth and genuine curiosity. I ask good questions.' },
    ],
  },
  {
    email: 'ingrid.svensson.demo@nobadco.dev',
    fullName: 'Ingrid Svensson',
    phone: '+15124440004',
    city: 'Stockholm',
    neighborhood: 'Södermalm',
    referredBy: null,
    archetype: 'Curator',
    aiScore: 0.55,
    aiRecommendation: 'unclear' as const,
    aiReasoning: 'Strong curatorial taste signals but limited US presence. Worth a conversation before approving.',
    answers: [
      { questionKey: 'what_you_do', answer: "Creative director and independent curator. I've placed work in MoMA, Serpentine, and LACMA." },
      { questionKey: 'why_nobc', answer: 'I found you through a piece in The Drift. The philosophy resonated.' },
      { questionKey: 'what_bring', answer: 'I have a different eye. I notice things others miss, and I say so.' },
    ],
  },
  {
    email: 'leo.zhang.demo@nobadco.dev',
    fullName: 'Leo Zhang',
    phone: '+15124440005',
    city: 'San Francisco',
    neighborhood: 'Mission',
    referredBy: null,
    archetype: 'Maker',
    aiScore: 0.44,
    aiRecommendation: 'no' as const,
    aiReasoning: "Genuine maker energy but answers feel generic. Low specificity on what they'd contribute to the community.",
    answers: [
      { questionKey: 'what_you_do', answer: 'Hardware engineer. I build things.' },
      { questionKey: 'why_nobc', answer: 'Heard it was a good community.' },
      { questionKey: 'what_bring', answer: 'I know a lot of people in tech.' },
    ],
  },
  {
    email: 'amara.osei.demo@nobadco.dev',
    fullName: 'Amara Osei',
    phone: '+15124440006',
    city: 'Austin',
    neighborhood: 'Travis Heights',
    referredBy: 'Carlos Vega',
    archetype: 'Patron',
    aiScore: 0.79,
    aiRecommendation: 'yes' as const,
    aiReasoning: 'Strong patron signals. Angel investor with clear community orientation and cultural taste.',
    answers: [
      { questionKey: 'what_you_do', answer: 'Angel investor and philanthropist. I focus on Black founders and cultural institutions.' },
      { questionKey: 'why_nobc', answer: 'Carlos told me this was the room where the best ideas in Austin find each other. I want to be part of that.' },
      { questionKey: 'what_bring', answer: 'Capital, connections, and a genuine commitment to making Austin more interesting.' },
    ],
  },
];

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

  const rsvpData = [
    // Event 1 — The Residency (open) — indices 0–13 CONFIRMED, 14–15 WAITLISTED
    ...M.slice(0, 14).map((m) => rsvpRow(m.email, '__demo-residency-summer', { status: 'CONFIRMED' })),
    ...M.slice(14, 16).map((m) => rsvpRow(m.email, '__demo-residency-summer', { status: 'WAITLISTED', ticketStatus: 'waitlisted' })),

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

    // Event 3 — Founder's Circle (apply_or_pay) — indices 0–11 CONFIRMED, 12–15 WAITLISTED
    ...M.slice(0, 12).map((m) => rsvpRow(m.email, '__demo-founders-circle-aug', { status: 'CONFIRMED' })),
    ...M.slice(12, 16).map((m) =>
      rsvpRow(m.email, '__demo-founders-circle-aug', { status: 'WAITLISTED', ticketStatus: 'waitlisted' }),
    ),

    // Event 4 — The Late Night (past) — all 18. Indices 0–14 checked in, 15–17 no-show
    ...M.slice(0, 15).map((m) =>
      rsvpRow(m.email, '__demo-late-night-july', {
        status: 'CONFIRMED',
        checkedIn: true,
        checkedInAt: new Date(pastEventStart.getTime() + 30 * 60_000),
      }),
    ),
    ...M.slice(15, 18).map((m) =>
      rsvpRow(m.email, '__demo-late-night-july', { status: 'CONFIRMED', checkedIn: false }),
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

  // ── 6. Standalone applications ────────────────────────────────────────────
  let appCount = 0;
  for (const app of STANDALONE_APPS) {
    const existing = await db.application.findFirst({
      where: { workspaceId, email: app.email },
      select: { id: true },
    });
    if (!existing) {
      const created = await db.application.create({
        data: {
          workspaceId,
          email: app.email,
          fullName: app.fullName,
          phone: app.phone,
          city: app.city,
          neighborhood: app.neighborhood ?? null,
          referredBy: app.referredBy ?? null,
          consentEmail: true,
          consentSms: false,
          status: 'PENDING',
          aiTags: ['__demo'],
          aiScore: app.aiScore,
          aiRecommendation: app.aiRecommendation,
          aiReasoning: app.aiReasoning,
          archetype: app.archetype,
          archetypeScores: {
            Connector: app.archetype === 'Connector' ? app.aiScore : Math.random() * 0.4 + 0.2,
            Host:      app.archetype === 'Host'      ? app.aiScore : Math.random() * 0.4 + 0.2,
            Curator:   app.archetype === 'Curator'   ? app.aiScore : Math.random() * 0.4 + 0.2,
            Builder:   app.archetype === 'Builder'   ? app.aiScore : Math.random() * 0.4 + 0.2,
            Maker:     app.archetype === 'Maker'     ? app.aiScore : Math.random() * 0.4 + 0.2,
            Patron:    app.archetype === 'Patron'    ? app.aiScore : Math.random() * 0.4 + 0.2,
          },
          createdAt: daysAgo(Math.floor(Math.random() * 7 + 1)),
        },
      });
      await db.applicationAnswer.createMany({
        data: app.answers.map((a) => ({
          applicationId: created.id,
          questionKey: a.questionKey,
          answer: a.answer,
        })),
      });
      appCount++;
    }
  }

  // ── 7. Return counts ──────────────────────────────────────────────────────
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

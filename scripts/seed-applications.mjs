import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const eq = line.indexOf('=');
  if (eq < 1) return;
  const k = line.slice(0, eq).trim();
  let v = line.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (k) process.env[k] = v;
});

const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });

const workspace = await db.workspace.findUnique({ where: { slug: 'nobc' } });
if (!workspace) { console.error('Workspace not found. Run seed-workspace.mjs first.'); process.exit(1); }

const APPS = [
  // ── PENDING — strong yes ─────────────────────────────────────────────────
  {
    email: 'maya.okonkwo@example.com', fullName: 'Maya Okonkwo', phone: '+13105550101',
    city: 'Los Angeles', referredBy: 'Marcus Bell', status: 'PENDING',
    aiTags: ['creative', 'founder', 'fashion'], aiScore: 0.91, aiRecommendation: 'strong_yes',
    aiReasoning: 'Founder of an emerging sustainable fashion label with strong creative community ties. Referral from existing member Marcus Bell. Answers reflect genuine curiosity and high cultural literacy.',
    answers: {
      workingOn: 'Building a slow-fashion label that sources entirely from Black-owned textile mills. We just finished our first runway show.',
      greatEnergy: 'People who make things — designers, chefs, writers. Anyone who can talk about craft for hours.',
      learnedThisYear: 'That distribution is the actual product. The thing you make is almost irrelevant if nobody sees it.',
      meetPeople: 'I go deep with a few people rather than wide. I want the dinner where we\'re still talking at midnight.',
    },
  },
  {
    email: 'julian.reyes@example.com', fullName: 'Julian Reyes', phone: '+13235550202',
    city: 'New York', referredBy: 'Sofia Aldrete', status: 'PENDING',
    aiTags: ['music', 'producer', 'nightlife'], aiScore: 0.88, aiRecommendation: 'strong_yes',
    aiReasoning: 'Grammy-nominated music producer with an established presence in the NY creative scene. Well-articulated application with strong community values. Referral verified.',
    answers: {
      workingOn: 'An album that bridges Afrobeats and Chicago footwork. Recording in Lagos for two weeks in March.',
      greatEnergy: 'Risk-takers. People who shipped something before it was ready and learned from it.',
      learnedThisYear: 'Vulnerability in the creative process is a feature, not a bug. Showing rough cuts changed everything for me.',
      meetPeople: 'I want to be in rooms where I\'m not the most interesting person.',
    },
  },
  {
    email: 'priya.mehta@example.com', fullName: 'Priya Mehta', phone: '+14155550303',
    city: 'San Francisco', referredBy: '', status: 'PENDING',
    aiTags: ['tech', 'vc', 'community-builder'], aiScore: 0.79, aiRecommendation: 'yes',
    aiReasoning: 'Partner at a pre-seed fund focused on climate tech. Self-referred but answers are strong and demonstrate cultural fit. Community-building experience notable.',
    answers: {
      workingOn: 'Sourcing climate infrastructure deals. Also quietly writing a newsletter about what VC culture gets wrong.',
      greatEnergy: 'Founders who are obsessed with a problem, not with being a founder. Also anyone who has a garden.',
      learnedThisYear: 'How to say no faster. It\'s the highest-leverage skill in investing.',
      meetPeople: 'I learn by osmosis — I need to be around people doing interesting things in fields I know nothing about.',
    },
  },
  {
    email: 'devon.washington@example.com', fullName: 'Devon Washington', phone: '+13105550404',
    city: 'Los Angeles', referredBy: 'Nia Thompson', status: 'PENDING',
    aiTags: ['film', 'director', 'storytelling'], aiScore: 0.85, aiRecommendation: 'strong_yes',
    aiReasoning: 'Emerging director with a Sundance short and a feature in development at A24. Strong answers. Referred by a well-regarded member.',
    answers: {
      workingOn: 'A feature about a jazz musician in 1970s Detroit. We\'re in the financing phase, which is its own kind of filmmaking.',
      greatEnergy: 'Honest people. The creative industry is full of performance. I want someone who will tell me when something isn\'t working.',
      learnedThisYear: 'That a script is a hypothesis, not a plan. The film finds itself on set.',
      meetPeople: "Through shared projects or someone's kitchen table. I'm suspicious of events that feel like LinkedIn in person.",
    },
  },
  {
    email: 'zara.lindqvist@example.com', fullName: 'Zara Lindqvist', phone: '+16465550505',
    city: 'New York', referredBy: 'Tomás Vega', status: 'PENDING',
    aiTags: ['architecture', 'design', 'cultural-institutions'], aiScore: 0.82, aiRecommendation: 'yes',
    aiReasoning: 'Senior architect at a firm known for cultural buildings. Deep cross-disciplinary interests. Referred by an approved member.',
    answers: {
      workingOn: 'A public library in the Bronx. It\'s the most political project I\'ve ever worked on in the best way.',
      greatEnergy: 'People who treat public space as a moral question. Also people who laugh easily.',
      learnedThisYear: 'Community engagement isn\'t a checkbox. When you actually listen, the building becomes something you couldn\'t have designed alone.',
      meetPeople: 'At the intersection of disciplines — when a chef talks to an architect, something good usually happens.',
    },
  },
  // ── PENDING — unclear / borderline ───────────────────────────────────────
  {
    email: 'carter.blake@example.com', fullName: 'Carter Blake', phone: '+13105550606',
    city: 'Los Angeles', referredBy: '', status: 'PENDING',
    aiTags: ['entrepreneur', 'real-estate'], aiScore: 0.54, aiRecommendation: 'unclear',
    aiReasoning: 'Real estate developer with legitimate business credentials but answers lack depth and feel formulaic. No referral. May benefit from a conversation before approval.',
    answers: {
      workingOn: 'Mixed-use development in Silver Lake. It\'s going to be a great addition to the neighborhood.',
      greatEnergy: 'Successful people who are also humble. People who know what they want.',
      learnedThisYear: 'That relationships are everything in business.',
      meetPeople: 'I like meeting people at events like this. Good networking opportunity.',
    },
  },
  {
    email: 'imani.foster@example.com', fullName: 'Imani Foster', phone: '+17735550707',
    city: 'Chicago', referredBy: 'Keisha Monroe', status: 'PENDING',
    aiTags: ['chef', 'food', 'hospitality'], aiScore: 0.76, aiRecommendation: 'yes',
    aiReasoning: 'Executive chef and restaurant owner with a strong local following. Referred by a member. Answers are warm and genuine though brief.',
    answers: {
      workingOn: 'Opening a second location in Hyde Park. Also developing a community supper club model for the South Side.',
      greatEnergy: 'Makers and builders who take hospitality seriously.',
      learnedThisYear: 'Delegation. You can\'t cook every dish.',
      meetPeople: 'Around a table, ideally one I set.',
    },
  },
  // ── PENDING — fresh, no AI yet ────────────────────────────────────────────
  {
    email: 'alex.navarro@example.com', fullName: 'Alex Navarro', phone: '+13235550808',
    city: 'Los Angeles', referredBy: 'Devon Washington', status: 'PENDING',
    aiTags: [], aiScore: null, aiRecommendation: null, aiReasoning: null,
    answers: {
      workingOn: 'A podcast about the business of independent bookstores. Season 2 comes out next month.',
      greatEnergy: 'Writers, booksellers, anyone who reads on the subway.',
      learnedThisYear: 'That independent media is the new local business — it needs the same community support.',
      meetPeople: 'Slowly. I like long conversations over short ones.',
    },
  },
  // ── APPROVED ──────────────────────────────────────────────────────────────
  {
    email: 'nia.thompson@example.com', fullName: 'Nia Thompson', phone: '+13105550909',
    city: 'Los Angeles', referredBy: '', status: 'APPROVED',
    aiTags: ['curator', 'art', 'gallery'], aiScore: 0.93, aiRecommendation: 'strong_yes',
    aiReasoning: 'Independent curator with a respected track record across LA and NY. Brilliant application — clear voice, strong community ethos.',
    answers: {
      workingOn: 'A group show at a converted warehouse in Boyle Heights. Twenty artists, all under 30.',
      greatEnergy: 'People who have a weird specific obsession they can\'t stop talking about.',
      learnedThisYear: 'That curation is really editing — the hardest and most generous act.',
      meetPeople: 'At the opening, then the afterparty, then the diner at 2am.',
    },
  },
  {
    email: 'marcus.bell@example.com', fullName: 'Marcus Bell', phone: '+14245551010',
    city: 'Los Angeles', referredBy: '', status: 'APPROVED',
    aiTags: ['brand', 'strategy', 'culture'], aiScore: 0.87, aiRecommendation: 'strong_yes',
    aiReasoning: 'Brand strategist who has worked with major cultural institutions. Has already referred two strong applicants.',
    answers: {
      workingOn: 'Helping three independent musicians build actual businesses around their work.',
      greatEnergy: 'People who are building something that didn\'t exist before.',
      learnedThisYear: 'That taste is a strategy, not just an aesthetic.',
      meetPeople: 'In spaces with intention. This one.',
    },
  },
  // ── REJECTED ──────────────────────────────────────────────────────────────
  {
    email: 'brad.sterling@example.com', fullName: 'Brad Sterling', phone: '+13105551111',
    city: 'Los Angeles', referredBy: '', status: 'REJECTED',
    aiTags: ['finance', 'networking'], aiScore: 0.21, aiRecommendation: 'no',
    aiReasoning: 'Applicant presents primarily transactional motivations. Answers focus heavily on business networking value. No referral. Not a cultural fit.',
    rejectionReason: 'Not the right fit for the community at this time.',
    answers: {
      workingOn: 'Running a hedge fund. Looking to expand my network in the creative space.',
      greatEnergy: 'High-net-worth individuals who are open to alternative investments.',
      learnedThisYear: 'That diversification into lifestyle assets is a solid play.',
      meetPeople: 'At exclusive events where the right people are.',
    },
  },
  // ── HOLD (duplicate flag) ─────────────────────────────────────────────────
  {
    email: 'j.morrison@example.com', fullName: 'James Morrison', phone: '+16025551212',
    city: 'Phoenix', referredBy: '', status: 'HOLD',
    aiTags: [], aiScore: null, aiRecommendation: null, aiReasoning: null,
    duplicateFlag: true,
    answers: {
      workingOn: 'Photography and some freelance work.',
      greatEnergy: 'Creative people.',
      learnedThisYear: 'To be more present.',
      meetPeople: 'Organically.',
    },
  },
];

const ANSWER_KEYS = ['workingOn', 'greatEnergy', 'learnedThisYear', 'meetPeople'];

let created = 0;
for (const app of APPS) {
  const { answers, rejectionReason, duplicateFlag, ...fields } = app;
  const existing = await db.application.findFirst({
    where: { workspaceId: workspace.id, email: fields.email },
  });
  if (existing) {
    console.log(`  ~ skipped ${fields.email} (already exists)`);
    continue;
  }
  const record = await db.application.create({
    data: {
      workspaceId: workspace.id,
      ...fields,
      rejectionReason: rejectionReason ?? null,
      duplicateFlag: duplicateFlag ?? false,
      consentEmail: true,
      consentSms: false,
      // Mirrors the prod backfill rule (Data Integrity Build A): scored or
      // past-PENDING rows simulate a genuine submission; a PENDING+unscored row
      // (e.g. Devon Washington above) intentionally stays unsubmitted.
      submittedAt: fields.aiScore !== null || fields.status !== 'PENDING' ? new Date() : null,
      reviewedAt: ['APPROVED', 'REJECTED'].includes(fields.status) ? new Date() : null,
      reviewedBy: ['APPROVED', 'REJECTED'].includes(fields.status) ? 'seed' : null,
    },
  });
  await db.applicationAnswer.createMany({
    data: ANSWER_KEYS.map(key => ({
      applicationId: record.id,
      questionKey: key,
      answer: answers[key] ?? '',
    })),
  });
  console.log(`  ✓ ${fields.status.padEnd(8)} ${fields.fullName}`);
  created++;
}

console.log(`\nDone — ${created} applications seeded into workspace "${workspace.name}".`);
await db.$disconnect();

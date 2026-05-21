/** Shared demo-application content + seeding helpers.
 *
 *  Both seed paths use this so every seeded application looks COMPLETE and
 *  REVIEWED in the operator applications queue:
 *    - prisma/seed-demo.ts  (`npm run seed:demo`, the Tenur-call demo)
 *    - app/api/dev/seed/route.ts  (internal QA seed button)
 *
 *  "Complete" = an answer for the full standard answer-storage question set
 *  (the four real questions + practical + consents), not 3 of 9. The operator
 *  detail/queue renders one Q&A row per ApplicationAnswer that exists, so a
 *  partial answer set reads as a thin, half-finished application.
 *
 *  "Reviewed" = a full AI profile: archetype, aiScore, aiRecommendation,
 *  aiReasoning, and archetypeScores on the 0–100 scale. The queue shows
 *  "No AI review yet" only when there is no archetypeScores-derived worth AND
 *  no aiRecommendation, so every demo applicant carries both.
 *
 *  AI fields are written DIRECTLY (not via the live scoring pipeline): the
 *  demo must be deterministic, free, and offline-safe. The real scorer
 *  (lib/scoring.ts) still owns production scoring and the locked model.
 *
 *  NOTE: Producer shares this Postgres instance. Every helper here is scoped to
 *  one workspace AND to demo aiTags — it never touches non-demo rows.
 */
import type { PrismaClient } from '@prisma/client';
import { answerQuestions } from '@/lib/apply-config';

export type DemoArchetype = 'Connector' | 'Host' | 'Curator' | 'Builder' | 'Maker' | 'Patron';
export type DemoRec = 'strong_yes' | 'yes' | 'unclear' | 'no' | 'strong_no';

/** Tags that mark an application as demo data. Anything carrying one of these
 *  in aiTags is safe to wipe-and-reseed. `__persona_test` is the QA persona tag
 *  (lib/dev/persona-types.ts PERSONA_TEST_TAG); `__demo-pending` marks the
 *  standalone pending applicants this module owns. */
export const DEMO_APPLICATION_TAGS = [
  '__demo',
  '__demo-tenur',
  '__demo-pending',
  '__persona_test',
] as const;

/** aiTags on the standalone pending applicants. The dedicated `__demo-pending`
 *  tag lets the dev seed reseed JUST these without touching curated approved
 *  apps (tagged `__demo-tenur`) or QA persona apps (`__persona_test`). */
const PENDING_TAGS = ['__demo', '__demo-pending'];

const ARCHETYPE_ORDER: DemoArchetype[] = [
  'Connector',
  'Host',
  'Curator',
  'Builder',
  'Maker',
  'Patron',
];

/** Deterministic 0–100 archetype spectrum.
 *  Top archetype = the applicant's aiScore as a percentage; the other five get
 *  a stable spread that always stays below the top. Deterministic so re-seeding
 *  reproduces the exact same bars (no Math.random drift between runs). */
export function buildArchetypeScores(
  archetype: DemoArchetype,
  aiScore: number,
  idx: number,
): Record<DemoArchetype, number> {
  const top = Math.max(30, Math.min(98, Math.round(aiScore * 100)));
  const ceiling = Math.max(20, top - 6);
  const out = {} as Record<DemoArchetype, number>;
  ARCHETYPE_ORDER.forEach((a, i) => {
    if (a === archetype) {
      out[a] = top;
      return;
    }
    const spread = (idx * 7 + i * 13 + a.length * 5) % 35; // 0..34
    out[a] = Math.min(28 + spread, ceiling);
  });
  return out;
}

/** Archetype-flavoured answers for the four "real questions". Two variants each
 *  (selected by index parity) so a roomful of one archetype still reads varied.
 *  Used as fallbacks — a persona's own bespoke answers always win. */
const REAL_ANSWER_BANK: Record<
  DemoArchetype,
  { workingOn: [string, string]; greatEnergy: [string, string]; learnedThisYear: [string, string]; meetPeople: [string, string] }
> = {
  Connector: {
    workingOn: [
      "I run partnerships for a climate-tech fund and host a quarterly dinner that's quietly become the room where Austin's operators actually meet each other.",
      'I connect founders with the capital and the people they need. Half my week is introductions, the other half is making sure they actually land.',
    ],
    greatEnergy: [
      "My friend Dre. He walks into a room and somehow everyone leaves having met the one person they needed to meet. I study how he does it.",
      "A founder I backed early — she remembers everyone's kids' names and means it. Warmth at that scale is genuinely rare.",
    ],
    learnedThisYear: [
      "That a good introduction is only a gift if you've earned both people's trust first. I stopped connecting for volume and started connecting for fit.",
      'Proximity is not the same as relationship. I learned to go deep with twenty people instead of staying shallow with two hundred.',
    ],
    meetPeople: [
      'I host. Small dinners, the right eight people, and I make the introductions that should have happened years ago.',
      "Through people I already trust — I'd rather meet one person who's vouched for than ten at a conference.",
    ],
  },
  Host: {
    workingOn: [
      "I run a supper-club series — twelve seats, one long table, a menu built around who's coming. It's the most honest work I've done.",
      'I operate two hospitality spaces and spend most nights making sure strangers leave as friends.',
    ],
    greatEnergy: [
      'My head chef. Calm in chaos, generous with credit, and the whole room feels it before they taste a thing.',
      'A friend who throws the kind of dinner you cancel other plans for. Presence is her entire craft.',
    ],
    learnedThisYear: [
      'That hospitality is mostly subtraction — quietly removing the small frictions nobody notices until they are gone.',
      'I learned to host less and host better. Fewer nights, deeper attention, and people remember it for years.',
    ],
    meetPeople: [
      "At my own table. I'd rather feed someone than network with them.",
      'Slowly, over repeated dinners. The good ones come back, and that is how I know.',
    ],
  },
  Curator: {
    workingOn: [
      'I curate — restaurants, shows, the occasional residency. I open something, get it exactly right, then step away.',
      'I run a small editorial brand with a point of view sharp enough that people trust the filter more than the source.',
    ],
    greatEnergy: [
      "A gallerist I work with who can read a room in ten seconds and tell you what's real and what's noise. I trust her eye over mine.",
      "My oldest friend, a chef. She has taste you can't fake and the discipline to say no to almost everything.",
    ],
    learnedThisYear: [
      'That a clear no is a form of generosity. Curating is mostly about what you leave out.',
      'I learned to trust the first instinct and then defend it. Taste hesitates itself to death if you let it.',
    ],
    meetPeople: [
      'Through work I admire — I reach out to people whose taste I already respect.',
      'Sparingly. I would rather know a few people deeply than collect contacts.',
    ],
  },
  Builder: {
    workingOn: [
      "I'm building payments infrastructure — Series B, small team, the kind of work that's invisible when it's done right.",
      'Solo founder on a developer-tools startup. I ship, I talk to users, I ship again.',
    ],
    greatEnergy: [
      'My co-founder. Relentless without being loud, and he makes genuinely hard problems feel solvable.',
      'An engineer on my team who treats every bug like a personal insult. That energy is contagious in the best way.',
    ],
    learnedThisYear: [
      'That speed without taste just gets you to the wrong place faster. I slowed down to pick better problems.',
      'I learned to build for the user actually in the room, not the user in my head. It rewrote the whole roadmap.',
    ],
    meetPeople: [
      'By building with them — a weekend project tells you more than a year of coffees.',
      "Through people who've shipped something real. Builders recognize builders fast.",
    ],
  },
  Maker: {
    workingOn: [
      "I'm a ceramicist — functional objects for restaurants, mostly. I make the things you don't notice until they're perfect.",
      'I paint full time and show with two galleries. The work is the whole life, for better and worse.',
    ],
    greatEnergy: [
      'A woodworker I share a studio with. Quiet, exact, and generous with everything he knows.',
      'My first collector — he buys with his gut and is somehow never wrong. He taught me to trust the hand.',
    ],
    learnedThisYear: [
      'That the material tells you what it wants if you stop forcing it. Best lesson I have had in a decade.',
      'I learned to actually finish things. Starting is easy; the last ten percent is the entire craft.',
    ],
    meetPeople: [
      'In studios and at openings — people who make things tend to find each other.',
      'Through the work. If you have held something I made, we already have something to talk about.',
    ],
  },
  Patron: {
    workingOn: [
      'I run my family office — we back cultural institutions and emerging artists, quietly and for the long term.',
      'I am an angel investor focused on the founders and institutions most rooms manage to overlook.',
    ],
    greatEnergy: [
      "A curator I fund who spends the money like it's hers and protects the work like it's sacred.",
      'A founder I backed who answers every email and remembers every favor. Integrity at that scale is rare.',
    ],
    learnedThisYear: [
      'That the best capital is patient and quiet. I stopped needing to be in the photo.',
      'I learned to fund people, not decks. The person outlasts the plan every single time.',
    ],
    meetPeople: [
      'Through the people I support — they introduce me to the ones genuinely worth knowing.',
      'Privately. I would take a dinner over a gala every time.',
    ],
  },
};

const FOOD_NOTES = [
  'Pescatarian — no shellfish, otherwise easy.',
  'No restrictions. I eat everything and love being surprised.',
  'Vegetarian.',
  'Gluten-free, please — celiac, so it matters.',
  'Allergic to tree nuts; otherwise no notes.',
  "Dairy-light if it's easy, but I'm not precious about it.",
];

const ACCESSIBILITY_NOTES = [
  'Nothing to flag.',
  'None — thank you for asking.',
  "A seat near an exit if it's easy, otherwise no needs.",
  'No accessibility needs.',
];

/** Optional answer-storage questions a complete application can legitimately
 *  leave blank — the extra-referrer slots ("two or three more if you have
 *  them"). Excluded from the buildFullAnswers coverage check. */
const OPTIONAL_ANSWER_KEYS = new Set(['referrer2', 'referrer3', 'referrer4']);

/** The bespoke answers a persona already has for the real questions — any
 *  subset; missing ones fall back to the archetype bank. */
export type RealAnswers = Partial<{
  workingOn: string;
  greatEnergy: string;
  learnedThisYear: string;
  meetPeople: string;
}>;

export interface DemoApplicantContent {
  email: string;
  archetype: DemoArchetype;
  aiScore: number;
  referredBy?: string | null;
  real?: RealAnswers;
}

/** Three deterministic picsum portraits for a demo applicant (stable per email
 *  so the same person always renders the same photos). Stored under `_photos`,
 *  the underscore-prefixed system key the operator UI renders as a photo strip. */
export function buildPhotos(email: string): string[] {
  const seed = email.split('@')[0];
  return [
    `https://picsum.photos/seed/${seed}/600/750`,
    `https://picsum.photos/seed/${seed}-2/600/750`,
    `https://picsum.photos/seed/${seed}-3/600/750`,
  ];
}

/** The full standard answer set for one applicant: every answer-storage
 *  question gets a realistic value, plus the `_photos` strip. Bespoke real
 *  answers win; everything else is archetype/index-derived and deterministic. */
export function buildFullAnswers(
  content: DemoApplicantContent,
  idx: number,
): { questionKey: string; answer: string }[] {
  const variant = idx % 2;
  const bank = REAL_ANSWER_BANK[content.archetype];
  const real = content.real ?? {};

  const out: { questionKey: string; answer: string }[] = [
    { questionKey: 'workingOn', answer: real.workingOn ?? bank.workingOn[variant] },
    { questionKey: 'greatEnergy', answer: real.greatEnergy ?? bank.greatEnergy[variant] },
    { questionKey: 'learnedThisYear', answer: real.learnedThisYear ?? bank.learnedThisYear[variant] },
    { questionKey: 'meetPeople', answer: real.meetPeople ?? bank.meetPeople[variant] },
    { questionKey: 'food', answer: FOOD_NOTES[idx % FOOD_NOTES.length] },
    { questionKey: 'accessibility', answer: ACCESSIBILITY_NOTES[idx % ACCESSIBILITY_NOTES.length] },
    {
      questionKey: 'priorEvent',
      answer: /event|late night/i.test(content.referredBy ?? '') ? 'Yes' : idx % 3 === 0 ? 'Yes' : 'No',
    },
    { questionKey: 'consentMembershipRead', answer: 'true' },
    // Occasional opt-out of photos for realism.
    { questionKey: 'consentPhotos', answer: idx % 6 === 0 ? 'false' : 'true' },
    { questionKey: '_photos', answer: JSON.stringify(buildPhotos(content.email)) },
  ];

  // Dev safety net: assert we cover every answer-storage question EXCEPT the
  // genuinely-optional extra-referrer slots (the primary referrer is the
  // `referredBy` model field; most real applicants leave these blank). This
  // still catches a future apply-config question the seed forgot about.
  if (process.env.NODE_ENV !== 'production') {
    const covered = new Set(out.map((a) => a.questionKey));
    const missing = answerQuestions
      .map((q) => q.key)
      .filter((k) => !covered.has(k) && !OPTIONAL_ANSWER_KEYS.has(k));
    if (missing.length) {
      console.warn(`[demo-applications] answer set missing keys: ${missing.join(', ')}`);
    }
  }

  return out;
}

/** The standalone pending applicants shown in the operator queue. Each carries
 *  bespoke real-question answers (the rest of the form is filled by
 *  buildFullAnswers). Scores span the review spectrum: clear yeses, borderline
 *  unclears, and a couple of weak nos so triage has something to chew on. */
export interface DemoPendingApplicant {
  email: string;
  fullName: string;
  phone: string;
  city: string;
  neighborhood: string | null;
  referredBy: string | null;
  archetype: DemoArchetype;
  aiScore: number;
  aiRecommendation: DemoRec;
  aiReasoning: string;
  real: RealAnswers;
}

export const DEMO_PENDING_APPLICANTS: DemoPendingApplicant[] = [
  {
    email: 'taylor.brooks.demo@nobadco.dev', fullName: 'Taylor Brooks', phone: '+15124440001', city: 'Austin', neighborhood: 'East Austin',
    referredBy: 'Maya Chen', archetype: 'Connector', aiScore: 0.72, aiRecommendation: 'yes',
    aiReasoning: 'Strong network signals; active across multiple creative communities in Austin and NYC. Maya referral carries weight.',
    real: {
      workingOn: 'Community strategist at a climate-tech startup. Before that I ran partnerships at a DTC brand and learned how to make a room feel small in a good way.',
      meetPeople: "Maya told me the community here is the real thing. I've been looking for a room I actually want to be in for a while now.",
      greatEnergy: "I know everyone in the Austin creative-tech scene and I'm happy to make the introductions that actually matter, not the ones that pad a calendar.",
    },
  },
  {
    email: 'monique.delacroix.demo@nobadco.dev', fullName: 'Monique Delacroix', phone: '+15124440002', city: 'New Orleans', neighborhood: 'Marigny',
    referredBy: 'Event — The Late Night', archetype: 'Host', aiScore: 0.81, aiRecommendation: 'yes',
    aiReasoning: 'Authentic host energy; runs a well-regarded supper club. High activation and contribution signals throughout.',
    real: {
      workingOn: 'Chef and supper-club operator. I run twelve-person dinners twice a month in New Orleans and have a waitlist I am quietly proud of.',
      meetPeople: "I attended the Late Night and felt a quality of presence I haven't experienced at other communities. That's rare and I noticed it immediately.",
      greatEnergy: 'I can create experiences. If you ever want to do a dinner together, I can make it the kind of night people talk about for a year.',
    },
  },
  {
    email: 'rashid.alfarsi.demo@nobadco.dev', fullName: 'Rashid Al-Farsi', phone: '+15124440003', city: 'Austin', neighborhood: 'Domain',
    referredBy: 'Eliot Park', archetype: 'Builder', aiScore: 0.64, aiRecommendation: 'yes',
    aiReasoning: 'Consistent builder signals. Early-stage but a high-quality trajectory and a credible referral.',
    real: {
      workingOn: 'CTO at a Series A fintech. Previously built payments infrastructure at Stripe for four years and still miss the hard problems.',
      meetPeople: "Eliot keeps telling me the conversations here are different from the usual founder circuit. I'm finally listening to him.",
      greatEnergy: 'Technical depth and genuine curiosity. I ask good questions and I actually wait for the answer.',
    },
  },
  {
    email: 'ingrid.svensson.demo@nobadco.dev', fullName: 'Ingrid Svensson', phone: '+15124440004', city: 'Stockholm', neighborhood: 'Södermalm',
    referredBy: null, archetype: 'Curator', aiScore: 0.55, aiRecommendation: 'unclear',
    aiReasoning: 'Strong curatorial taste signals but limited US presence. Worth a conversation before approving.',
    real: {
      workingOn: "Creative director and independent curator. I've placed work in MoMA, the Serpentine, and LACMA, and I'm choosy about what I attach my name to.",
      meetPeople: 'I found you through a piece in The Drift. The philosophy resonated more than I expected it to.',
      greatEnergy: 'I have a different eye. I notice the things other people miss, and I tend to say so.',
    },
  },
  {
    email: 'leo.zhang.demo@nobadco.dev', fullName: 'Leo Zhang', phone: '+15124440005', city: 'San Francisco', neighborhood: 'Mission',
    referredBy: null, archetype: 'Maker', aiScore: 0.44, aiRecommendation: 'no',
    aiReasoning: "Genuine maker energy but answers feel generic. Low specificity on what they'd actually contribute to the community.",
    real: {
      workingOn: 'Hardware engineer. I build things.',
      meetPeople: 'Heard it was a good community.',
      greatEnergy: 'I know a lot of people in tech.',
    },
  },
  {
    email: 'amara.osei.demo@nobadco.dev', fullName: 'Amara Osei', phone: '+15124440006', city: 'Austin', neighborhood: 'Travis Heights',
    referredBy: 'Carlos Vega', archetype: 'Patron', aiScore: 0.79, aiRecommendation: 'yes',
    aiReasoning: 'Strong patron signals. Angel investor with a clear community orientation and real cultural taste.',
    real: {
      workingOn: 'Angel investor and philanthropist. I focus on Black founders and cultural institutions, and I stay involved long after the check clears.',
      meetPeople: 'Carlos told me this was the room where the best ideas in Austin find each other. I want to be part of that.',
      greatEnergy: 'Capital, connections, and a genuine commitment to making Austin a more interesting place to live.',
    },
  },
  {
    email: 'ada.lin.demo@nobadco.dev', fullName: 'Ada Lin', phone: '+15124440007', city: 'Brooklyn', neighborhood: 'Bed-Stuy',
    referredBy: null, archetype: 'Curator', aiScore: 0.55, aiRecommendation: 'unclear',
    aiReasoning: 'Borderline. Strong taste signals but limited specificity on what she brings to the table.',
    real: {
      workingOn: 'Editor at an independent magazine. Mostly cultural criticism, some longform.',
      meetPeople: 'I keep meeting people who are part of NoBC and they all carry themselves a certain way.',
      greatEnergy: 'Curiosity. I read everything, and I remember it.',
    },
  },
  {
    email: 'jonas.weiss.demo@nobadco.dev', fullName: 'Jonas Weiss', phone: '+15124440008', city: 'Berlin', neighborhood: 'Kreuzberg',
    referredBy: 'Eliot Park', archetype: 'Builder', aiScore: 0.57, aiRecommendation: 'unclear',
    aiReasoning: 'Builder credentials are real but the answers feel transactional. Worth a closer read.',
    real: {
      workingOn: 'Solo founder. Building a music-tools startup.',
      meetPeople: 'Network expansion. I want to find collaborators stateside.',
      greatEnergy: 'European music-scene access.',
    },
  },
  {
    email: 'priscilla.adams.demo@nobadco.dev', fullName: 'Priscilla Adams', phone: '+15124440009', city: 'Austin', neighborhood: 'South Lamar',
    referredBy: 'Sofia Reyes', archetype: 'Host', aiScore: 0.52, aiRecommendation: 'unclear',
    aiReasoning: 'Genuine warmth in the answers but no track record of hosting at scale yet.',
    real: {
      workingOn: 'I run a small natural-wine bar. Two locations, both mine.',
      meetPeople: 'Sofia is a regular. She told me I would like the people here, and I trust her on this.',
      greatEnergy: 'I can pour you something great. I host every Sunday and the same faces keep coming back.',
    },
  },
  {
    email: 'devon.archer.demo@nobadco.dev', fullName: 'Devon Archer', phone: '+15124440010', city: 'Los Angeles', neighborhood: 'Echo Park',
    referredBy: null, archetype: 'Maker', aiScore: 0.54, aiRecommendation: 'unclear',
    aiReasoning: 'Strong maker signals but an unclear connection to the NoBC community.',
    real: {
      workingOn: 'Ceramicist. I make functional objects for restaurants.',
      meetPeople: 'A friend forwarded me your newsletter and I have read every issue since.',
      greatEnergy: 'A different kind of attention. I notice the table before the food.',
    },
  },
  {
    email: 'naomi.harper.demo@nobadco.dev', fullName: 'Naomi Harper', phone: '+15124440011', city: 'Austin', neighborhood: 'Mueller',
    referredBy: 'Maya Chen', archetype: 'Connector', aiScore: 0.56, aiRecommendation: 'unclear',
    aiReasoning: 'Borderline. The Maya referral matters; answers are short but specific.',
    real: {
      workingOn: 'Director of partnerships at a climate fund.',
      meetPeople: 'Maya. Enough said.',
      greatEnergy: 'Access to ten different worlds and the patience to introduce them well.',
    },
  },
  {
    email: 'silas.bookman.demo@nobadco.dev', fullName: 'Silas Bookman', phone: '+15124440012', city: 'Austin', neighborhood: 'Hyde Park',
    referredBy: 'Aisha Watkins', archetype: 'Builder', aiScore: 0.81, aiRecommendation: 'yes',
    aiReasoning: 'Repeat founder with a strong network and a clear community orientation.',
    real: {
      workingOn: 'Founder and CEO of a logistics platform — Series B, profitable, boring in the way I like.',
      meetPeople: 'I want to be in rooms where my company is the smallest thing about me.',
      greatEnergy: 'Operator depth and a strict no-pitch policy at dinners.',
    },
  },
  {
    email: 'celia.moss.demo@nobadco.dev', fullName: 'Celia Moss', phone: '+15124440013', city: 'Brooklyn', neighborhood: 'Williamsburg',
    referredBy: null, archetype: 'Curator', aiScore: 0.85, aiRecommendation: 'yes',
    aiReasoning: 'Tastemaker with real public-facing influence. Genuine signal in her work, not just her following.',
    real: {
      workingOn: 'I run a small editorial brand and a Substack with forty thousand readers who actually read it.',
      meetPeople: 'I never write about communities I belong to. I want one of those for once.',
      greatEnergy: 'A reliable filter. I will not waste your time on anything that is not genuinely good.',
    },
  },
  {
    email: 'wolfgang.steiner.demo@nobadco.dev', fullName: 'Wolfgang Steiner', phone: '+15124440014', city: 'Austin', neighborhood: 'Travis Heights',
    referredBy: 'Amara Osei', archetype: 'Patron', aiScore: 0.77, aiRecommendation: 'yes',
    aiReasoning: 'Quiet capital. Family office with a real history of cultural backing.',
    real: {
      workingOn: 'I manage my family office. We invest in cultural institutions and emerging artists, mostly in things that take a decade to pay off.',
      meetPeople: 'Amara mentioned the dinners. I am tired of black-tie things that end at nine.',
      greatEnergy: 'Patience and capital. No need to be in the foreground.',
    },
  },
  {
    email: 'jana.kovalenko.demo@nobadco.dev', fullName: 'Jana Kovalenko', phone: '+15124440015', city: 'New York', neighborhood: 'Lower East Side',
    referredBy: 'Eliot Park', archetype: 'Maker', aiScore: 0.73, aiRecommendation: 'yes',
    aiReasoning: 'Working artist with active collectors. Real maker energy and a credible referral.',
    real: {
      workingOn: 'Painter. I show at Carl Kostyál and Almine Rech, and I paint nearly every day.',
      meetPeople: 'Eliot has been telling me to apply for two years. I finally ran out of excuses.',
      greatEnergy: 'I will paint your portrait if you bore me. Most people find that motivating.',
    },
  },
  {
    email: 'evan.maxwell.demo@nobadco.dev', fullName: 'Evan Maxwell', phone: '+15124440016', city: 'Austin', neighborhood: 'East Austin',
    referredBy: null, archetype: 'Host', aiScore: 0.69, aiRecommendation: 'yes',
    aiReasoning: 'Active host in his own scene. A solid mid-range fit with room to grow.',
    real: {
      workingOn: 'I run a private dinner series for the Austin tech scene. Twenty-four-person tables, one rule: no pitching.',
      meetPeople: 'You are doing what I am doing but better. I want to learn from it up close.',
      greatEnergy: 'Twenty people you would actually want to know, in one place, on purpose.',
    },
  },
  {
    email: 'aurelia.dupont.demo@nobadco.dev', fullName: 'Aurelia Dupont', phone: '+15124440017', city: 'Paris', neighborhood: 'Le Marais',
    referredBy: null, archetype: 'Connector', aiScore: 0.66, aiRecommendation: 'yes',
    aiReasoning: 'European fashion-industry network. Could meaningfully enrich the room.',
    real: {
      workingOn: 'Head of communications at a heritage maison.',
      meetPeople: 'I split my time between Paris and Austin and I want a US chapter for my life here.',
      greatEnergy: 'A different vocabulary for elegance, and the contacts to back it up.',
    },
  },
  {
    email: 'parker.huang.demo@nobadco.dev', fullName: 'Parker Huang', phone: '+15124440018', city: 'San Francisco', neighborhood: 'Hayes Valley',
    referredBy: 'Silas Bookman', archetype: 'Builder', aiScore: 0.62, aiRecommendation: 'unclear',
    aiReasoning: 'Builder credentials but the answers lack the warmth NoBC tends to prize.',
    real: {
      workingOn: 'Engineering manager. I lead applied-research tooling.',
      meetPeople: 'I am bored of pitch events.',
      greatEnergy: 'Technical depth. Honest opinions.',
    },
  },
  {
    email: 'rosalind.hahn.demo@nobadco.dev', fullName: 'Rosalind Hahn', phone: '+15124440019', city: 'Mexico City', neighborhood: 'Roma Norte',
    referredBy: null, archetype: 'Curator', aiScore: 0.71, aiRecommendation: 'yes',
    aiReasoning: 'Tastemaker with a strong CDMX network. Could open up a whole new geography for the club.',
    real: {
      workingOn: 'I curate restaurants. I open them, get them right, and then I leave.',
      meetPeople: 'I want a list of friends in cities I do not yet love.',
      greatEnergy: 'A reservation at any of fourteen restaurants in CDMX, on me.',
    },
  },
  {
    email: 'kit.olsen.demo@nobadco.dev', fullName: 'Kit Olsen', phone: '+15124440020', city: 'Austin', neighborhood: 'Crestview',
    referredBy: 'Nina Volkov', archetype: 'Patron', aiScore: 0.39, aiRecommendation: 'no',
    aiReasoning: 'Low signal across every dimension. Answers feel impersonal and transactional.',
    real: {
      workingOn: 'Real estate.',
      meetPeople: 'A friend told me about it.',
      greatEnergy: 'Connections.',
    },
  },
];

/** Wipe demo applications (and their answers) for one workspace. Scoped to
 *  DEMO_APPLICATION_TAGS — never deletes real applications. ApplicationAnswer
 *  has no ON DELETE CASCADE, so answers are deleted first. Returns the count of
 *  applications removed. */
export async function wipeDemoApplications(
  db: PrismaClient,
  workspaceId: string,
  tags: readonly string[] = DEMO_APPLICATION_TAGS,
): Promise<number> {
  const demoApps = await db.application.findMany({
    where: { workspaceId, aiTags: { hasSome: [...tags] } },
    select: { id: true },
  });
  if (demoApps.length === 0) return 0;
  const ids = demoApps.map((a) => a.id);
  await db.applicationAnswer.deleteMany({ where: { applicationId: { in: ids } } });
  await db.application.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

/** Create the standalone PENDING demo applicants with a complete answer set and
 *  a full AI profile. Self-contained: wipes any prior `__demo-pending` apps
 *  first so it's safe to call on its own (dev seed) or after a full wipe
 *  (seed-demo). Returns the count created. */
export async function seedPendingDemoApplications(
  db: PrismaClient,
  workspaceId: string,
): Promise<number> {
  await wipeDemoApplications(db, workspaceId, ['__demo-pending']);
  let created = 0;
  for (let idx = 0; idx < DEMO_PENDING_APPLICANTS.length; idx++) {
    const p = DEMO_PENDING_APPLICANTS[idx];
    const app = await db.application.create({
      data: {
        workspaceId,
        email: p.email,
        fullName: p.fullName,
        phone: p.phone,
        city: p.city,
        neighborhood: p.neighborhood,
        referredBy: p.referredBy,
        consentEmail: true,
        consentSms: false,
        status: 'PENDING',
        aiTags: PENDING_TAGS,
        aiScore: p.aiScore,
        aiRecommendation: p.aiRecommendation,
        aiReasoning: p.aiReasoning,
        archetype: p.archetype,
        archetypeScores: buildArchetypeScores(p.archetype, p.aiScore, idx),
        createdAt: new Date(Date.now() - ((idx % 7) + 1) * 86_400_000),
      },
    });
    await db.applicationAnswer.createMany({
      data: buildFullAnswers(p, idx).map((a) => ({
        applicationId: app.id,
        questionKey: a.questionKey,
        answer: a.answer,
      })),
    });
    created++;
  }
  return created;
}

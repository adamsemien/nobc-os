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

/** Deterministic pick from a pool, varied by applicant index + a per-field salt
 *  so two same-archetype applicants don't land on identical short answers. No
 *  Math.random — re-seeding reproduces the exact same applications. */
function pick<T>(pool: readonly T[], idx: number, salt: number): T {
  return pool[(idx * 7 + salt * 13) % pool.length];
}

/** Archetype-flavoured answers for the live /apply form's narrative questions
 *  (basics.whatYouDo, personality.*, community.*, taste.*, about.*). One rich
 *  value per archetype; a persona's bespoke answers override the three most
 *  visible questions (personality.workingOn, personality.personYouAdmire,
 *  community.howDoYouKnowGoodCompany). */
type NarrativeBank = {
  whatYouDo: string;
  workingOn: string;
  obsessedWith: string;
  personYouAdmire: string;
  howDoYouKnowGoodCompany: string;
  connectionOpportunity: string;
  loyalCommunity: string;
  whatKindOfPeopleFlowThrough: string;
  interestingPeople: string;
  detailsRight: string;
  trustTaste: string;
  recommend: string;
  splurgeVsSave: string;
  whatPeopleComeToYouFor: string;
  heavilyInvestedIn: string;
  genuineExpertIn: string;
};

const NARRATIVE_BANK: Record<DemoArchetype, NarrativeBank> = {
  Connector: {
    whatYouDo: 'Partnerships lead at a climate-tech fund. I spend most of my week making the introductions that actually move things forward.',
    workingOn: 'A quarterly dinner series that has quietly become the room where Austin operators meet each other.',
    obsessedWith: 'The mechanics of a perfect introduction — who, when, and the one sentence that makes it land.',
    personYouAdmire: 'My friend Dre. He walks into any room and everyone leaves having met the one person they needed to.',
    howDoYouKnowGoodCompany: "When the conversation keeps going long after the reason for it is over. That's the tell, every time.",
    connectionOpportunity: 'I introduced a founder to the angel who ended up leading her round. Two texts, one dinner, a company that exists now.',
    loyalCommunity: 'A monthly operators dinner I have hosted for six years. Same table, rotating faces, a lot of trust.',
    whatKindOfPeopleFlowThrough: 'Founders, funders, and the occasional artist who keeps them all honest.',
    interestingPeople: 'A climate scientist, a nightclub owner, and the woman who runs the best supper club in town.',
    detailsRight: 'A tiny natural-wine bar on the east side — no sign, perfect lighting, the owner remembers your order.',
    trustTaste: 'My old roommate. She has never once steered me wrong on a restaurant, a book, or a person.',
    recommend: 'A pocket notebook I buy by the dozen and hand out. People think I am joking until they use one.',
    splurgeVsSave: 'Splurge on dinners and flights to see people; save on basically everything else.',
    whatPeopleComeToYouFor: 'An introduction, or a read on whether someone is the real thing. I am usually right.',
    heavilyInvestedIn: 'Time — I protect a few relationships fiercely and let the rest stay light.',
    genuineExpertIn: 'Building a network that compounds instead of one that just collects business cards.',
  },
  Host: {
    whatYouDo: 'I run a supper-club series and operate two hospitality spaces. Most nights I am making sure strangers leave as friends.',
    workingOn: 'A twelve-seat dinner built around who is coming — the menu changes with the guest list.',
    obsessedWith: 'Lighting and seating charts. Both decide whether a night works long before the food arrives.',
    personYouAdmire: 'My head chef. Calm in chaos, generous with credit, and the whole room feels it before they taste a thing.',
    howDoYouKnowGoodCompany: 'When nobody checks their phone and the second bottle opens without anyone deciding to.',
    connectionOpportunity: 'I sat two regulars next to each other on a hunch. They are opening a restaurant together this fall.',
    loyalCommunity: 'My Sunday-dinner regulars. Same eight people, five years — more like family now.',
    whatKindOfPeopleFlowThrough: 'Chefs, winemakers, and the friends-of-friends who turn into regulars.',
    interestingPeople: 'A sommelier, a documentary editor, and my ninety-year-old neighbour who has the best stories in Austin.',
    detailsRight: 'A neighbourhood trattoria where the host has known your name since the first visit.',
    trustTaste: 'My business partner. If she says a place is special, I cancel plans to go.',
    recommend: 'A set of unbreakable wine glasses that look like crystal. I have converted everyone I know.',
    splurgeVsSave: 'Splurge on what goes on the table; save on what goes on me.',
    whatPeopleComeToYouFor: 'Where to eat, who to seat together, and how to make a hard night feel easy.',
    heavilyInvestedIn: 'The room — the chairs, the playlist, the people. All of it, constantly.',
    genuineExpertIn: 'Hospitality at the scale where it still feels personal.',
  },
  Curator: {
    whatYouDo: 'Creative director and independent curator. I build a point of view sharp enough that people trust the filter.',
    workingOn: 'A small editorial brand and a residency program for artists nobody is paying attention to yet.',
    obsessedWith: 'Archival typography and the difference between confident and loud.',
    personYouAdmire: 'A gallerist I work with who can read a room in ten seconds and tell you what is real and what is noise.',
    howDoYouKnowGoodCompany: 'When the taste in the room is high enough that I learn something I did not expect to.',
    connectionOpportunity: 'I put a young photographer in front of an editor I trust. She has a monograph coming out now.',
    loyalCommunity: 'A reading group that has met for a decade. Smartest two hours of my month.',
    whatKindOfPeopleFlowThrough: 'Artists, editors, and the rare collector who buys with their eyes and not their ears.',
    interestingPeople: 'A poet, a perfumer, and a chef who treats a plate like a composition.',
    detailsRight: 'A members room in an old townhouse — every object earns its place, nothing is accidental.',
    trustTaste: "My oldest friend, a chef. She has taste you can't fake and the discipline to say no to almost everything.",
    recommend: 'A specific edition of a specific book. If I am recommending it, I have already bought you a copy.',
    splurgeVsSave: 'Splurge on objects that last a lifetime; save by owning far less of everything else.',
    whatPeopleComeToYouFor: 'A second opinion they will actually trust, and the name of the thing they have not heard of yet.',
    heavilyInvestedIn: 'Editing — what I leave out of my life as much as what I let in.',
    genuineExpertIn: 'Knowing what is good before the consensus catches up.',
  },
  Builder: {
    whatYouDo: 'Founder of a payments-infrastructure startup — small team, Series B, the kind of work that is invisible when it is done right.',
    workingOn: 'Shipping a product that makes a genuinely hard problem feel boring for our customers.',
    obsessedWith: 'Removing steps. The best feature this quarter was the three we deleted.',
    personYouAdmire: 'My co-founder. Relentless without being loud, and he makes genuinely hard problems feel solvable.',
    howDoYouKnowGoodCompany: 'When the conversation gets specific fast and nobody is performing.',
    connectionOpportunity: 'I connected a stuck founder with the engineer who unblocked her in an afternoon. Both still thank me.',
    loyalCommunity: 'A founders group that has met every other week since our first companies. We have seen each other at our worst.',
    whatKindOfPeopleFlowThrough: 'Engineers, designers, and operators who have actually shipped something real.',
    interestingPeople: 'A robotics founder, a former diplomat, and the best recruiter I have ever met.',
    detailsRight: 'A coffee shop that nails the small stuff — fast wifi, real chairs, nobody rushing you out.',
    trustTaste: 'A designer on my team. If he winces at something, it is wrong, even when I cannot say why.',
    recommend: 'A mechanical keyboard I am evangelical about. I have bought four for other people.',
    splurgeVsSave: 'Splurge on tools and a great chair; save by ignoring almost everything else.',
    whatPeopleComeToYouFor: 'How to actually build the thing, and an honest read on whether it is worth building.',
    heavilyInvestedIn: 'The team — hiring slowly and keeping them far too long on purpose.',
    genuineExpertIn: 'Taking something from an idea to shipped without losing the plot.',
  },
  Maker: {
    whatYouDo: 'Ceramicist making functional objects for restaurants. I make the things you do not notice until they are perfect.',
    workingOn: 'A dinnerware run for a restaurant opening this spring — three hundred plates, all by hand.',
    obsessedWith: 'Glaze chemistry. I have ruined a lot of good pots chasing one specific blue.',
    personYouAdmire: 'A woodworker I share a studio with. Quiet, exact, and generous with everything he knows.',
    howDoYouKnowGoodCompany: 'When someone notices the thing I made before they notice me.',
    connectionOpportunity: 'I introduced a chef to a farmer at my market stall. Half their menu comes from that handshake now.',
    loyalCommunity: 'A studio collective — six makers, one kiln, a decade of arguments and dinners.',
    whatKindOfPeopleFlowThrough: 'Other makers, the chefs who use my work, and the collectors who actually use what they buy.',
    interestingPeople: 'A glassblower, a bookbinder, and the farmer who grows the prettiest produce in the county.',
    detailsRight: 'A restaurant where the plates, the lighting, and the bread all clearly came from someone who cares.',
    trustTaste: 'My first collector. He buys with his gut and is somehow never wrong.',
    recommend: 'A particular Japanese hand tool. I will not stop talking about it once you ask.',
    splurgeVsSave: 'Splurge on materials and tools; save on literally everything else, gladly.',
    whatPeopleComeToYouFor: 'A made thing that lasts, and an eye on whether something is actually well made.',
    heavilyInvestedIn: 'The studio — the kiln, the materials, the thousands of hours of practice.',
    genuineExpertIn: 'My craft, down to the chemistry, and reading the hand behind a good object.',
  },
  Patron: {
    whatYouDo: 'I run my family office. We back cultural institutions and emerging artists, quietly and for the long term.',
    workingOn: 'A fund for first-time founders and curators most rooms manage to overlook.',
    obsessedWith: 'The long arc — the institutions still standing in fifty years and who is quietly building them now.',
    personYouAdmire: "A curator I fund who spends the money like it's hers and protects the work like it's sacred.",
    howDoYouKnowGoodCompany: 'When the most generous person in the room is also the quietest about it.',
    connectionOpportunity: 'I put an artist in front of a museum board. Her work is in the permanent collection now.',
    loyalCommunity: 'A small giving circle I have been part of for fifteen years. We move slowly and we mean it.',
    whatKindOfPeopleFlowThrough: 'Founders, curators, and the institutions that outlast all of us.',
    interestingPeople: 'A museum director, a first-time founder I backed, and a poet who refuses to be impressed by money.',
    detailsRight: 'An old hotel bar that has not changed in forty years and does not need to.',
    trustTaste: 'A curator I have funded for a decade. Her eye is the best investment I have ever made.',
    recommend: 'A particular small museum most people walk past. I have bought a lot of memberships as gifts.',
    splurgeVsSave: 'Splurge on art and the people making it; save by never needing to be in the photo.',
    whatPeopleComeToYouFor: 'Patient capital, a quiet introduction, and a long view when everyone else is panicking.',
    heavilyInvestedIn: 'People and institutions — the kind of bets that take a decade to pay off.',
    genuineExpertIn: 'Backing the right people early and then getting out of their way.',
  },
};

// Short-answer pools — realistic, archetype-agnostic, varied by index so a
// roomful never repeats. Cover the live form's taste-recommendation and
// rapid-fire fields.
const TASTE_TRAVEL = ['Mexico City, every chance I get', 'A slow week in Lisbon', 'Northern Japan in the off-season', 'Anywhere in Puglia', 'Oaxaca for the food', 'The Scottish Highlands'];
const TASTE_FOOD_DRINK = ["Birdie's, still the best in town", 'Suerte for the tortillas', 'Natural wine at LoLo', 'Uchi on a quiet weeknight', 'Nixta Taqueria', 'Comedor for a long lunch'];
const TASTE_WELLNESS = ["Barry's when I need it", 'Long runs on the lake trail', 'Reformer Pilates twice a week', 'Bouldering at Crux', 'Hot yoga, reluctantly', 'Barton Springs at dawn'];
const TASTE_FASHION = ['Mostly vintage and a few good basics', "Officine Générale and old Levi's", 'Whatever Maryam Nassir Zadeh is doing', 'The Row for the quiet pieces', 'Local designers and one good coat', 'Lemaire, head to toe'];
const TASTE_HOME = ['Mid-century, slowly collected', 'A lot of plants and one good chair', 'Vintage lighting is my weakness', 'Hasami porcelain everywhere', 'Books as the main decor', 'Warm minimal — fewer, better things'];

const RAPID_KARAOKE = ['"Motownphilly"', '"Club Can\'t Handle Me", unfortunately', '"Valerie"', '"No Scrubs"', '"September", always', '"Mr. Brightside", like everyone'];
const RAPID_COFFEE_TABLE = ['A stack of exhibition catalogues', 'Whatever I am half-reading', 'Monocle and a candle', 'A chess set nobody uses', 'Two photo books and a bowl of citrus', 'The New Yorker, piling up'];
const RAPID_IDEAL_SATURDAY = ['Market, a long lunch, a nap, friends over', 'Studio in the morning, dinner out', 'Trail run, then nothing planned', 'A drive out of town with no agenda', 'Cooking for eight', 'A gallery and a great meal'];
const RAPID_SUNDAY = ['Slow — coffee, the paper, a walk', 'Long run then pancakes', 'Farmers market and a phone-free morning', 'Cooking something that takes hours', 'Reading in bed far too long', 'A swim and then errands'];
const RAPID_CONTENT = ['Long video essays on YouTube', 'A good Substack on a Sunday', 'Studio process reels on Instagram', 'Anything on natural wine', 'Architecture accounts', 'Letterboxd reviews, weirdly'];
const RAPID_EVERYDAY = ["A good chef's knife", 'My fountain pen', 'Noise-cancelling headphones', 'A linen apron', 'A film camera in my bag', 'A great thermos'];
const RAPID_WORKOUT = ['Running', 'Pilates', 'Climbing', 'Long walks, honestly', 'Lifting three days a week', 'Swimming'];
const RAPID_LOCAL_BRAND = ['Howler Brothers', 'Maufrais', 'Helm Boots', 'Last Call', 'Joah Brown', 'Esby Apparel'];
const RAPID_DREAM_BRAND = ['Aesop — the restraint', 'Hermès, obviously', 'Patagonia, for the values', 'A24, for the taste', 'Le Labo', 'Aether'];
const RAPID_SHOPPING_CART = ['A new film stock and a book', 'Replacement studio tools', 'Two plane tickets', 'A standing rib roast for friends', 'A vintage lamp I do not need', 'Running shoes and coffee beans'];
const RAPID_SPEND_MORE = ['Dinners out', 'Tools and materials', 'Flights to see people', 'Art', 'Coffee, embarrassingly', 'Books'];
const RAPID_PODCASTS = ['Acquired, 99% Invisible, Talk Easy', 'The Rest Is History, Conversations', 'Song Exploder, Dish, Throughline', 'Invest Like the Best, Founders', 'The Great Women Artists, Articles of Interest', 'How Long Gone, mostly'];

const FROM_ORIGINALLY = ['Houston, originally', 'Grew up in Ohio', 'Born in Lagos, raised in London', 'A small town in Michigan', 'Mexico City', 'Outside Boston'];
const AUSTIN_NEIGHBORHOODS = ['East Austin', 'Clarksville', 'Hyde Park', 'Bouldin Creek', 'Mueller', 'Travis Heights'];
const STREETS = ['E 6th St', 'W Lynn St', 'Annie St', 'Eilers Ave', 'Cherrywood Rd', 'Kenwood Ave'];
const HOW_HEARD = ['A friend who is already a member', 'Through someone I trust', 'Word of mouth', 'An event I was brought to', 'A member I admire mentioned it'];
const FOOD_ACCESS = [
  'Pescatarian, no shellfish. No accessibility needs.',
  'No restrictions and no needs — I eat everything.',
  'Vegetarian. A seat near an exit if it is easy.',
  'Gluten-free (celiac, so it matters). Otherwise nothing to flag.',
  'Allergic to tree nuts. No accessibility needs, thank you for asking.',
  'Dairy-light if easy, not precious about it. Nothing else to flag.',
];

/** The bespoke answers a persona already has for the most visible questions —
 *  any subset; missing ones fall back to the archetype bank. These map onto the
 *  live form's keys: workingOn → personality.workingOn, greatEnergy →
 *  personality.personYouAdmire, meetPeople → community.howDoYouKnowGoodCompany. */
export type RealAnswers = Partial<{
  workingOn: string;
  greatEnergy: string;
  meetPeople: string;
}>;

export interface DemoApplicantContent {
  email: string;
  fullName?: string;
  archetype: DemoArchetype;
  aiScore: number;
  city?: string | null;
  neighborhood?: string | null;
  /** Full referrer list → basics.referrers (3-slot array, matching the form). */
  referrers?: string[];
  /** Legacy single-referrer convenience; folded into `referrers` when present. */
  referredBy?: string | null;
  real?: RealAnswers;
}

/** Three deterministic picsum portraits for a demo applicant (stable per email
 *  so the same person always renders the same photos). Stored under the live
 *  form's `photos.urls` answer key (a JSON array), exactly like a genuine
 *  /apply submission — the operator UI renders these as a photo strip. */
export function buildPhotos(email: string): string[] {
  const seed = email.split('@')[0];
  return [
    `https://picsum.photos/seed/${seed}/600/750`,
    `https://picsum.photos/seed/${seed}-2/600/750`,
    `https://picsum.photos/seed/${seed}-3/600/750`,
  ];
}

/** Every answer key the live /apply membership form (MembershipForm.tsx) writes
 *  to ApplicationAnswer. The seed must cover all of these so a demo applicant is
 *  shaped exactly like a genuine submission. Model fields (fullName, email,
 *  phone, consentEmail, consentSms) live on Application, not here.
 *  `basics.referrers` is the one legitimately-optional key (blank when the
 *  applicant was not referred). */
const LIVE_ANSWER_KEYS = [
  'basics.city', 'basics.neighborhood', 'basics.homeAddress', 'basics.fromOriginally',
  'basics.birthday', 'basics.links', 'basics.whatYouDo', 'basics.howDidYouHear',
  'personality.workingOn', 'personality.obsessedWith', 'personality.personYouAdmire',
  'community.howDoYouKnowGoodCompany', 'community.connectionOpportunity',
  'community.loyalCommunity', 'community.whatKindOfPeopleFlowThrough', 'community.interestingPeople',
  'taste.detailsRight', 'taste.trustTaste', 'taste.recommend', 'taste.splurgeVsSave',
  'taste.recommendTravel', 'taste.recommendFoodDrink', 'taste.recommendWellnessFitness',
  'taste.recommendFashion', 'taste.recommendHomeDesign',
  'rapid.karaokeS', 'rapid.coffeeTable', 'rapid.idealSaturday', 'rapid.sundayMorning',
  'rapid.contentStopsScrolling', 'rapid.everydayItem', 'rapid.preferredWorkout',
  'rapid.localAustinBrand', 'rapid.dreamBrandPartnership', 'rapid.shoppingCart',
  'rapid.spendMoreThanMost', 'rapid.topPodcasts',
  'about.whatPeopleComeToYouFor', 'about.heavilyInvestedIn', 'about.genuineExpertIn',
  'photos.urls', 'photos.foodAccessibility',
] as const;

/** Deterministic ISO birthday (YYYY-MM-DD), stable per index. */
function buildBirthday(idx: number): string {
  const year = 1980 + (idx % 18);
  const month = String((idx % 12) + 1).padStart(2, '0');
  const day = String((idx % 27) + 1).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** A links field that alternates between an Instagram handle and a personal
 *  site, derived from the email local-part — so the operator detail-page URL
 *  chip lights up just like a real submission. */
function buildLinks(email: string, idx: number): string {
  const handle = email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase();
  return idx % 2 === 0 ? `instagram.com/${handle}` : `https://${handle}.com`;
}

/** The full live-form answer set for one applicant: a realistic,
 *  archetype-flavoured value for every key the form writes, keyed EXACTLY as a
 *  genuine /apply submission (dotted `section.field` keys). Bespoke persona
 *  answers win on the three visible questions; everything else is
 *  archetype/index-derived and deterministic. Arrays (basics.referrers,
 *  photos.urls) are JSON-stringified, exactly like the live submit path. */
export function buildFullAnswers(
  content: DemoApplicantContent,
  idx: number,
): { questionKey: string; answer: string }[] {
  const bank = NARRATIVE_BANK[content.archetype];
  const real = content.real ?? {};
  const city = content.city ?? 'Austin';
  const neighborhood = content.neighborhood ?? pick(AUSTIN_NEIGHBORHOODS, idx, 1);
  const referrers = content.referrers ?? (content.referredBy ? [content.referredBy] : []);
  // The live form is a 3-slot referrer array; pad to three, blanks included.
  const referrerSlots = [referrers[0] ?? '', referrers[1] ?? '', referrers[2] ?? ''];

  const out: { questionKey: string; answer: string }[] = [
    // basics
    { questionKey: 'basics.city', answer: city },
    { questionKey: 'basics.neighborhood', answer: neighborhood },
    { questionKey: 'basics.homeAddress', answer: `${100 + idx * 7} ${pick(STREETS, idx, 2)}, ${city}` },
    { questionKey: 'basics.fromOriginally', answer: pick(FROM_ORIGINALLY, idx, 3) },
    { questionKey: 'basics.birthday', answer: buildBirthday(idx) },
    { questionKey: 'basics.links', answer: buildLinks(content.email, idx) },
    { questionKey: 'basics.whatYouDo', answer: bank.whatYouDo },
    { questionKey: 'basics.howDidYouHear', answer: referrers[0] ? `${referrers[0]} brought me in` : pick(HOW_HEARD, idx, 4) },
    // personality
    { questionKey: 'personality.workingOn', answer: real.workingOn ?? bank.workingOn },
    { questionKey: 'personality.obsessedWith', answer: bank.obsessedWith },
    { questionKey: 'personality.personYouAdmire', answer: real.greatEnergy ?? bank.personYouAdmire },
    // community
    { questionKey: 'community.howDoYouKnowGoodCompany', answer: real.meetPeople ?? bank.howDoYouKnowGoodCompany },
    { questionKey: 'community.connectionOpportunity', answer: bank.connectionOpportunity },
    { questionKey: 'community.loyalCommunity', answer: bank.loyalCommunity },
    { questionKey: 'community.whatKindOfPeopleFlowThrough', answer: bank.whatKindOfPeopleFlowThrough },
    { questionKey: 'community.interestingPeople', answer: bank.interestingPeople },
    // taste
    { questionKey: 'taste.detailsRight', answer: bank.detailsRight },
    { questionKey: 'taste.trustTaste', answer: bank.trustTaste },
    { questionKey: 'taste.recommend', answer: bank.recommend },
    { questionKey: 'taste.splurgeVsSave', answer: bank.splurgeVsSave },
    { questionKey: 'taste.recommendTravel', answer: pick(TASTE_TRAVEL, idx, 5) },
    { questionKey: 'taste.recommendFoodDrink', answer: pick(TASTE_FOOD_DRINK, idx, 6) },
    { questionKey: 'taste.recommendWellnessFitness', answer: pick(TASTE_WELLNESS, idx, 7) },
    { questionKey: 'taste.recommendFashion', answer: pick(TASTE_FASHION, idx, 8) },
    { questionKey: 'taste.recommendHomeDesign', answer: pick(TASTE_HOME, idx, 9) },
    // rapid fire
    { questionKey: 'rapid.karaokeS', answer: pick(RAPID_KARAOKE, idx, 10) },
    { questionKey: 'rapid.coffeeTable', answer: pick(RAPID_COFFEE_TABLE, idx, 11) },
    { questionKey: 'rapid.idealSaturday', answer: pick(RAPID_IDEAL_SATURDAY, idx, 12) },
    { questionKey: 'rapid.sundayMorning', answer: pick(RAPID_SUNDAY, idx, 13) },
    { questionKey: 'rapid.contentStopsScrolling', answer: pick(RAPID_CONTENT, idx, 14) },
    { questionKey: 'rapid.everydayItem', answer: pick(RAPID_EVERYDAY, idx, 15) },
    { questionKey: 'rapid.preferredWorkout', answer: pick(RAPID_WORKOUT, idx, 16) },
    { questionKey: 'rapid.localAustinBrand', answer: pick(RAPID_LOCAL_BRAND, idx, 17) },
    { questionKey: 'rapid.dreamBrandPartnership', answer: pick(RAPID_DREAM_BRAND, idx, 18) },
    { questionKey: 'rapid.shoppingCart', answer: pick(RAPID_SHOPPING_CART, idx, 19) },
    { questionKey: 'rapid.spendMoreThanMost', answer: pick(RAPID_SPEND_MORE, idx, 20) },
    { questionKey: 'rapid.topPodcasts', answer: pick(RAPID_PODCASTS, idx, 21) },
    // about
    { questionKey: 'about.whatPeopleComeToYouFor', answer: bank.whatPeopleComeToYouFor },
    { questionKey: 'about.heavilyInvestedIn', answer: bank.heavilyInvestedIn },
    { questionKey: 'about.genuineExpertIn', answer: bank.genuineExpertIn },
    // photos
    { questionKey: 'photos.urls', answer: JSON.stringify(buildPhotos(content.email)) },
    { questionKey: 'photos.foodAccessibility', answer: pick(FOOD_ACCESS, idx, 22) },
  ];

  // basics.referrers only when the applicant actually has one (genuine
  // submissions leave it blank otherwise). 3-slot array, JSON-stringified.
  if (referrerSlots.some((r) => r.trim())) {
    out.push({ questionKey: 'basics.referrers', answer: JSON.stringify(referrerSlots) });
  }

  // Dev safety net: assert we cover every required live-form answer key
  // (LIVE_ANSWER_KEYS excludes basics.referrers, the one optional key, which is
  // pushed above only when present). Catches a future form field the seed
  // forgot. These are the genuine /apply dotted keys — NOT apply-config's bare
  // keys (see the _context/01-apply known issue on the schema gap).
  if (process.env.NODE_ENV !== 'production') {
    const covered = new Set(out.map((a) => a.questionKey));
    const missing = LIVE_ANSWER_KEYS.filter((k) => !covered.has(k));
    if (missing.length) {
      console.warn(`[demo-applications] answer set missing live-form keys: ${missing.join(', ')}`);
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
        // Genuine /apply submissions leave model referredBy null and store the
        // referrer under the basics.referrers answer — match that exactly.
        referredBy: null,
        consentEmail: true,
        consentSms: idx % 3 === 0,
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
      data: buildFullAnswers(
        {
          email: p.email,
          fullName: p.fullName,
          archetype: p.archetype,
          aiScore: p.aiScore,
          city: p.city,
          neighborhood: p.neighborhood,
          referrers: p.referredBy ? [p.referredBy] : [],
          real: p.real,
        },
        idx,
      ).map((a) => ({
        applicationId: app.id,
        questionKey: a.questionKey,
        answer: a.answer,
      })),
    });
    created++;
  }
  return created;
}

/** Synthetic data for the Intelligence dashboard demo mode.
 *  No database access — safe to import into client components. */
import type { ArchetypeName, IntelligenceData } from './intelligence-types';

export type DemoMember = {
  name: string;
  archetype: ArchetypeName;
  city: string;
  worthBand: 'Charter' | 'Standard' | 'Waitlist';
  worthTotal: number;
  tags: string[];
  summary: string;
};

const NAMES = [
  'Maya Okonkwo', 'Derek Paulson', 'Tyler Brennan', 'Priya Raman', 'Jonah Vance',
  'Camille Foster', 'Andre Whitfield', 'Sofia Marchetti', 'Liam Castellanos', 'Nadia Ahmed',
  'Beatrice Lowell', 'Marcus Delacroix', 'Hana Yoshida', 'Elliot Pierce', 'Renata Cruz',
  'Theo Abara', 'Iris Kowalski', 'Desmond Hale', 'Camila Restrepo', 'Owen Fitzgerald',
  'Yara Haddad', 'Sebastian Cole', 'Anika Patel', 'Grant Mercer', 'Lucia Romano',
  'Nathaniel Burke', 'Priscilla Yoon', 'Cole Hendricks', 'Imani Robeson', 'Felix Nakamura',
  'Daphne Sterling', 'Roman Vasquez', 'Greta Lindqvist', 'Malcolm Reyes', 'Vivian Tran',
  'Auggie Bell', 'Sloane Carver', 'Dante Russo', 'Margot Devereux', 'Wesley Kim',
  'Talia Brooks', 'Hugo Almeida', 'Frances Okafor', 'Levi Steinberg', 'Noor Mansour',
  'Clara Bennett', 'Emmett Shaw', 'Jada Sinclair', 'Rafael Ortega', 'Simone Laurent',
];

const ARCHETYPE_PLAN: ArchetypeName[] = [
  ...Array<ArchetypeName>(18).fill('Connector'),
  ...Array<ArchetypeName>(12).fill('Host'),
  ...Array<ArchetypeName>(8).fill('Curator'),
  ...Array<ArchetypeName>(6).fill('Builder'),
  ...Array<ArchetypeName>(4).fill('Maker'),
  ...Array<ArchetypeName>(2).fill('Patron'),
];

const CITY_PLAN: string[] = [
  ...Array<string>(35).fill('Austin'),
  ...Array<string>(8).fill('New York'),
  ...Array<string>(4).fill('Los Angeles'),
  ...Array<string>(3).fill('Chicago'),
];

const BAND_PLAN: DemoMember['worthBand'][] = [
  ...Array<DemoMember['worthBand']>(8).fill('Charter'),
  ...Array<DemoMember['worthBand']>(28).fill('Standard'),
  ...Array<DemoMember['worthBand']>(14).fill('Waitlist'),
];

const SUMMARIES: Record<ArchetypeName, string[]> = {
  Connector: [
    'Knows everyone worth knowing in two cities. Made four introductions last month that turned into something.',
    'The person other people text before they make a decision. Quietly central to three different scenes.',
    'Runs a dinner series that has become the way new people meet the right people in town.',
  ],
  Host: [
    'Turns an empty apartment into the place everyone wants to be on a Tuesday. Hospitality is the whole personality.',
    'Has hosted the same Sunday gathering for six years. People plan their week around it.',
    'Cooks for thirty without flinching. The room they build is the product.',
  ],
  Curator: [
    'Found the ceramics studio before it had an Instagram. Taste runs a full season ahead of the feed.',
    'Recommends like they are paid for it — and they are right often enough that people listen.',
    'Notices the details a place gets right. The first call when anyone needs to know where to go.',
  ],
  Builder: [
    'Shipped a product to ten thousand users from a spare bedroom. Talks in outcomes, not plans.',
    'Second-time founder. Has the scar tissue and the calm that comes with it.',
    'Leads a team of twelve and still writes code on weekends. Builds because they cannot not build.',
  ],
  Maker: [
    'Works in clay and cold email with equal seriousness. The studio is the center of gravity.',
    'Writes, records, and presses their own records. Craft over reach, every time.',
    'A chef who left the restaurant to cook the way they actually want to cook.',
  ],
  Patron: [
    'Backs three artists and one founder quietly. Capital is just a way to move good things forward.',
    'Opens doors and writes checks without needing the credit. The room is better for it.',
  ],
};

const TAG_POOL: Record<ArchetypeName, string[]> = {
  Connector: ['founder', 'high-energy', 'strong-referral', 'austin-local'],
  Host: ['hospitality', 'community-builder', 'f&b', 'warm'],
  Curator: ['creative', 'taste-maker', 'fashion', 'design'],
  Builder: ['founder', 'operator', 'technical', 'shipped'],
  Maker: ['artist', 'craft', 'creative', 'chef'],
  Patron: ['investor', 'patron', 'access', 'capital'],
};

function bandToWorth(band: DemoMember['worthBand'], i: number): number {
  if (band === 'Charter') return 23 + (i % 6); // 23-28
  if (band === 'Standard') return 16 + (i % 6); // 16-21
  return 8 + (i % 7); // 8-14
}

/** 50 deterministic synthetic members matching the spec distributions. */
export const DEMO_MEMBERS: DemoMember[] = NAMES.map((name, i) => {
  const archetype = ARCHETYPE_PLAN[i];
  const band = BAND_PLAN[i];
  return {
    name,
    archetype,
    city: CITY_PLAN[i],
    worthBand: band,
    worthTotal: bandToWorth(band, i),
    tags: [TAG_POOL[archetype][i % 4], TAG_POOL[archetype][(i + 2) % 4]],
    summary: SUMMARIES[archetype][i % SUMMARIES[archetype].length],
  };
});

function tally<T extends string>(values: T[]): { label: T; count: number }[] {
  const map: Record<string, number> = {};
  for (const v of values) map[v] = (map[v] ?? 0) + 1;
  return Object.entries(map)
    .map(([label, count]) => ({ label: label as T, count }))
    .sort((a, b) => b.count - a.count);
}

const WEEKS = ['Mar 23', 'Mar 30', 'Apr 6', 'Apr 13', 'Apr 20', 'Apr 27', 'May 4', 'May 11'];

export const DEMO_INTELLIGENCE: IntelligenceData = {
  totalMembers: 50,
  totalApplications: 71,
  approvedThisMonth: 14,
  archetypeDistribution: (['Connector', 'Host', 'Curator', 'Builder', 'Maker', 'Patron'] as ArchetypeName[]).map(
    (archetype) => ({ archetype, count: DEMO_MEMBERS.filter((m) => m.archetype === archetype).length }),
  ),
  worthHistogram: [
    { band: 'Charter', count: 8 },
    { band: 'Standard', count: 28 },
    { band: 'Waitlist', count: 14 },
  ],
  topCities: tally(DEMO_MEMBERS.map((m) => m.city)).map((c) => ({ label: c.label, count: c.count })),
  topTags: [
    { label: 'founder', count: 19 },
    { label: 'high-energy', count: 14 },
    { label: 'creative', count: 12 },
    { label: 'hospitality', count: 11 },
    { label: 'austin-local', count: 10 },
    { label: 'strong-referral', count: 9 },
    { label: 'operator', count: 7 },
    { label: 'taste-maker', count: 6 },
  ],
  appsPerWeek: WEEKS.map((label, i) => ({ label, value: [5, 7, 6, 9, 8, 11, 13, 12][i] })),
  topReferrers: [
    { label: 'Camille Foster', count: 7 },
    { label: 'Maya Okonkwo', count: 6 },
    { label: 'Andre Whitfield', count: 5 },
    { label: 'Sofia Marchetti', count: 4 },
    { label: 'Theo Abara', count: 3 },
  ],
  dimensionAverages: { influence: 6.4, contribution: 5.8, activation: 6.1 },
  dimensionDelta: { influence: 0.4, contribution: -0.2, activation: 0.7 },
  approvalRateTrend: WEEKS.map((label, i) => ({ label, value: [62, 58, 64, 60, 67, 71, 69, 73][i] })),
  scoreTrend: WEEKS.map((label, i) => ({ label, value: [17.2, 16.8, 18.1, 17.6, 18.9, 19.4, 19.1, 20.2][i] })),
  archetypeMix: WEEKS.map((week, i) => ({
    week,
    counts: {
      Connector: [2, 3, 2, 4, 3, 4, 5, 4][i],
      Host: [1, 2, 2, 2, 2, 3, 3, 3][i],
      Curator: [1, 1, 1, 1, 2, 2, 2, 2][i],
      Builder: [1, 1, 0, 1, 1, 1, 2, 2][i],
      Maker: [0, 0, 1, 1, 0, 1, 1, 1][i],
      Patron: [0, 0, 0, 0, 0, 0, 0, 0][i],
    },
  })),
  advocatedCategories: [
    { label: 'independent coffee roasters', count: 12 },
    { label: 'east austin ceramics', count: 9 },
    { label: 'natural wine bars', count: 8 },
    { label: 'small-batch fragrance', count: 6 },
    { label: 'analog photography labs', count: 5 },
    { label: 'neighborhood bookstores', count: 5 },
    { label: 'chef-owned restaurants', count: 4 },
  ],
};

/** Per-question synthetic aggregate signal for the Insights tab demo. */
export const DEMO_INSIGHT_AGGREGATES: Record<string, { avgContribution: number; answerPattern: string }> = {
  basics_city: { avgContribution: 71, answerPattern: 'Austin-dominant; a meaningful NYC and LA minority drawn by the events programming.' },
  basics_referrers: { avgContribution: 88, answerPattern: 'Two-thirds name an existing member; the strongest single predictor of an approve.' },
  real_working_on: { avgContribution: 74, answerPattern: 'Founders and operators over-index; the vague "exploring opportunities" answer is rare and scores low.' },
  real_obsessed_with: { avgContribution: 63, answerPattern: 'Niche and cross-domain obsessions cluster at the top; pop-culture answers sit at the bottom.' },
  real_called_about: { avgContribution: 81, answerPattern: 'Cleanest archetype tell — "introductions" and "taste" answers split the room neatly.' },
  world_interesting_people: { avgContribution: 76, answerPattern: 'Specific named people with unusual pairings score highest; generic answers are common and weak.' },
  world_connected_people: { avgContribution: 84, answerPattern: 'A real story with a named outcome separates Connectors decisively; a third leave it thin.' },
  world_community_loyalty: { avgContribution: 69, answerPattern: 'People who helped build a community score well above those who simply joined one.' },
  taste_place_details: { avgContribution: 72, answerPattern: 'Obscure regional places with specific reasoning beat famous names every time.' },
  taste_trust_taste: { avgContribution: 58, answerPattern: 'Niche tastemakers score; the obvious celebrity names pull the average down.' },
  taste_recommend_paid: { avgContribution: 79, answerPattern: 'The key advocacy signal — enthusiasm plus specificity correlates with sponsor relevance.' },
  taste_splurge_save: { avgContribution: 54, answerPattern: 'Counterintuitive splurge/save combinations are the memorable ones; most answers are safe.' },
  rapid_karaoke: { avgContribution: 41, answerPattern: 'Engagement test — any specific answer passes; the over-serious answer is the tell.' },
  rapid_coffee_table: { avgContribution: 52, answerPattern: 'Books plus objects beat books alone; empty answers are surprisingly common.' },
  rapid_sunday_morning: { avgContribution: 49, answerPattern: 'Specific rituals reveal rhythm; community and craft answers score highest.' },
  rapid_most_dont_know: { avgContribution: 61, answerPattern: 'Genuine surprise wins; the humble-brag professional answer is the weakest pattern.' },
};

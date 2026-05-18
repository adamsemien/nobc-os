/** Synthetic data for Intelligence metrics in demo mode.
 *  When ctx.demoMode is true, metrics read from here and never touch the DB.
 *  Extends the workspace-level demo members in lib/demo-data.ts. */
import { DEMO_MEMBERS } from '../demo-data';

export { DEMO_MEMBERS };

/** Austin-specific brand clusters for the taste / top-advocated-brands metric.
 *  Quotes are written to feel like real NoBC members. */
export type DemoBrandCluster = {
  label: string;
  category: string;
  count: number;
  samples: string[];
};

export const DEMO_BRAND_CLUSTERS: DemoBrandCluster[] = [
  {
    label: 'Suerte',
    category: 'restaurants',
    count: 16,
    samples: [
      'the masa program at Suerte is the most serious thing happening in Austin food right now.',
      'I take every out-of-town friend to Suerte. it has never once missed.',
    ],
  },
  {
    label: 'Comedor',
    category: 'restaurants',
    count: 13,
    samples: ['Comedor is where I take people I want to impress without saying so.'],
  },
  {
    label: 'BookPeople',
    category: 'bookstores',
    count: 12,
    samples: ['I budget an hour for BookPeople and lose two. their staff picks shelf is unreal.'],
  },
  {
    label: 'Neon Kactus',
    category: 'home goods',
    count: 11,
    samples: ['Neon Kactus glassware is the only housewarming gift I give anymore.'],
  },
  {
    label: 'Stay Gold',
    category: 'bars / music',
    count: 11,
    samples: ['Stay Gold on a slow Tuesday is my favorite version of this city.'],
  },
  {
    label: 'Otherland',
    category: 'fragrance',
    count: 10,
    samples: ['I have converted at least six people to Otherland candles. unpaid, unprompted.'],
  },
  {
    label: 'Lazarus Brewing',
    category: 'beer / coffee',
    count: 9,
    samples: ['Lazarus does the coffee-then-beer pivot better than anywhere on the eastside.'],
  },
  {
    label: 'Halcyon',
    category: 'coffee',
    count: 8,
    samples: ['Halcyon downtown is where half my best ideas got written down.'],
  },
  {
    label: 'Holiday',
    category: 'retail / fashion',
    count: 8,
    samples: ['Holiday is the only shop where I trust the buyer completely.'],
  },
  {
    label: 'Foxtrot',
    category: 'retail / F&B',
    count: 7,
    samples: ['Foxtrot is my 9pm wine-and-snacks emergency plan and it always delivers.'],
  },
  {
    label: 'Casa Lever',
    category: 'restaurants',
    count: 6,
    samples: ['Casa Lever for the room as much as the plate — it understands an occasion.'],
  },
  {
    label: 'Hestia',
    category: 'restaurants',
    count: 6,
    samples: ['the hearth at Hestia is theater. I recommend it like I have equity in it.'],
  },
];

/** Synthetic application funnel for demo mode. */
export const DEMO_FUNNEL = {
  submitted: 71,
  approved: 50,
  firstRsvp: 38,
  repeat: 19,
};

/** Synthetic dormant-member cohort for demo mode. */
export const DEMO_DORMANT = [
  { name: 'Greta Lindqvist', cohort: 'Jul 2025', daysSinceRsvp: 167, archetype: 'Curator' },
  { name: 'Roman Vasquez', cohort: 'Jul 2025', daysSinceRsvp: 154, archetype: 'Host' },
  { name: 'Wesley Kim', cohort: 'Aug 2025', daysSinceRsvp: 142, archetype: 'Builder' },
  { name: 'Margot Devereux', cohort: 'Aug 2025', daysSinceRsvp: 131, archetype: 'Connector' },
  { name: 'Hugo Almeida', cohort: 'Sep 2025', daysSinceRsvp: 119, archetype: 'Maker' },
  { name: 'Talia Brooks', cohort: 'Sep 2025', daysSinceRsvp: 108, archetype: 'Connector' },
  { name: 'Levi Steinberg', cohort: 'Sep 2025', daysSinceRsvp: 101, archetype: 'Host' },
  { name: 'Frances Okafor', cohort: 'Oct 2025', daysSinceRsvp: 96, archetype: 'Curator' },
];

/** Synthetic weekly Charter-share trend for demo mode (percent). */
export const DEMO_CHARTER_TREND = [
  { label: 'Mar 23', value: 14 },
  { label: 'Mar 30', value: 16 },
  { label: 'Apr 6', value: 13 },
  { label: 'Apr 13', value: 18 },
  { label: 'Apr 20', value: 17 },
  { label: 'Apr 27', value: 21 },
  { label: 'May 4', value: 19 },
  { label: 'May 11', value: 24 },
];

/** Sponsor target profiles for the sponsor-fit-score metric.
 *
 *  DATA SOURCE NOTE: the Integration Playbook was not present in the repo at
 *  build time. These profiles are encoded from the figures inlined in the
 *  task brief (price bands, named accounts, recurring formats, contacts).
 *  Reconcile exact bands, archetype mappings, and contact details against
 *  the playbook (sections 7-10) when it is available. */

export type SponsorTier = 'entry' | 'mid' | 'considered' | 'aspirational';

export type SponsorTarget = {
  id: string;
  name: string;
  category: string;
  tier: SponsorTier;
  priceBandLow: number; // USD
  priceBandHigh: number;
  /** Archetypes this brand's audience strategy indexes to. */
  targetArchetypes: string[];
  primaryArchetype: string;
  /** Whether the brand pays a premium for a Charter-heavy room. */
  charterWeighted: boolean;
  /** NBC recurring formats that fit this brand. */
  fitFormats: string[];
  geoFocus: string;
  contact?: { name: string; title: string };
  derivedFromBrief: true;
};

export const SPONSOR_TARGETS: SponsorTarget[] = [
  {
    id: 'kendra-scott',
    name: 'Kendra Scott',
    category: 'Jewelry / Fashion',
    tier: 'mid',
    priceBandLow: 50_000,
    priceBandHigh: 75_000,
    targetArchetypes: ['Curator', 'Host'],
    primaryArchetype: 'Curator',
    charterWeighted: true,
    fitFormats: ["Chloe's Game", 'Chateau Chloe series'],
    geoFocus: 'Austin',
    contact: { name: 'Amy Young', title: 'Brand Partnerships' },
    derivedFromBrief: true,
  },
  {
    id: 'wayfair',
    name: 'Wayfair',
    category: 'Home / Interiors',
    tier: 'mid',
    priceBandLow: 40_000,
    priceBandHigh: 75_000,
    targetArchetypes: ['Maker', 'Curator'],
    primaryArchetype: 'Maker',
    charterWeighted: false,
    fitFormats: ['Tribeza Interiors Tour', 'Chateau Chloe series'],
    geoFocus: 'National',
    derivedFromBrief: true,
  },
  {
    id: 'chase-sapphire',
    name: 'Chase Sapphire',
    category: 'Financial / Cards',
    tier: 'considered',
    priceBandLow: 150_000,
    priceBandHigh: 250_000,
    targetArchetypes: ['Patron', 'Connector'],
    primaryArchetype: 'Connector',
    charterWeighted: true,
    fitFormats: ['Le Club 02', 'Chateau Chloe series'],
    geoFocus: 'National',
    contact: { name: 'Chris Stang', title: 'Experiential Marketing' },
    derivedFromBrief: true,
  },
  {
    id: 'jpmorgan-private-bank',
    name: 'JPMorgan Private Bank',
    category: 'Wealth Management',
    tier: 'aspirational',
    priceBandLow: 200_000,
    priceBandHigh: 400_000,
    targetArchetypes: ['Patron'],
    primaryArchetype: 'Patron',
    charterWeighted: true,
    fitFormats: ['Chateau Chloe series', 'Le Club 02'],
    geoFocus: 'National',
    derivedFromBrief: true,
  },
  {
    id: 'titos',
    name: "Tito's Handmade Vodka",
    category: 'Spirits',
    tier: 'mid',
    priceBandLow: 15_000,
    priceBandHigh: 35_000,
    targetArchetypes: ['Host', 'Connector'],
    primaryArchetype: 'Host',
    charterWeighted: false,
    fitFormats: ['French Leave Fridays', 'Mardi Gras'],
    geoFocus: 'Austin',
    derivedFromBrief: true,
  },
  {
    id: 'saint-arnold',
    name: 'Saint Arnold Brewing',
    category: 'Beer / F&B',
    tier: 'entry',
    priceBandLow: 5_000,
    priceBandHigh: 15_000,
    targetArchetypes: ['Host', 'Maker'],
    primaryArchetype: 'Host',
    charterWeighted: false,
    fitFormats: ['French Leave Fridays'],
    geoFocus: 'Texas',
    derivedFromBrief: true,
  },
  {
    id: 'grey-goose',
    name: 'Grey Goose',
    category: 'Spirits / Luxury',
    tier: 'mid',
    priceBandLow: 25_000,
    priceBandHigh: 60_000,
    targetArchetypes: ['Curator', 'Host', 'Patron'],
    primaryArchetype: 'Curator',
    charterWeighted: true,
    fitFormats: ['Le Club 02', "Chloe's Game"],
    geoFocus: 'National',
    derivedFromBrief: true,
  },
  {
    id: 'resy',
    name: 'Resy',
    category: 'Dining / Tech',
    tier: 'mid',
    priceBandLow: 25_000,
    priceBandHigh: 50_000,
    targetArchetypes: ['Curator', 'Connector'],
    primaryArchetype: 'Connector',
    charterWeighted: false,
    fitFormats: ["Chloe's Game", 'Mahjong League'],
    geoFocus: 'National',
    derivedFromBrief: true,
  },
  {
    id: 'foxtrot',
    name: 'Foxtrot',
    category: 'Retail / F&B',
    tier: 'mid',
    priceBandLow: 15_000,
    priceBandHigh: 40_000,
    targetArchetypes: ['Curator', 'Maker'],
    primaryArchetype: 'Curator',
    charterWeighted: false,
    fitFormats: ['Mahjong League', 'French Leave Fridays'],
    geoFocus: 'Austin',
    derivedFromBrief: true,
  },
  {
    id: 'equinox',
    name: 'Equinox',
    category: 'Fitness / Lifestyle',
    tier: 'mid',
    priceBandLow: 40_000,
    priceBandHigh: 90_000,
    targetArchetypes: ['Builder', 'Connector'],
    primaryArchetype: 'Connector',
    charterWeighted: true,
    fitFormats: ['French Leave Fridays', 'Le Club 02'],
    geoFocus: 'National',
    derivedFromBrief: true,
  },
  {
    id: 'humano',
    name: 'Humano Tequila',
    category: 'Spirits / Tequila',
    tier: 'entry',
    priceBandLow: 10_000,
    priceBandHigh: 30_000,
    targetArchetypes: ['Host', 'Curator'],
    primaryArchetype: 'Host',
    charterWeighted: false,
    fitFormats: ['French Leave Fridays', 'Chateau Chloe series'],
    geoFocus: 'Austin',
    contact: { name: 'Luis Abundis', title: 'CEO' },
    derivedFromBrief: true,
  },
];

export function formatPriceBand(low: number, high: number): string {
  const k = (n: number) => `$${Math.round(n / 1000)}K`;
  return `${k(low)}–${k(high)}`;
}

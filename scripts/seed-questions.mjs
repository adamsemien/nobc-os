import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const eq = line.indexOf('=');
  if (eq < 1) return;
  const k = line.slice(0, eq).trim();
  let v = line.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  if (k) process.env[k] = v;
});

const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });

const SCORING_INSTRUCTIONS =
  'Score this applicant on genuine fit for No Bad Company — a premium, curated members club in Austin. ' +
  'Reward specificity, evidence of building and connecting, real taste, and authentic contribution to community ' +
  'over polish, status, or credentials. Thin, generic, or status-signaling answers score low. ' +
  "Apply each question's own scoring logic and weight faithfully.";

/** All current membership questions with full insight + scoring metadata. */
const QUESTIONS = [
  { stableKey: 'basics_full_name', label: 'full name', type: 'short_text', section: 'basics', order: 1, required: true,
    insightLabel: 'identity anchor',
    insightDescription: 'establishes the person behind the application. used for referral matching and member records.',
    scoringDimension: null, scoringWeight: 0,
    scoringLogic: 'not scored. identity field only.',
    archetypeSignals: [], sponsorRelevance: null },

  { stableKey: 'basics_city', label: 'city you call home', type: 'short_text', section: 'basics', order: 2, required: true,
    insightLabel: 'geographic signal',
    insightDescription: 'reveals where this person operates. Austin-based members are prioritized for events.',
    scoringDimension: 'activation', scoringWeight: 0.3,
    scoringLogic: 'Austin scores highest for event activation potential. other major cities score moderately. no location scores lowest.',
    archetypeSignals: [], sponsorRelevance: null },

  { stableKey: 'basics_referrers', label: 'who referred you', type: 'short_text', section: 'basics', order: 3, required: false,
    insightLabel: 'network trust signal',
    insightDescription: 'the single strongest signal of fit. who vouches for you tells us more than almost anything else.',
    scoringDimension: 'contribution', scoringWeight: 0.9,
    scoringLogic: 'named referrers who are existing approved members score highest. named referrers not yet in system score moderately. no referrer scores lowest.',
    archetypeSignals: ['Connector', 'Patron'], sponsorRelevance: null },

  { stableKey: 'real_working_on', label: 'what are you working on right now?', type: 'long_text', section: 'real_questions', order: 1, required: false,
    insightLabel: 'ambition signal',
    insightDescription: 'reveals whether someone is actively building vs observing. specificity and stakes indicate drive.',
    scoringDimension: 'influence', scoringWeight: 0.8,
    scoringLogic: 'specific projects with named outcomes score higher than vague descriptions. evidence of shipping or leading scores highest. passive or consumer answers score lowest.',
    archetypeSignals: ['Builder', 'Maker', 'Patron'], sponsorRelevance: 'B2B SaaS, fintech, business banking' },

  { stableKey: 'real_obsessed_with', label: 'what are you obsessed with right now?', type: 'long_text', section: 'real_questions', order: 2, required: false,
    insightLabel: 'curiosity depth',
    insightDescription: 'reveals intellectual range and whether someone follows trends or leads them.',
    scoringDimension: 'activation', scoringWeight: 0.6,
    scoringLogic: 'niche specific obsessions score higher than mainstream ones. cross-domain curiosity scores highest. generic pop culture answers score lowest.',
    archetypeSignals: ['Curator', 'Maker', 'Builder'], sponsorRelevance: 'fashion, beauty, luxury goods, creative tools' },

  { stableKey: 'real_called_about', label: 'what do people come to you for?', type: 'long_text', section: 'real_questions', order: 3, required: false,
    insightLabel: 'social utility',
    insightDescription: 'the single most predictive question for archetype. reveals how this person functions in a network.',
    scoringDimension: 'influence', scoringWeight: 1.0,
    scoringLogic: 'intros and connections → Connector. taste and recommendations → Curator. advice and execution → Builder. hospitality and warmth → Host. capital and access → Patron. making and creating → Maker. score highest when specific and confident.',
    archetypeSignals: ['Connector', 'Curator', 'Builder', 'Host', 'Patron', 'Maker'], sponsorRelevance: 'all segments' },

  { stableKey: 'world_interesting_people', label: 'who are the most interesting people in your life right now?', type: 'long_text', section: 'your_world', order: 1, required: false,
    insightLabel: 'network quality',
    insightDescription: "reveals the caliber and diversity of someone's inner circle. a proxy for their own ceiling.",
    scoringDimension: 'influence', scoringWeight: 0.9,
    scoringLogic: 'specific named people with unusual combinations of traits score highest. generic answers score lowest. cross-industry cross-geography networks score higher than homogeneous ones.',
    archetypeSignals: ['Connector', 'Patron', 'Curator'], sponsorRelevance: 'premium travel, members clubs, executive services' },

  { stableKey: 'world_connected_people', label: 'describe a time you connected two people who needed to meet', type: 'long_text', section: 'your_world', order: 2, required: false,
    insightLabel: 'connector behavior',
    insightDescription: 'reveals whether someone actually acts on their network or just holds it.',
    scoringDimension: 'contribution', scoringWeight: 1.0,
    scoringLogic: 'specific story with named outcome scores highest. vague or hypothetical scores lowest. stories where the connection created something lasting score highest. no story scores zero.',
    archetypeSignals: ['Connector', 'Host', 'Patron'], sponsorRelevance: 'premium travel, members clubs' },

  { stableKey: 'world_community_loyalty', label: 'what community have you stayed loyal to and why?', type: 'long_text', section: 'your_world', order: 3, required: false,
    insightLabel: 'loyalty signal',
    insightDescription: 'reveals whether someone builds or consumes community. loyalty over time is rare and predictive.',
    scoringDimension: 'contribution', scoringWeight: 0.8,
    scoringLogic: 'communities the applicant helped build score higher than ones they joined. longevity scores higher. small intentional communities score higher than large platforms.',
    archetypeSignals: ['Host', 'Connector', 'Patron'], sponsorRelevance: 'spirits and F&B, hospitality' },

  { stableKey: 'taste_place_details', label: 'name a place that gets the details right', type: 'long_text', section: 'taste', order: 1, required: false,
    insightLabel: 'taste calibration',
    insightDescription: 'reveals whether someone notices craft and intention. specificity is everything.',
    scoringDimension: 'taste', scoringWeight: 0.9,
    scoringLogic: 'specific named places with specific named details score highest. generic well-known places score low. obscure or regional places with specific reasoning score highest.',
    archetypeSignals: ['Curator', 'Host', 'Maker'], sponsorRelevance: 'fashion, luxury goods, hotels, restaurants' },

  { stableKey: 'taste_trust_taste', label: 'whose taste do you trust automatically?', type: 'long_text', section: 'taste', order: 2, required: false,
    insightLabel: 'taste network',
    insightDescription: 'reveals who they look up to and how they calibrate quality.',
    scoringDimension: 'taste', scoringWeight: 0.7,
    scoringLogic: 'specific named people with reasoning score highest. famous obvious names score low. unusual niche tastemakers score highest.',
    archetypeSignals: ['Curator', 'Maker'], sponsorRelevance: 'fashion, beauty, luxury goods' },

  { stableKey: 'taste_recommend_paid', label: "what do you recommend like you're paid for it?", type: 'long_text', section: 'taste', order: 3, required: false,
    insightLabel: 'advocacy signal',
    insightDescription: 'reveals genuine enthusiasm and whether someone creates demand in their network.',
    scoringDimension: 'activation', scoringWeight: 0.8,
    scoringLogic: 'specific product or experience with specific reasoning scores highest. enthusiasm and specificity together score highest. generic answers score lowest.',
    archetypeSignals: ['Curator', 'Host', 'Connector'], sponsorRelevance: 'all sponsor segments — key advocacy question' },

  { stableKey: 'taste_splurge_save', label: 'splurge vs save — where do you draw the line?', type: 'long_text', section: 'taste', order: 4, required: false,
    insightLabel: 'value signal',
    insightDescription: 'reveals what someone considers worth paying for. a proxy for their priorities and taste hierarchy.',
    scoringDimension: 'taste', scoringWeight: 0.5,
    scoringLogic: 'specific named categories with reasoning score higher than vague answers. counterintuitive combinations score highest.',
    archetypeSignals: ['Curator', 'Patron', 'Host'], sponsorRelevance: 'luxury goods, wealth management, real estate' },

  { stableKey: 'rapid_karaoke', label: 'karaoke go-to?', type: 'short_text', section: 'rapid_fire', order: 1, required: false,
    insightLabel: 'self-awareness signal',
    insightDescription: 'reveals comfort with being seen and a sense of humor about themselves.',
    scoringDimension: 'activation', scoringWeight: 0.4,
    scoringLogic: 'any specific answer scores equally. no answer or overly serious answer scores lower. tests engagement not musical taste.',
    archetypeSignals: ['Host', 'Connector'], sponsorRelevance: 'spirits and F&B' },

  { stableKey: 'rapid_coffee_table', label: "what's on your coffee table right now?", type: 'short_text', section: 'rapid_fire', order: 2, required: false,
    insightLabel: 'home culture signal',
    insightDescription: 'reveals taste, intellectual life, and what someone surrounds themselves with when no one is watching.',
    scoringDimension: 'taste', scoringWeight: 0.5,
    scoringLogic: 'specific objects with texture score highest. books plus objects score higher than just books. generic or empty answers score lowest.',
    archetypeSignals: ['Curator', 'Maker', 'Host'], sponsorRelevance: 'home and interiors, luxury goods' },

  { stableKey: 'rapid_sunday_morning', label: 'sunday morning looks like?', type: 'short_text', section: 'rapid_fire', order: 3, required: false,
    insightLabel: 'lifestyle signal',
    insightDescription: 'reveals rhythm, priorities, and how someone recovers and recharges.',
    scoringDimension: 'activation', scoringWeight: 0.5,
    scoringLogic: 'specific rituals score higher than vague answers. answers that reveal community or craft score highest.',
    archetypeSignals: ['Host', 'Maker', 'Patron'], sponsorRelevance: 'F&B, lifestyle' },

  { stableKey: 'rapid_most_dont_know', label: "something most people don't know about you", type: 'long_text', section: 'rapid_fire', order: 4, required: false,
    insightLabel: 'depth signal',
    insightDescription: 'reveals whether someone has a life outside their professional identity. unexpected answers are the point.',
    scoringDimension: 'activation', scoringWeight: 0.6,
    scoringLogic: 'genuinely surprising or specific answers score highest. humble-brag professional answers score lowest. vulnerability or humor score highest. anything that makes the reader smile scores well.',
    archetypeSignals: ['Maker', 'Builder', 'Curator'], sponsorRelevance: 'creative tools, lifestyle' },
];

async function main() {
  const workspace = await db.workspace.findFirst({ where: { slug: 'nobc' } });
  if (!workspace) throw new Error("Workspace 'nobc' not found — run seed-workspace.mjs first.");

  const template = await db.applicationTemplate.upsert({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: 'membership' } },
    update: { name: 'Membership Application', isActive: true, isDefault: true, scoringInstructions: SCORING_INSTRUCTIONS },
    create: {
      workspaceId: workspace.id,
      name: 'Membership Application',
      description: 'The default No Bad Company membership application.',
      slug: 'membership',
      isActive: true,
      isDefault: true,
      scoringInstructions: SCORING_INSTRUCTIONS,
    },
  });

  // Idempotent: replace this template's questions with the canonical set.
  await db.questionDefinition.deleteMany({ where: { templateId: template.id } });
  await db.questionDefinition.createMany({
    data: QUESTIONS.map(q => ({ ...q, workspaceId: workspace.id, templateId: template.id })),
  });

  await db.workspace.update({
    where: { id: workspace.id },
    data: { defaultTemplateId: template.id },
  });

  console.log(`Seeded template "${template.name}" (${template.id}) with ${QUESTIONS.length} questions.`);
}

main()
  .then(() => db.$disconnect())
  .catch(async e => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });

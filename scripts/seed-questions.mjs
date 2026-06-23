/**
 * Canonical membership scoring model - single source of truth for the 23 scored
 * QuestionDefinitions that drive AI archetype scoring (lib/scoring.ts).
 *
 * Authored 2026-06-23 against the CURRENT /apply form (app/apply/_lib/questions.ts).
 * Every stableKey === the live form field id, so lib/scoring.ts resolves each
 * answer by identity (lib/question-key-map.ts) with NO bridge, except the two
 * GROUP questions (referrals, recSources) whose answers live under dotted
 * subfield keys - those keep a bridge entry that joins the subfields.
 *
 * Two modes:
 *   node scripts/seed-questions.mjs                      → seed the DEV workspace
 *       (resolves SEED_WORKSPACE_ID, else the most-populated "No Bad Company"
 *        workspace - the proven seed-demo.ts pattern, NOT slug:'nobc' which no
 *        live workspace carries).
 *   node scripts/seed-questions.mjs --print-sql [--workspace=<id>]
 *       → print a reviewable transactional SQL block to stdout for Adam to paste
 *         into the Neon Console against PROD. No DB connection, no .env needed.
 *
 * Prod is seeded by the printed SQL (the repo's prod-DB-ops-in-Neon-Console
 * invariant), never by this script's dev path.
 */

const SCORING_INSTRUCTIONS =
  'Score this applicant on genuine fit for No Bad Company - a premium, curated members club in Austin. ' +
  'Reward specificity, evidence of building and connecting, real taste, and authentic contribution to community ' +
  'over polish, status, or credentials. Thin, generic, or status-signaling answers score low. ' +
  "Apply each question's own scoring logic and weight faithfully.";

const TEMPLATE = {
  name: 'Membership Application',
  description: 'The default No Bad Company membership application.',
  slug: 'membership',
};

/** Default PROD target for --print-sql (the verified 180-member workspace).
 *  Override with --workspace=<id> or APPLY_SEED_WORKSPACE_ID. */
const PROD_WORKSPACE_ID = 'cmpd6xckn000004jl47xpwghx';

/**
 * The 23 scored questions, in form order. stableKey === form field id.
 *   dim    = primary scoringDimension (influence | contribution | activation | taste)
 *   wt     = scoringWeight (0 ignore .. 1 primary)
 *   sig    = archetypeSignals (hints to the LLM's archetype pick)
 *   logic  = scoringLogic rubric (injected verbatim into the scoring prompt)
 *   spon   = sponsorRelevance tag (orthogonal to the archetype reveal; tagged
 *            now, consumed later by Sponsor Intelligence as rolled-up data only)
 */
const QUESTIONS = [
  // ── Section 01 - Who You Are ───────────────────────────────────────────────
  { stableKey: 'whatYouDo', label: 'What Do You Do', type: 'long_text', section: 'who-you-are',
    insightLabel: 'what they do / what they build',
    insightDescription: 'Primary work and what they are building - reach, ownership, and field-command signal.',
    dim: 'influence', wt: 0.9, sig: ['Builder', 'Patron', 'Maker'], spon: null,
    logic: 'Work that carries reach, builds something, or commands a field scores high; ownership/creation over title. Vague "employed by" scores lower.' },

  { stableKey: 'creativePursuits', label: 'Creative Pursuits and Passion Projects', type: 'long_text', section: 'who-you-are',
    insightLabel: 'creative pursuits outside work',
    insightDescription: 'Making vs consuming - the core Maker signal.',
    dim: 'taste', wt: 0.5, sig: ['Maker', 'Curator'], spon: null,
    logic: 'Active making - craft, art, building with hands or code - scores high for Maker; pure consumption scores low.' },

  { stableKey: 'referrals', label: 'Who referred you?', type: 'group', section: 'who-you-are',
    insightLabel: 'who referred them',
    insightDescription: 'Referral trust - the strongest single fit signal. Joins referral1-3.',
    dim: 'contribution', wt: 0.9, sig: ['Connector', 'Patron', 'Host'], spon: null,
    logic: 'Named referrers who are existing approved members score highest; multiple strong referrals raise contribution; vague or none scores low.' },

  { stableKey: 'cities', label: 'What cities do you split time between or visit regularly?', type: 'short_text', section: 'who-you-are',
    insightLabel: 'cities they move between',
    insightDescription: 'Cross-market reach - a mild activation signal.',
    dim: 'activation', wt: 0.3, sig: ['Connector', 'Patron'], spon: null,
    logic: 'Multiple real cities / cross-market movement is a mild reach signal; single home city is neutral.' },

  // ── Section 02 - How You Move Through the World ────────────────────────────
  { stableKey: 'comeToYouFor', label: 'What do people consistently come to you for?', type: 'long_text', section: 'how-you-move',
    insightLabel: 'what people rely on them for',
    insightDescription: 'The anchor archetype tell - the answer itself drives the archetype.',
    dim: 'influence', wt: 1.0, sig: ['Connector', 'Host', 'Curator', 'Builder', 'Maker', 'Patron'], spon: null,
    logic: 'The content decides: intros to Connector, recs/taste to Curator, gatherings to Host, advice/capital to Patron, building help to Builder, craft to Maker. Specific repeated reliance scores high; generic "good listener" low.' },

  { stableKey: 'expertIn', label: 'What would you call yourself a genuine expert in?', type: 'long_text', section: 'how-you-move',
    insightLabel: 'genuine domain expertise',
    insightDescription: 'Demonstrable depth vs hedged or hobby-level claims.',
    dim: 'influence', wt: 0.8, sig: ['Builder', 'Maker', 'Curator'], spon: null,
    logic: 'Genuine demonstrable domain depth scores high; hedged or hobby-level claims score low.' },

  { stableKey: 'recommendForPay', label: "What do you recommend to everyone like you're getting paid for it?", type: 'long_text', section: 'how-you-move',
    insightLabel: 'unpaid evangelism',
    insightDescription: 'Tastemaker influence - do others follow their unsolicited recommendations.',
    dim: 'influence', wt: 0.7, sig: ['Curator', 'Connector', 'Host'], spon: 'medium',
    logic: 'Unpaid evangelism others actually follow signals tastemaker influence; scores high when it reveals real discernment.' },

  { stableKey: 'lastConvinced', label: "What's the last thing you convinced a friend to buy?", type: 'long_text', section: 'how-you-move',
    insightLabel: 'last thing they convinced a friend to buy',
    insightDescription: 'Whether others act on their word - a concrete influence proof.',
    dim: 'influence', wt: 0.6, sig: ['Connector', 'Curator'], spon: 'medium',
    logic: 'Evidence others act on their word - a specific successful recommendation - scores high; "nothing comes to mind" scores low.' },

  { stableKey: 'obsessedWith', label: "What's something you've become obsessed with lately?", type: 'long_text', section: 'how-you-move',
    insightLabel: 'current obsession',
    insightDescription: 'Generative energy (making/learning) vs passive consumption, plus specificity.',
    dim: 'activation', wt: 0.6, sig: ['Maker', 'Builder', 'Curator'], spon: null,
    logic: 'Depth of current obsession and whether it is generative (making/learning) vs passive; high energy plus specificity scores high.' },

  { stableKey: 'connectionCreated', label: 'Tell us about a connection or opportunity you helped create for someone else.', type: 'long_text', section: 'how-you-move',
    insightLabel: 'a connection they created for someone',
    insightDescription: 'The core contribution signal - a concrete, consequential connection.',
    dim: 'contribution', wt: 1.0, sig: ['Connector', 'Patron', 'Host'], spon: null,
    logic: 'A concrete consequential connection or opportunity created for someone else scores highest. This is the core contribution signal. Hypothetical or self-serving scores low.' },

  { stableKey: 'loyalCommunity', label: "Tell us about a group or community you've stayed loyal to - and what keeps you there.", type: 'long_text', section: 'how-you-move',
    insightLabel: 'a community they stayed loyal to',
    insightDescription: 'Sustained investment in a group vs transactional membership.',
    dim: 'contribution', wt: 0.7, sig: ['Host', 'Connector'], spon: null,
    logic: 'Sustained investment in a group plus a clear reason for staying scores high; transactional membership scores low.' },

  { stableKey: 'goodCompany', label: "How do you know when you're in good company?", type: 'long_text', section: 'how-you-move',
    insightLabel: 'how they recognize good company',
    insightDescription: 'Values around generosity and presence vs status/access-only framing.',
    dim: 'contribution', wt: 0.6, sig: ['Host', 'Connector'], spon: null,
    logic: 'Values centering mutual generosity, presence, good-faith company score high; status/access-only framing scores low.' },

  { stableKey: 'detailsRight', label: "What's a restaurant, hotel, bar, or shop that gets the details right? And why?", type: 'long_text', section: 'how-you-move',
    insightLabel: 'a place that gets the details right',
    insightDescription: 'Precision of taste - naming the specific details that make a place work.',
    dim: 'taste', wt: 0.8, sig: ['Curator', 'Host', 'Maker'], spon: 'high',
    logic: 'Naming a specific place and the precise details that make it work signals strong taste; generic "nice vibes" scores low.' },

  { stableKey: 'trustedTaste', label: 'Whose taste do you trust almost automatically - and what did they do to earn it?', type: 'long_text', section: 'how-you-move',
    insightLabel: 'whose taste they trust and why',
    insightDescription: 'Discernment and the reasoning behind who they calibrate against.',
    dim: 'taste', wt: 0.7, sig: ['Curator', 'Maker'], spon: null,
    logic: 'Articulate reasoning for whose taste they trust and why it was earned signals real discernment; name-drop without reasoning scores low.' },

  { stableKey: 'brandPartner', label: 'If a brand reached out to partner with you tomorrow, which one would make sense - and why?', type: 'long_text', section: 'how-you-move',
    insightLabel: 'a brand partnership that fits',
    insightDescription: 'Taste and self-awareness in fit - values/aesthetic over reach-for-money.',
    dim: 'taste', wt: 0.6, sig: ['Curator', 'Patron'], spon: 'high',
    logic: 'A partner brand justified on values/aesthetic (not reach-for-money) signals taste and self-awareness.' },

  { stableKey: 'loyalBrands', label: 'What brands are you most loyal to and why?', type: 'long_text', section: 'how-you-move',
    insightLabel: 'brands they are loyal to and why',
    insightDescription: 'Taste consistency - specific brands with a coherent reason.',
    dim: 'taste', wt: 0.5, sig: ['Curator', 'Patron'], spon: 'high',
    logic: 'Specific brands with a coherent "why" signal taste consistency.' },

  { stableKey: 'splurgeSave', label: 'Where do you splurge and where do you save?', type: 'long_text', section: 'how-you-move',
    insightLabel: 'where they splurge vs save',
    insightDescription: 'Where quality genuinely matters to them - a priorities/taste hierarchy.',
    dim: 'taste', wt: 0.5, sig: ['Patron', 'Curator', 'Host'], spon: 'medium',
    logic: 'A deliberate splurge/save logic reveals where quality genuinely matters to them.' },

  { stableKey: 'idealSaturday', label: "What's your ideal Saturday?", type: 'long_text', section: 'how-you-move',
    insightLabel: 'their ideal Saturday',
    insightDescription: 'Gathering/making/hosting vs passive consumption.',
    dim: 'activation', wt: 0.5, sig: ['Host', 'Maker', 'Patron'], spon: null,
    logic: 'A Saturday built around gathering, making, or hosting scores toward those archetypes; passive consumption scores low on activation.' },

  { stableKey: 'recSources', label: 'Where do you turn for recommendations?', type: 'group', section: 'how-you-move',
    insightLabel: 'where they get recommendations',
    insightDescription: 'Their information diet across categories. Joins travel/food/health/beauty/fashion.',
    dim: 'taste', wt: 0.4, sig: ['Curator'], spon: 'medium',
    logic: "Specific discerning sources across categories signal a curator's information diet." },

  { stableKey: 'scrollStopping', label: 'What kind of content stops you scrolling - and where is it living?', type: 'long_text', section: 'how-you-move',
    insightLabel: 'content that stops their scroll',
    insightDescription: 'Aesthetic and the channels they value (platform matters as much as content).',
    dim: 'taste', wt: 0.4, sig: ['Curator', 'Maker'], spon: 'medium',
    logic: 'What stops their scroll and where it lives signals aesthetic and valued channels.' },

  // ── Section 03 - What You're Here For ──────────────────────────────────────
  { stableKey: 'flowThrough', label: 'What kind of people, ideas, or opportunities tend to flow through your world?', type: 'long_text', section: 'what-youre-here-for',
    insightLabel: 'what flows through their world',
    insightDescription: 'Network gravity - the caliber of what moves through them.',
    dim: 'influence', wt: 0.8, sig: ['Connector', 'Patron', 'Curator'], spon: null,
    logic: 'High-quality people/ideas/opportunities flowing through their world signals network gravity; thin or self-focused answers score low.' },

  { stableKey: 'investedIn', label: "What's something you've invested heavily in recently?", type: 'long_text', section: 'what-youre-here-for',
    insightLabel: 'what they invested heavily in',
    insightDescription: 'Patron/Builder backing - money, time, or energy into a person/project/cause.',
    dim: 'contribution', wt: 0.6, sig: ['Patron', 'Builder'], spon: null,
    logic: 'Heavy recent investment in a person, project, or cause signals Patron/Builder; money, time, or backing all count. Investment in self only scores lower on contribution.' },

  { stableKey: 'friendDescribe', label: 'How would a close friend describe you at a party?', type: 'long_text', section: 'what-youre-here-for',
    insightLabel: 'how a friend describes them at a party',
    insightDescription: 'Social energy - gathering and making people comfortable.',
    dim: 'activation', wt: 0.5, sig: ['Host', 'Connector'], spon: null,
    logic: 'A party-description centering energy, gathering, or making people comfortable signals Host/Connector activation.' },
];

// ── SQL emitter (--print-sql) ────────────────────────────────────────────────

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const arr = (a) => 'ARRAY[' + a.map(q).join(', ') + ']::text[]';
const nullable = (s) => (s == null ? 'NULL' : q(s));

function buildSql(workspaceId) {
  const wid = q(workspaceId);
  const tmplId = `(SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = ${wid} AND slug = ${q(TEMPLATE.slug)})`;

  const rows = QUESTIONS.map((d, i) =>
    `  (gen_random_uuid()::text, ${wid}, ${tmplId}, ${q(d.stableKey)}, ${q(d.label)}, ${q(d.type)}, ` +
    `${q(d.section)}, ${i + 1}, false, true, ${q(d.insightLabel)}, ${q(d.insightDescription)}, ` +
    `${q(d.dim)}, ${d.wt}, ${q(d.logic)}, ${arr(d.sig)}, ${nullable(d.spon)}, now(), now())`,
  ).join(',\n');

  return `-- NoBC apply scoring model - seed ${QUESTIONS.length} scored QuestionDefinitions.
-- Target workspace: ${workspaceId}
-- Idempotent + transactional. Safe to re-run (template upserts, questions are
-- replaced). Paste into the Neon Console SQL editor against PROD.
BEGIN;

-- 1. Template (upsert by (workspaceId, slug))
INSERT INTO "ApplicationTemplate"
  (id, "workspaceId", name, description, slug, "isActive", "isDefault",
   "scoringInstructions", "archetypesEnabled", "memberWorthEnabled", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, ${wid}, ${q(TEMPLATE.name)}, ${q(TEMPLATE.description)}, ${q(TEMPLATE.slug)},
   true, true, ${q(SCORING_INSTRUCTIONS)}, true, true, now(), now())
ON CONFLICT ("workspaceId", slug) DO UPDATE
  SET name = EXCLUDED.name, "isActive" = true, "isDefault" = true,
      "scoringInstructions" = EXCLUDED."scoringInstructions", "updatedAt" = now();

-- 2. Replace this template's questions (idempotent re-seed)
DELETE FROM "QuestionDefinition" WHERE "templateId" = ${tmplId};

-- 3. Insert the ${QUESTIONS.length} scored questions
INSERT INTO "QuestionDefinition"
  (id, "workspaceId", "templateId", "stableKey", label, type, section, "order", required, "isActive",
   "insightLabel", "insightDescription", "scoringDimension", "scoringWeight", "scoringLogic",
   "archetypeSignals", "sponsorRelevance", "createdAt", "updatedAt")
VALUES
${rows};

-- 4. Point the workspace's default template at this one (so lib/scoring.ts resolves it)
UPDATE "Workspace" SET "defaultTemplateId" = ${tmplId} WHERE id = ${wid};

COMMIT;
`;
}

// ── Dev seeding path ─────────────────────────────────────────────────────────

async function seedDev() {
  const { readFileSync } = await import('fs');
  // Load .env.local so DATABASE_URL points at the dev DB (the repo dotenv pattern).
  try {
    readFileSync('.env.local', 'utf8').split('\n').forEach((line) => {
      const eq = line.indexOf('=');
      if (eq < 1) return;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (k) process.env[k] = v;
    });
  } catch {
    /* no .env.local - rely on the ambient environment */
  }

  const { PrismaNeon } = await import('@prisma/adapter-neon');
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });

  // Resolve the target workspace by id (explicit) or by name (most-populated) -
  // the seed-demo.ts pattern. NEVER by slug:'nobc' (no live workspace has it).
  const workspace = process.env.SEED_WORKSPACE_ID
    ? await db.workspace.findUnique({ where: { id: process.env.SEED_WORKSPACE_ID } })
    : await db.workspace.findFirst({
        where: { name: 'No Bad Company' },
        orderBy: { members: { _count: 'desc' } },
      });
  if (!workspace) throw new Error('No "No Bad Company" workspace found. Set SEED_WORKSPACE_ID.');

  const template = await db.applicationTemplate.upsert({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: TEMPLATE.slug } },
    update: { name: TEMPLATE.name, isActive: true, isDefault: true, scoringInstructions: SCORING_INSTRUCTIONS },
    create: {
      workspaceId: workspace.id,
      name: TEMPLATE.name,
      description: TEMPLATE.description,
      slug: TEMPLATE.slug,
      isActive: true,
      isDefault: true,
      scoringInstructions: SCORING_INSTRUCTIONS,
    },
  });

  await db.questionDefinition.deleteMany({ where: { templateId: template.id } });
  await db.questionDefinition.createMany({
    data: QUESTIONS.map((d, i) => ({
      workspaceId: workspace.id,
      templateId: template.id,
      stableKey: d.stableKey,
      label: d.label,
      type: d.type,
      section: d.section,
      order: i + 1,
      required: false,
      insightLabel: d.insightLabel,
      insightDescription: d.insightDescription,
      scoringDimension: d.dim,
      scoringWeight: d.wt,
      scoringLogic: d.logic,
      archetypeSignals: d.sig,
      sponsorRelevance: d.spon,
    })),
  });

  await db.workspace.update({ where: { id: workspace.id }, data: { defaultTemplateId: template.id } });

  console.log(`Seeded "${template.name}" (${template.id}) → workspace ${workspace.name} (${workspace.id}) with ${QUESTIONS.length} scored questions.`);
  await db.$disconnect();
}

async function main() {
  if (process.argv.includes('--print-sql')) {
    const wsArg = process.argv.find((a) => a.startsWith('--workspace='));
    const workspaceId = wsArg ? wsArg.split('=')[1] : process.env.APPLY_SEED_WORKSPACE_ID || PROD_WORKSPACE_ID;
    process.stdout.write(buildSql(workspaceId));
    return;
  }
  await seedDev();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

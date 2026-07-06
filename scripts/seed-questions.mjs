/**
 * Canonical membership scoring model - single source of truth for the 13 scored
 * QuestionDefinitions that drive AI archetype scoring (lib/scoring.ts).
 *
 * Authored 2026-07-06 for the six-archetype recut (Builder, Connector, Host as
 * Caregiver, Sage, Patron as Champion, Spark) against the CURRENT /apply form
 * (app/apply/_lib/questions.ts). Every stableKey === the live form field id, so
 * lib/scoring.ts resolves each answer by identity (lib/question-key-map.ts) with
 * NO bridge, except the one GROUP question (referrals) whose answers live under
 * dotted first/last subfield keys - that keeps a bridge entry that joins them.
 *
 * Signals use STORED enum names (Host, not Caregiver; Patron, not Champion).
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
 *
 * The QUESTIONS rubric is exported so the sync guard test
 * (tests/unit/question-key-map.test.ts) can assert every scored stableKey
 * resolves against the live form. main() only runs on direct execution.
 */

import { fileURLToPath } from 'node:url';

const SCORING_INSTRUCTIONS =
  'Score this applicant on genuine fit for No Bad Company - a premium, curated members club in Austin. ' +
  'Reward specificity, evidence of building and connecting, real generosity, and authentic contribution to community ' +
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
 * The 13 scored questions, in scoring order. stableKey === form field id.
 *   dim    = primary scoringDimension (influence | contribution | activation | taste)
 *   wt     = scoringWeight (0 ignore .. 1 primary)
 *   sig    = archetypeSignals - STORED enum names (Connector, Host, Builder, Patron, Sage, Spark)
 *   logic  = scoringLogic rubric (injected verbatim into the scoring prompt)
 *   spon   = sponsorRelevance tag (all null in this recut - no surviving question
 *            carried one; carried as an input to a future Sponsor Intelligence re-fire)
 */
export const QUESTIONS = [
  { stableKey: 'whatYouDo', label: 'What do you do?', type: 'long_text', section: 'who-you-are',
    insightLabel: 'what they do / what they build',
    insightDescription: 'Primary work - ownership, and whether they build, ship, or back something.',
    dim: 'influence', wt: 0.9, sig: ['Builder', 'Patron'], spon: null,
    logic: 'Work that builds, ships, or backs something scores high; ownership over title; vague "employed by" low.' },

  { stableKey: 'comeToYouFor', label: 'What do people consistently come to you for?', type: 'long_text', section: 'how-you-move',
    insightLabel: 'what people rely on them for',
    insightDescription: 'ANCHOR - the answer itself drives the archetype.',
    dim: 'influence', wt: 1.0, sig: ['Connector', 'Host', 'Builder', 'Patron', 'Sage', 'Spark'], spon: null,
    logic: 'ANCHOR. The content decides: intros to Connector, advice/perspective to Sage, showing-up/backing to Patron, building help to Builder, tending people to Host, energy/fun to Spark. Specific repeated reliance scores high; generic scores low.' },

  { stableKey: 'characteristicsGoodAtJob', label: 'What characteristics make you good at your job?', type: 'long_text', section: 'who-you-are',
    insightLabel: 'traits that make them good at their work',
    insightDescription: 'Execution/ownership traits vs perception/judgment traits - Builder vs Sage tell.',
    dim: 'influence', wt: 0.6, sig: ['Builder', 'Sage'], spon: null,
    logic: 'Execution/ownership traits point to Builder; perception/judgment/reading-people traits point to Sage. Concrete self-knowledge high; cliché low.' },

  { stableKey: 'creativePursuits', label: 'Creative Pursuits and Passion Projects', type: 'long_text', section: 'who-you-are',
    insightLabel: 'creative pursuits outside work',
    insightDescription: 'Active making/building vs pure consumption.',
    dim: 'activation', wt: 0.5, sig: ['Builder'], spon: null,
    logic: 'Active making/building outside work scores high; pure consumption scores low.' },

  { stableKey: 'obsessedWith', label: "What's something you've become obsessed with?", type: 'long_text', section: 'how-you-move',
    insightLabel: 'current obsession',
    insightDescription: 'Generative obsession (making/learning) plus specificity vs passive.',
    dim: 'activation', wt: 0.6, sig: ['Builder', 'Sage'], spon: null,
    logic: 'Generative obsession (making/learning) plus specificity scores high; passive consumption scores low.' },

  { stableKey: 'referrals', label: 'Who referred you?', type: 'group', section: 'who-you-are',
    insightLabel: 'who referred them',
    insightDescription: 'Referral trust. Joins referral1-3 first/last names.',
    dim: 'contribution', wt: 0.9, sig: ['Connector', 'Patron', 'Host'], spon: null,
    logic: 'Named existing-member referrers score highest; multiple strong referrals raise contribution; vague or none scores low.' },

  { stableKey: 'cities', label: 'What other cities do you spend real time in?', type: 'short_text', section: 'who-you-are',
    insightLabel: 'cities they move between',
    insightDescription: 'Cross-market movement - a mild reach signal.',
    dim: 'activation', wt: 0.3, sig: ['Connector', 'Patron'], spon: null,
    logic: 'Multi-market movement is a mild reach signal; a single home city is neutral.' },

  { stableKey: 'connectionCreated', label: 'Tell us about a connection or opportunity you helped create for someone else.', type: 'long_text', section: 'how-you-move',
    insightLabel: 'a connection they created for someone',
    insightDescription: 'CORE contribution - a concrete, consequential connection.',
    dim: 'contribution', wt: 1.0, sig: ['Connector', 'Patron', 'Host'], spon: null,
    logic: 'CORE contribution. A concrete consequential connection created for someone else scores highest; hypothetical or self-serving scores low.' },

  { stableKey: 'loyalCommunity', label: "Tell us about a group or community you've stayed loyal to - and what keeps you there?", type: 'long_text', section: 'how-you-move',
    insightLabel: 'a community they stayed loyal to',
    insightDescription: 'Sustained investment in a group plus a clear reason.',
    dim: 'contribution', wt: 0.7, sig: ['Host', 'Connector'], spon: null,
    logic: 'Sustained investment in a group plus a clear reason scores high; transactional membership scores low.' },

  { stableKey: 'goodCompany', label: "How do you know when you're in good company?", type: 'long_text', section: 'how-you-move',
    insightLabel: 'how they recognize good company',
    insightDescription: 'Values centering generosity and presence vs status/access-only.',
    dim: 'contribution', wt: 0.6, sig: ['Host', 'Connector'], spon: null,
    logic: 'Values centering mutual generosity and presence score high; status or access-only framing scores low.' },

  { stableKey: 'walkIntoRoom', label: "You walk into a room where you don't know anyone. What do you actually do?", type: 'long_text', section: 'how-you-move',
    insightLabel: 'what they do walking into a room of strangers',
    insightDescription: 'NEUTRAL DISCRIMINATOR - behavior sorts the archetype.',
    dim: 'activation', wt: 0.9, sig: ['Connector', 'Host', 'Builder', 'Patron', 'Sage', 'Spark'], spon: null,
    logic: 'NEUTRAL DISCRIMINATOR. Behavior sorts: works-the-room / first-to-talk to Spark, finds-the-person-alone to Host, maps-who-should-meet to Connector, reads-the-room-first to Sage, finds-their-person to Patron, assesses-the-space / setup to Builder. Reward specificity; generic "I mingle" scores low.' },

  { stableKey: 'unplannedFun', label: "What's the most fun you've had recently that wasn't planned?", type: 'long_text', section: 'how-you-move',
    insightLabel: 'their best unplanned recent fun',
    insightDescription: 'The say-yes instinct - ease and specificity of a spontaneous story.',
    dim: 'activation', wt: 0.6, sig: ['Spark'], spon: null,
    logic: "Ease and specificity of a spontaneous story scores high; can't-recall or reframed-as-planned scores low. Catches the say-yes instinct." },

  { stableKey: 'meetPeople', label: 'Where do you meet new people?', type: 'long_text', section: 'how-you-move',
    insightLabel: 'where they meet new people',
    insightDescription: 'Rich people-oriented sources vs thin or purely online.',
    dim: 'contribution', wt: 0.4, sig: ['Connector', 'Spark'], spon: null,
    logic: 'Rich people-oriented sources (hobbies, gatherings, through-friends) score high; thin or purely online scores low.' },
];

// ── SQL emitter (--print-sql) ────────────────────────────────────────────────

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const arr = (a) => 'ARRAY[' + a.map(q).join(', ') + ']::text[]';
const nullable = (s) => (s == null ? 'NULL' : q(s));

export function buildSql(workspaceId) {
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

// Only run on direct execution (`node scripts/seed-questions.mjs ...`); importing
// this module (the sync guard test) must not connect to a DB or print SQL.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

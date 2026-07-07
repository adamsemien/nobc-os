/**
 * Apply scoring-model validation harness (DEV ONLY).
 *
 * Seeds the dev workspace's scoring template, then runs N deliberately
 * archetypal synthetic applicants through the REAL scoreApplication path
 * (lib/scoring.ts → template resolution → bridge → Sonnet), prints intended-vs-
 * computed archetype + dimension scores, and deletes the synthetic rows.
 *
 *   npx tsx scripts/validate-scoring.ts
 *
 * Resolves the target workspace from SEED_WORKSPACE_ID, else the single local
 * workspace, else the most-populated "No Bad Company". HARD-REFUSES to run
 * against the prod workspace (cmpd6xckn000004jl47xpwghx). Uses real Anthropic
 * calls (one per persona) — needs ANTHROPIC_API_KEY in .env.local.
 */
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

// Load .env.local BEFORE importing anything that reads DATABASE_URL at module load.
readFileSync('.env.local', 'utf8').split('\n').forEach((line) => {
  const eq = line.indexOf('=');
  if (eq < 1) return;
  const k = line.slice(0, eq).trim();
  let v = line.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (k) process.env[k] = v;
});

const PROD_WS = 'cmpd6xckn000004jl47xpwghx';

type Persona = { intended: string; answers: Record<string, string> };

const PERSONAS: Persona[] = [
  {
    intended: 'Connector',
    answers: {
      whatYouDo: 'I run partnerships at a venture firm and spend most of my time connecting our portfolio to the right people.',
      comeToYouFor: 'Introductions. People come to me when they need to meet the exact right person - I can usually name them on the spot.',
      connectionCreated: 'I introduced a founder friend to an angel at a dinner I hosted; they closed a round and now co-run a fund together.',
      flowThrough: 'Founders, investors, journalists, and artists - my world is a switchboard. People are always asking who they should meet.',
      friendDescribe: "The one who introduced half the room to the other half before dinner was served.",
      'referrals.referral1': 'Sarah Chen (member)',
      'referrals.referral2': 'Marcus Webb (member)',
    },
  },
  {
    intended: 'Host',
    answers: {
      whatYouDo: 'I run a small events space and cook for a living, but really I make rooms where people feel taken care of.',
      comeToYouFor: 'Hosting. People come to me to throw the dinner, set the table, and make sure everyone feels welcome.',
      goodCompany: "When the quietest person at the table is laughing and nobody is checking their phone - that's when I know I built the right room.",
      loyalCommunity: 'My supper club - I have hosted a monthly dinner for the same rotating group for eight years; I do all the cooking and the seating.',
      idealSaturday: 'Cooking all afternoon for twelve people, candles, no rush, last guest leaves at 2am.',
      connectionCreated: 'I seat people next to each other on purpose; two friends I sat together started a catering company.',
    },
  },
  {
    intended: 'Curator',
    answers: {
      whatYouDo: 'I am a buyer for a boutique - my whole job is having a point of view about what is worth carrying.',
      detailsRight: 'Tartine in SF - how they laminate their croissants and the exact temperature they serve the cultured butter. Most places get the pastry right and the butter wrong.',
      trustedTaste: 'My old creative director, Lena. She earned it by being right years before anyone else - she called natural wine and Phoebe Philo before the rest of us.',
      recommendForPay: 'A specific knife maker in Sakai, a Lisbon natural wine bar, and one olive oil from Puglia - I evangelize all three.',
      loyalBrands: 'Visvim and Aesop - both obsess over materials and never chase trends, which is the only thing I trust.',
      'recSources.travel': 'a friend who scouts hotels',
      'recSources.food': "a chef's private newsletter",
      'recSources.beauty': 'a niche subreddit',
      'recSources.fashionDesign': 'an archive instagram',
      'recSources.healthWellness': 'my acupuncturist',
    },
  },
  {
    intended: 'Builder',
    answers: {
      whatYouDo: 'I am the founder/CEO of a fintech I started four years ago; we are 40 people and just shipped our v2 platform. I have made payroll through two near-death moments.',
      expertIn: 'Payments infrastructure and the regulatory edge cases around money movement - I have built three of these systems from scratch.',
      comeToYouFor: 'How to actually ship - people come to me when they are stuck between idea and execution and need someone who has done the 0-to-1 grind.',
      investedIn: 'Rebuilding our entire backend this quarter - thousands of hours and most of my savings into the team.',
      obsessedWith: 'Latency. I have become obsessed with shaving milliseconds off our transaction pipeline.',
    },
  },
  {
    intended: 'Maker',
    answers: {
      whatYouDo: 'I am a furniture maker - I design and build commissioned pieces in my own shop, mostly joinery, no screws.',
      creativePursuits: 'I throw ceramics every morning before work and I am building a modular synth from kits - my hands need to be making something or I get restless.',
      obsessedWith: 'Glaze chemistry right now - I mix my own from raw oxides and keep a notebook of fired test tiles.',
      comeToYouFor: 'People bring me things they made for a reaction - they trust I will tell them what is actually good about the craft.',
      scrollStopping: 'Process videos of people making things by hand on instagram - tool marks, raw material, no talking.',
    },
  },
  {
    intended: 'Patron',
    answers: {
      whatYouDo: 'I run a family office and spend most of my time deciding which people and projects deserve early backing.',
      comeToYouFor: 'Capital and access - people come to me when they need someone to back the idea, open a door, or make the call that makes it real.',
      investedIn: "I wrote the first check for a friend's gallery and funded a young chef's first pop-up; I do not need credit, I just like making things possible.",
      connectionCreated: 'I introduced an artist I believe in to the collector who funded her whole next body of work - I made the call, then stepped back.',
      flowThrough: 'Founders and artists who need a first believer with a checkbook tend to find their way to me.',
      'referrals.referral1': 'David Okafor (member)',
    },
  },
];

function topArchetypes(scores: Record<string, number>, n = 3): string {
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${k} ${Math.round(v)}`)
    .join(', ');
}

async function main() {
  const { db } = await import('@/lib/db');
  const { scoreApplication } = await import('@/lib/scoring');

  const target = process.env.SEED_WORKSPACE_ID
    ? await db.workspace.findUnique({ where: { id: process.env.SEED_WORKSPACE_ID } })
    : (await db.workspace.count()) === 1
      ? await db.workspace.findFirst()
      : await db.workspace.findFirst({ where: { name: 'No Bad Company' }, orderBy: { members: { _count: 'desc' } } });

  if (!target) throw new Error('No target workspace found. Set SEED_WORKSPACE_ID.');
  if (target.id === PROD_WS) throw new Error(`Refusing to run validation against the PROD workspace (${PROD_WS}).`);

  console.log(`\nTarget dev workspace: ${target.name} (${target.id})\n`);

  // 1. Seed the scoring template into the target workspace.
  console.log('Seeding scoring template into dev workspace...');
  execSync('node scripts/seed-questions.mjs', {
    env: { ...process.env, SEED_WORKSPACE_ID: target.id },
    stdio: 'inherit',
  });

  // 2. Run each persona through the real scoring path.
  const createdIds: string[] = [];
  const results: { intended: string; got: string; hit: boolean; fallback: boolean; line: string }[] = [];

  for (const p of PERSONAS) {
    const app = await db.application.create({
      data: {
        workspaceId: target.id,
        email: `validate+${p.intended.toLowerCase()}@nobc.test`,
        fullName: `Test ${p.intended}`,
      },
      select: { id: true },
    });
    createdIds.push(app.id);
    await db.applicationAnswer.createMany({
      data: Object.entries(p.answers).map(([questionKey, answer]) => ({ applicationId: app.id, questionKey, answer })),
    });

    const r = await scoreApplication(app.id);
    const hit = r.archetype === p.intended;
    const fallback = r.aiReasoning === 'Automated scoring was unavailable for this application.';
    const line =
      `${hit ? '✓' : '✗'} intended ${p.intended.padEnd(10)} → got ${String(r.archetype).padEnd(10)}` +
      `  worth ${r.memberWorthTotal}` +
      `${fallback ? '  ⚠️ FALLBACK (scoring did not run)' : ''}\n    top: ${topArchetypes(r.archetypeScores)}` +
      `\n    tags: ${r.tags.join(', ')}`;
    results.push({ intended: p.intended, got: String(r.archetype), hit, fallback, line });
    console.log('\n' + line);
  }

  // 3. Cleanup synthetic rows.
  await db.applicationAnswer.deleteMany({ where: { applicationId: { in: createdIds } } });
  await db.application.deleteMany({ where: { id: { in: createdIds } } });

  const hits = results.filter((r) => r.hit).length;
  const fb = results.filter((r) => r.fallback).length;
  console.log(`\n──────────────────────────────────────────`);
  console.log(`Result: ${hits}/${results.length} matched intended archetype${fb ? `  (${fb} fell back — check ANTHROPIC_API_KEY)` : ''}.`);
  console.log(`Synthetic applications cleaned up.\n`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

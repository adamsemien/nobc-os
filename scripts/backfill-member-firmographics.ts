/**
 * Backfill member firmographics (member-intelligence). Enriches existing prod members
 * with FIRMOGRAPHIC fields ONLY, from two sources:
 *   Phase 1 — application extract: AI reads the member's on-brand /apply freetext answers
 *             and extracts { companyName, companyDomain, industry, jobFunction, seniority }.
 *   Phase 2 — email domain heuristic: maps the member's email domain against a hand-seeded
 *             DOMAIN_MAP to fill companyName / companyDomain / industry.
 *
 * SAFETY / FIREWALL:
 *  - ADDITIVE ONLY. A field is written only when its current column value is null or "".
 *    Existing values are never overwritten; Phase 2 never overwrites a Phase 1 write.
 *  - FIRMOGRAPHIC FIELDS ONLY. A hard guard throws if any write key is a firewall
 *    (archetype / archetypeScores / psychographic) key or anything outside the firmographic
 *    whitelist. archetype/psychographic data lives in MemberPsychographics and is never touched.
 *  - PROVENANCE on every write: fieldProvenance[key] = { value, source, confidence, syncedAt }.
 *  - DIRECT Prisma writes only — no flow functions, no emitEvent, no Svix, no email, no
 *    Producer webhook, no wallet. Zero side effects.
 *  - DRY RUN by default — prints what it WOULD write and writes nothing. Pass --execute to write.
 *  - Workspace is chosen by --workspace=<slug>; NEVER defaults to prod. Aborts if missing.
 *
 * INVOCATION:
 *   Dry run:  ./node_modules/.bin/tsx --env-file=.env.local scripts/backfill-member-firmographics.ts --workspace=<slug>
 *   Execute:  ./node_modules/.bin/tsx --env-file=.env.local scripts/backfill-member-firmographics.ts --workspace=<slug> --execute
 *   Options:  [--limit=N] (process only N members)  [--member=<id>] (process one member)
 *
 * NOTE: Phase 1 calls the Anthropic API in BOTH dry-run and execute, so the dry-run preview
 *       reflects the real extraction. Dry-run therefore consumes API tokens.
 */
import { Prisma } from '@prisma/client';
import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { db } from '../lib/db';
import { isReservedKey } from '../lib/member-editable';

// Locked model — every Anthropic call in this repo uses this exact id (see CLAUDE.md).
const EXTRACT_MODEL = 'claude-sonnet-4-20250514';

// The ONLY columns this script may write. Each is a first-class Member scalar column and a
// sponsor-safe firmographic field. Nothing psychographic, nothing identity, nothing computed.
const FIRMOGRAPHIC_FIELDS = [
  'companyName',
  'companyDomain',
  'industry',
  'jobFunction',
  'seniority',
] as const;
type FirmographicField = (typeof FIRMOGRAPHIC_FIELDS)[number];

const SOURCE_APPLICATION = 'application_extract';
const SOURCE_DOMAIN = 'domain_heuristic';
const CONFIDENCE_APPLICATION = 0.65;
const CONFIDENCE_DOMAIN = 0.5;

// ── The 3 on-brand /apply questions that carry firmographic signal ───────────────────────
// Keys are ApplicationAnswer.questionKey values written by the live MembershipForm.tsx form.
// Labels are the exact on-screen prompts — the AI needs them as context to extract reliably.
const APPLICATION_QUESTIONS: { key: string; label: string }[] = [
  {
    key: 'basics.whatYouDo',
    label:
      'Tell us about what you do — your role, industry, company, creative pursuits, passion projects. What keeps you busy?',
  },
  {
    key: 'personality.workingOn',
    label: 'What are you working on right now?',
  },
  {
    key: 'about.whatPeopleComeToYouFor',
    label:
      'What do people consistently come to you for? Could be advice, introductions, recommendations, taste, strategy, opportunities, experiences, or perspective.',
  },
];

// ── DOMAIN_MAP — STARTING POINT, expand me ───────────────────────────────────────────────
// Hand-seeded from the Austin founder / investor / tech context. This is intentionally small;
// the dry-run prints every UNMATCHED domain so Adam can decide what to add here before --execute.
// Key = email domain. companyDomain written = the key itself.
const DOMAIN_MAP: Record<string, { companyName: string; industry: string }> = {
  // Venture / investors
  'sequoiacap.com': { companyName: 'Sequoia Capital', industry: 'Venture Capital' },
  'a16z.com': { companyName: 'Andreessen Horowitz', industry: 'Venture Capital' },
  'ycombinator.com': { companyName: 'Y Combinator', industry: 'Venture Capital' },
  'firstround.com': { companyName: 'First Round Capital', industry: 'Venture Capital' },
  'accel.com': { companyName: 'Accel', industry: 'Venture Capital' },
  // Fintech / crypto
  'stripe.com': { companyName: 'Stripe', industry: 'Fintech' },
  'coinbase.com': { companyName: 'Coinbase', industry: 'Crypto & Fintech' },
  // Big tech
  'google.com': { companyName: 'Google', industry: 'Technology' },
  'meta.com': { companyName: 'Meta', industry: 'Technology' },
  'apple.com': { companyName: 'Apple', industry: 'Technology' },
  'microsoft.com': { companyName: 'Microsoft', industry: 'Technology' },
  'amazon.com': { companyName: 'Amazon', industry: 'Technology' },
  'linkedin.com': { companyName: 'LinkedIn', industry: 'Technology' },
  // AI
  'openai.com': { companyName: 'OpenAI', industry: 'Artificial Intelligence' },
  'anthropic.com': { companyName: 'Anthropic', industry: 'Artificial Intelligence' },
  // Austin-HQ tech
  'oracle.com': { companyName: 'Oracle', industry: 'Enterprise Software' },
  'dell.com': { companyName: 'Dell Technologies', industry: 'Technology' },
  'indeed.com': { companyName: 'Indeed', industry: 'HR Technology' },
  'tesla.com': { companyName: 'Tesla', industry: 'Automotive & Energy' },
  // Software / design
  'figma.com': { companyName: 'Figma', industry: 'Design Software' },
  'notion.so': { companyName: 'Notion', industry: 'Software' },
  'atlassian.com': { companyName: 'Atlassian', industry: 'Software' },
};

// Personal-email providers carry no firmographic signal — skipped, and never reported as an
// unknown company domain (no point asking Adam to map gmail.com).
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'hey.com',
  'fastmail.com',
]);

// ── CLI flags ────────────────────────────────────────────────────────────────────────────
function flagValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}
const WORKSPACE_SLUG = flagValue('workspace');
const EXECUTE = process.argv.includes('--execute');
const LIMIT = flagValue('limit') ? Number(flagValue('limit')) : undefined;
const MEMBER_ID = flagValue('member');

if (!WORKSPACE_SLUG) {
  console.error(
    '--workspace=<slug> is required — refusing to run (never defaults to the prod workspace).\n' +
      '  Dry run: ./node_modules/.bin/tsx --env-file=.env.local scripts/backfill-member-firmographics.ts --workspace=<slug>',
  );
  process.exit(1);
}
if (LIMIT !== undefined && (!Number.isFinite(LIMIT) || LIMIT <= 0)) {
  console.error('--limit must be a positive integer.');
  process.exit(1);
}

// ── Types ────────────────────────────────────────────────────────────────────────────────
interface Candidate {
  field: FirmographicField;
  value: string;
  source: typeof SOURCE_APPLICATION | typeof SOURCE_DOMAIN;
  confidence: number;
}
interface ProvenanceRecord {
  value: unknown;
  source: string;
  confidence: number;
  syncedAt: string;
}

// ── Firewall guard ───────────────────────────────────────────────────────────────────────
// Hard-reject: throws if any proposed write key is a reserved/firewall key or is anything
// outside the firmographic whitelist. Called before EVERY write payload is built.
function assertFirmographicOnly(keys: string[]): void {
  for (const key of keys) {
    if (isReservedKey(key)) {
      throw new Error(`FIREWALL VIOLATION: refusing to write firewalled (psychographic) key "${key}"`);
    }
    if (!(FIRMOGRAPHIC_FIELDS as readonly string[]).includes(key)) {
      throw new Error(`FIREWALL VIOLATION: "${key}" is not an allowed firmographic field`);
    }
  }
}

function nonEmpty(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

// ── Phase 1: application extract ─────────────────────────────────────────────────────────
const extractSchema = z.object({
  companyName: z.string().nullable(),
  companyDomain: z.string().nullable(),
  industry: z.string().nullable(),
  jobFunction: z.string().nullable(),
  seniority: z.string().nullable(),
});

async function extractFromApplication(
  answersByKey: Record<string, string>,
): Promise<Partial<Record<FirmographicField, string>>> {
  const blob = APPLICATION_QUESTIONS.map((q) => {
    const a = answersByKey[q.key];
    return nonEmpty(a) ? `Q: ${q.label}\nA: ${a.trim()}` : null;
  })
    .filter((x): x is string => x !== null)
    .join('\n\n');

  if (!blob) return {};

  const prompt = `Extract firmographic facts about this person from their membership application answers.
Only extract what is explicitly stated or strongly implied. Use null for anything not present — do NOT guess.

${blob}

Return:
- companyName: the company or organization they work for or founded (null if unclear)
- companyDomain: that company's website domain only if stated, e.g. "stripe.com" (else null)
- industry: their industry or sector, e.g. "Fintech", "Hospitality", "Venture Capital" (else null)
- jobFunction: their role or function, e.g. "Founder", "Engineering", "Marketing" (else null)
- seniority: their seniority level, e.g. "Founder", "C-Suite", "Senior", "Mid-level" (else null)`;

  const { object } = await generateObject({
    model: anthropic(EXTRACT_MODEL),
    schema: extractSchema,
    prompt,
  });

  const out: Partial<Record<FirmographicField, string>> = {};
  for (const field of FIRMOGRAPHIC_FIELDS) {
    const v = object[field];
    if (nonEmpty(v)) out[field] = v.trim();
  }
  return out;
}

// ── Phase 2: email domain heuristic ──────────────────────────────────────────────────────
function domainOf(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain || null;
}

// ── Run ──────────────────────────────────────────────────────────────────────────────────
(async () => {
  const workspace = await db.workspace.findUnique({
    where: { slug: WORKSPACE_SLUG },
    select: { id: true, slug: true },
  });
  if (!workspace) {
    console.error(`Workspace slug "${WORKSPACE_SLUG}" not found in this database.`);
    process.exit(1);
  }

  const aiEnabled = Boolean(process.env.ANTHROPIC_API_KEY);
  if (!aiEnabled) {
    console.warn('[warn] ANTHROPIC_API_KEY not set — Phase 1 (application extract) will be skipped.\n');
  }

  const members = await db.member.findMany({
    where: {
      workspaceId: workspace.id,
      ...(MEMBER_ID ? { id: MEMBER_ID } : {}),
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      companyName: true,
      companyDomain: true,
      industry: true,
      jobFunction: true,
      seniority: true,
      fieldProvenance: true,
    },
    orderBy: { createdAt: 'asc' },
    ...(MEMBER_ID ? {} : LIMIT ? { take: LIMIT } : {}),
  });

  console.log(`Workspace: ${workspace.slug} (${workspace.id})`);
  console.log(`Members:   ${members.length}${MEMBER_ID ? ` (single --member=${MEMBER_ID})` : LIMIT ? ` (--limit=${LIMIT})` : ''}`);
  console.log(EXECUTE ? 'MODE:      EXECUTE (writing)\n' : 'MODE:      DRY RUN (no writes — pass --execute to write)\n');

  let updatedCount = 0;
  let fieldsWritten = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const unknownDomains = new Map<string, number>();

  for (const member of members) {
    const name = `${member.firstName} ${member.lastName}`.trim() || '(no name)';
    const current: Record<FirmographicField, string | null> = {
      companyName: member.companyName,
      companyDomain: member.companyDomain,
      industry: member.industry,
      jobFunction: member.jobFunction,
      seniority: member.seniority,
    };

    // Gather candidates, Phase 1 first (higher confidence + priority).
    const candidates: Candidate[] = [];

    try {
      // Phase 1 — application extract.
      if (aiEnabled) {
        const application = await db.application.findFirst({
          where: { workspaceId: workspace.id, email: member.email },
          orderBy: { createdAt: 'desc' },
          select: { answers: { select: { questionKey: true, answer: true } } },
        });
        if (application && application.answers.length > 0) {
          const answersByKey: Record<string, string> = {};
          for (const a of application.answers) answersByKey[a.questionKey] = a.answer;
          const extracted = await extractFromApplication(answersByKey);
          for (const field of FIRMOGRAPHIC_FIELDS) {
            const v = extracted[field];
            if (nonEmpty(v)) {
              candidates.push({ field, value: v, source: SOURCE_APPLICATION, confidence: CONFIDENCE_APPLICATION });
            }
          }
        }
      }

      // Phase 2 — email domain heuristic.
      const domain = domainOf(member.email);
      if (domain && !FREE_EMAIL_DOMAINS.has(domain)) {
        const match = DOMAIN_MAP[domain];
        if (match) {
          candidates.push({ field: 'companyName', value: match.companyName, source: SOURCE_DOMAIN, confidence: CONFIDENCE_DOMAIN });
          candidates.push({ field: 'companyDomain', value: domain, source: SOURCE_DOMAIN, confidence: CONFIDENCE_DOMAIN });
          candidates.push({ field: 'industry', value: match.industry, source: SOURCE_DOMAIN, confidence: CONFIDENCE_DOMAIN });
        } else {
          unknownDomains.set(domain, (unknownDomains.get(domain) ?? 0) + 1);
        }
      }
    } catch (err) {
      errorCount += 1;
      console.log(`[ERROR]  ${name} (${member.email}) — ${err instanceof Error ? err.message : String(err)} — skipped`);
      continue;
    }

    // Resolve candidates against current values (additive-only). First candidate per field
    // that lands on an empty column wins; everything else is a SKIP.
    const writes: Record<string, Candidate> = {};
    const skipLines: string[] = [];
    for (const cand of candidates) {
      if (writes[cand.field]) {
        skipLines.push(`    ${cand.field}: "${cand.value}"  [SKIP — ${writes[cand.field].source} already proposed]`);
        skippedCount += 1;
      } else if (nonEmpty(current[cand.field])) {
        skipLines.push(`    ${cand.field}: "${current[cand.field]}"  [SKIP — already set]`);
        skippedCount += 1;
      } else {
        writes[cand.field] = cand;
      }
    }

    const writeKeys = Object.keys(writes);
    // Firewall guard — fail-fast even in dry-run.
    assertFirmographicOnly(writeKeys);

    if (writeKeys.length === 0 && skipLines.length === 0) {
      continue; // nothing to report for this member
    }

    console.log(`[${EXECUTE ? 'WRITING' : 'DRY RUN'}] ${name} (${member.email})`);
    for (const key of writeKeys) {
      const w = writes[key];
      console.log(`    ${key}: "" → "${w.value}"  [${w.source}, ${w.confidence}]`);
    }
    for (const line of skipLines) console.log(line);

    if (writeKeys.length === 0) continue;

    if (EXECUTE) {
      try {
        const syncedAt = new Date().toISOString();
        const columnData: Record<string, unknown> = {};
        const fieldProvenance: Record<string, unknown> = {
          ...((member.fieldProvenance as Record<string, unknown> | null) ?? {}),
        };
        for (const key of writeKeys) {
          const w = writes[key];
          columnData[key] = w.value;
          const rec: ProvenanceRecord = { value: w.value, source: w.source, confidence: w.confidence, syncedAt };
          fieldProvenance[key] = rec;
        }
        await db.$transaction(async (tx) => {
          await tx.member.update({
            where: { id: member.id },
            data: {
              ...columnData,
              fieldProvenance: fieldProvenance as Prisma.InputJsonValue,
            },
          });
        });
        updatedCount += 1;
        fieldsWritten += writeKeys.length;
      } catch (err) {
        errorCount += 1;
        console.log(`    [ERROR] write failed — ${err instanceof Error ? err.message : String(err)} — skipped`);
      }
    } else {
      // Dry-run: count what WOULD be written.
      updatedCount += 1;
      fieldsWritten += writeKeys.length;
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────');
  console.log(`Members processed:        ${members.length}`);
  console.log(`Members ${EXECUTE ? 'updated' : 'to update'}:  ${updatedCount}`);
  console.log(`Fields ${EXECUTE ? 'written' : 'to write'}:    ${fieldsWritten}`);
  console.log(`Skipped (already set):    ${skippedCount}`);
  console.log(`Errors:                   ${errorCount}`);
  const unknownList = [...unknownDomains.entries()].sort((a, b) => b[1] - a[1]);
  if (unknownList.length > 0) {
    console.log(`Unknown domains (expand DOMAIN_MAP): ${unknownList.map(([d, n]) => `${d} (${n})`).join(', ')}`);
  } else {
    console.log('Unknown domains (expand DOMAIN_MAP): none');
  }
  if (!EXECUTE) console.log('\nDry run complete. Re-run with --execute to write.');

  await db.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});

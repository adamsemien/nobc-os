/**
 * Demo seed for the PR3 member record page (Slice 1 visual review). Populates ONE demo
 * member (Celia Moss) — CREATING the member + a seed Application if absent — with realistic
 * dimension values, a multi-day engagement timeline (F2), and custom fields stamped with ALL
 * FIVE provenance sources (F3), so the read experience can be reviewed against real data
 * instead of empty states. This is a one-off smoke-test seed; journey-consistent multi-persona
 * seeding lives in the (separate, not-yet-built) scripts/demo-seed/ module.
 *
 * A freshly minted dev workspace (first localhost sign-in with Clerk dev keys) is empty, so the
 * member is created here directly; an enriched workspace simply has its existing Celia updated.
 *
 * SAFETY:
 *  - Target workspace is selected by slug via DEMO_SEED_WORKSPACE_SLUG (REQUIRED; never
 *    defaults to the prod workspace). The demo member is located/created WITHIN that workspace
 *    by email.
 *  - FIND-OR-CREATE + idempotent: a missing member is created via a DIRECT Prisma write (never
 *    the live apply/approve flow), so it fires ZERO side effects — no email, Svix, Producer
 *    webhook, or wallet call, and no suppressSideEffects flag is needed. Re-running --execute
 *    never duplicates the member, the Application, or the engagement events.
 *  - The created member/Application mirror prod Celia so the render + firewall behave
 *    identically, but with a fresh id, the dev workspaceId, and a SYNTHETIC clerkUserId (never
 *    a real Clerk id). No archetype is written to any operator-visible surface.
 *  - Dry-run by default — prints what it WOULD do and writes nothing. Pass --execute to write.
 *  - Engagement events are tagged metadata.demo=true and skipped if already present.
 *  - Dimension columns + customFields/fieldProvenance are set via the SAME applyFieldWrites
 *    stamping the PATCH route uses, so provenance is identical to production.
 *  - Touches ONLY the chosen member, their seed Application, and their engagement events. No
 *    schema changes.
 *
 *    Dry run:  DEMO_SEED_WORKSPACE_SLUG=<slug> ./node_modules/.bin/tsx --env-file=.env.local scripts/seed-member-record-demo.ts
 *    Execute:  DEMO_SEED_WORKSPACE_SLUG=<slug> ./node_modules/.bin/tsx --env-file=.env.local scripts/seed-member-record-demo.ts --execute
 */
import { Prisma, type MemberEngagementEventType } from '@prisma/client';
import { db } from '../lib/db';
import { generateMemberQrCode } from '../lib/member-qr';
import { applyFieldWrites, type FieldWrite } from '../lib/member-provenance';

// Target workspace is chosen by slug — NEVER defaults to prod. With dev Clerk keys, first
// sign-in mints a fresh empty workspace; pass that workspace's slug so the demo lands where
// the dev session resolves. The demo member is located within that workspace by email.
const WORKSPACE_SLUG = process.env.DEMO_SEED_WORKSPACE_SLUG;
const DEMO_EMAIL = 'celia.moss.demo@nobadco.dev';
const EXECUTE = process.argv.includes('--execute');

if (!WORKSPACE_SLUG) {
  console.error(
    'DEMO_SEED_WORKSPACE_SLUG is not set — refusing to run (never defaults to the prod workspace).\n' +
      '  Run: DEMO_SEED_WORKSPACE_SLUG=<workspace-slug> ./node_modules/.bin/tsx --env-file=.env.local scripts/seed-member-record-demo.ts --execute',
  );
  process.exit(1);
}

const DIMENSIONS = {
  companyName: 'Atelier Nine',
  companyDomain: 'ateliernine.co',
  jobFunction: 'Founder',
  seniority: 'C-Suite',
  industry: 'Fashion & Design',
  city: 'New York',
  country: 'United States',
  linkedinUrl: 'https://www.linkedin.com/in/celia-moss',
  instagram: 'celia.moss',
  aiSummary:
    'Consistent high-energy attendee and a strong connector across the fashion and design community.',
};

// customFields → one per provenance source, so F3 renders every badge style.
const FIELD_WRITES: Record<string, FieldWrite> = {
  dietaryPreference: { value: 'Pescatarian', source: 'self_reported' },
  vibe: { value: 'High-energy connector', source: 'operator_entered' },
  estimatedSeniority: { value: 'Senior', source: 'ai_inferred', confidence: 0.78 },
  companyHeadcount: { value: '11-50', source: 'verified_enrichment' },
  producerTier: { value: 'Gold', source: 'producer' },
};

const DAY = 86_400_000;
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * DAY);
}

// Multi-day feed spanning every tone (positive / negative / neutral / info).
const EVENTS: Array<{ eventType: MemberEngagementEventType; occurredAt: Date }> = [
  { eventType: 'checked_in', occurredAt: daysAgo(2) },
  { eventType: 'rsvp_confirmed', occurredAt: daysAgo(2) },
  { eventType: 'ticket_purchased', occurredAt: daysAgo(5) },
  { eventType: 'rsvp_cancelled', occurredAt: daysAgo(5) },
  { eventType: 'newsletter_opened', occurredAt: daysAgo(5) },
  { eventType: 'application_approved', occurredAt: daysAgo(12) },
  { eventType: 'referral_made', occurredAt: daysAgo(12) },
  { eventType: 'guest_created', occurredAt: daysAgo(20) },
  { eventType: 'enrichment_synced', occurredAt: daysAgo(20) },
];

// Synthetic identity for the CREATE path. Mirrors prod Celia's `applicant:` clerkUserId
// pattern but is NOT a real Clerk id; deterministic so re-runs resolve the same member and the
// (workspaceId, clerkUserId) unique constraint never collides across re-runs.
const DEMO_CLERK_USER_ID = 'applicant:demo-celia-moss';

// Member skeleton (DIRECT write — never the apply/approve flow). Dimensions, customFields, and
// provenance are filled by the enrichment step below, so the skeleton carries only the
// identity/status fields enrichment does not touch.
const MEMBER_CREATE = { firstName: 'Celia', lastName: 'Moss', phone: '+15124440013' } as const;

// Seed Application — the ONLY source of the Assessment card (assembleMemberRecord matches the
// latest Application by email and reads aiScore/aiReasoning/aiRecommendation). archetype +
// archetypeScores are DELIBERATELY omitted — psychographic, kept off every operator surface.
const APPLICATION_CREATE = {
  fullName: 'Celia Moss',
  phone: '+15124440013',
  city: 'Brooklyn',
  neighborhood: 'Williamsburg',
  reviewNote: 'Demo seed — pre-approved for Slice 1 review.',
  aiScore: 0.85,
  aiReasoning:
    'Tastemaker with real public-facing influence. Genuine signal in her work, not just her following.',
} as const;

(async () => {
  const workspace = await db.workspace.findUnique({
    where: { slug: WORKSPACE_SLUG },
    select: { id: true, slug: true },
  });
  if (!workspace) {
    console.error(`Workspace slug "${WORKSPACE_SLUG}" not found in this database.`);
    process.exit(1);
  }

  let member = await db.member.findFirst({
    where: { workspaceId: workspace.id, email: DEMO_EMAIL },
    select: { id: true, firstName: true, lastName: true, workspaceId: true, customFields: true, fieldProvenance: true },
  });
  const existingApp = await db.application.findFirst({
    where: { workspaceId: workspace.id, email: DEMO_EMAIL },
    select: { id: true },
  });

  console.log(`Workspace:   ${workspace.slug} (${workspace.id})`);
  console.log(`Member:      ${member ? `found ${member.id} → enrich` : 'NOT FOUND → create (direct write)'}`);
  console.log(`Application: ${existingApp ? `found ${existingApp.id} → leave as-is` : 'NOT FOUND → create (Assessment card source)'}`);
  console.log(EXECUTE ? '\nMODE: EXECUTE (writing)\n' : '\nMODE: DRY RUN (no writes — pass --execute to write)\n');

  console.log(`Dimensions → ${Object.keys(DIMENSIONS).join(', ')}`);
  console.log(`Custom fields (with provenance) → ${Object.entries(FIELD_WRITES).map(([k, w]) => `${k}:${w.source}`).join(', ')}`);
  console.log(
    `Engagement events → ${EVENTS.length} across ${new Set(EVENTS.map((e) => e.occurredAt.toISOString().slice(0, 10))).size} days (skipped if already seeded)`,
  );

  if (!EXECUTE) {
    console.log('\nDry run complete. Re-run with --execute to write.');
    console.log(`Workspace: ${workspace.slug}`);
    console.log(`Member id: ${member ? member.id : '(new — created on --execute)'}`);
    console.log(`Record:    ${member ? `/operator/members/${member.id}` : '/operator/members/<created on --execute>'}`);
    await db.$disconnect();
    return;
  }

  // --- EXECUTE: DIRECT Prisma writes only. Never resolveMember / approveApplication / the
  // reject helper / emitEvent — so this fires ZERO side effects (no email, Svix, Producer
  // webhook, or wallet) and needs no suppressSideEffects flag. ---
  if (!member) {
    member = await db.member.create({
      data: {
        workspaceId: workspace.id,
        clerkUserId: DEMO_CLERK_USER_ID,
        email: DEMO_EMAIL,
        firstName: MEMBER_CREATE.firstName,
        lastName: MEMBER_CREATE.lastName,
        phone: MEMBER_CREATE.phone,
        status: 'APPROVED',
        approved: true,
        approvedAt: new Date(),
        memberQrCode: generateMemberQrCode(),
      },
      select: { id: true, firstName: true, lastName: true, workspaceId: true, customFields: true, fieldProvenance: true },
    });
    console.log(`Created member ${member.id} (synthetic clerkUserId ${DEMO_CLERK_USER_ID})`);
  }

  if (!existingApp) {
    const app = await db.application.create({
      data: {
        workspaceId: workspace.id,
        memberId: member.id,
        email: DEMO_EMAIL,
        fullName: APPLICATION_CREATE.fullName,
        phone: APPLICATION_CREATE.phone,
        city: APPLICATION_CREATE.city,
        neighborhood: APPLICATION_CREATE.neighborhood,
        consentEmail: true,
        consentSms: true,
        status: 'APPROVED',
        reviewedAt: new Date(),
        reviewNote: APPLICATION_CREATE.reviewNote,
        aiTags: ['__demo'],
        aiScore: APPLICATION_CREATE.aiScore,
        aiRecommendation: 'yes',
        aiReasoning: APPLICATION_CREATE.aiReasoning,
        // archetype + archetypeScores deliberately omitted — kept off every operator surface.
      },
      select: { id: true },
    });
    console.log(`Created application ${app.id} (Assessment: recommendation "yes", score 0.85)`);
  }

  const syncedAt = new Date().toISOString();
  const { customFields, fieldProvenance } = applyFieldWrites({
    customFields: member.customFields as Record<string, unknown> | null,
    fieldProvenance: member.fieldProvenance as Record<string, unknown> | null,
    writes: FIELD_WRITES,
    syncedAt,
  });

  await db.member.update({
    where: { id: member.id },
    data: {
      ...DIMENSIONS,
      customFields: customFields as Prisma.InputJsonValue,
      fieldProvenance: fieldProvenance as Prisma.InputJsonValue,
    },
  });

  const existingDemo = await db.memberEngagementEvent.count({
    where: { memberId: member.id, metadata: { path: ['demo'], equals: true } },
  });
  if (existingDemo === 0) {
    await db.memberEngagementEvent.createMany({
      data: EVENTS.map((e) => ({
        workspaceId: member.workspaceId,
        memberId: member.id,
        eventType: e.eventType,
        occurredAt: e.occurredAt,
        metadata: { demo: true } as Prisma.InputJsonValue,
      })),
    });
    console.log(`Inserted ${EVENTS.length} engagement events`);
  } else {
    console.log(`Engagement events already seeded (${existingDemo} demo rows) — skipped`);
  }

  console.log('\nDone. Reload the member record page to review F1/F2/F3.');
  console.log(`Workspace: ${workspace.slug}`);
  console.log(`Member id: ${member.id}`);
  console.log(`Record:    /operator/members/${member.id}`);
  await db.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

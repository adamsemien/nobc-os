/**
 * Seed a self-contained demo event + sponsor brief and generate a real Activation Recap.
 *
 * Drives the full pipeline (metrics → equivalent media value → Haiku narrative → @react-pdf
 * render → R2 upload → GeneratedAsset magic link) so the output is the genuine sponsor-facing
 * artifact, not a mock. All demo rows are tagged '__demo_recap' (and '__demo') and scoped to a
 * fixed demo event slug, so they are easy to remove.
 *
 *   npx tsx scripts/seed-sponsor-recap.ts                 # seed + generate, print copy + URL
 *   npx tsx scripts/seed-sponsor-recap.ts --clean         # remove the demo rows
 *   npx tsx scripts/seed-sponsor-recap.ts --workspace=ID  # target a specific workspace
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { writeFileSync } from 'node:fs';
import * as React from 'react';

// The PDF modules (lib/pdf/*.tsx) target Next's automatic JSX runtime, so they don't import
// React. Under tsx the classic transform emits `React.createElement`, so expose React globally
// for this dev script only — production (Next) keeps the automatic runtime untouched.
(globalThis as { React?: typeof React }).React = React;

const CLEAN = process.argv.includes('--clean');
const WS_ARG = process.argv.find((a) => a.startsWith('--workspace='))?.split('=')[1];

const DEMO_SLUG = 'demo-sponsor-intelligence';
const DEMO_TAG = '__demo_recap';
const SPONSOR_NAME = 'Aesop';
const N = 28;

const FIRST = ['Maya', 'Daniel', 'Priya', 'Marcus', 'Sofia', 'Liam', 'Amara', 'Noah', 'Yuki', 'Diego', 'Zoe', 'Omar', 'Ines', 'Theo', 'Lena', 'Ravi', 'Nina', 'Caleb', 'Aisha', 'Ezra', 'Mira', 'Jonah', 'Talia', 'Felix', 'Rosa', 'Soren', 'Iris', 'Hugo'];
const LAST = ['Okafor', 'Reyes', 'Sharma', 'Bennett', 'Russo', 'Walsh', 'Diallo', 'Kim', 'Tanaka', 'Castro', 'Lund', 'Haddad', 'Moreau', 'Vance', 'Berg', 'Nair', 'Pavel', 'Shaw', 'Bello', 'Stein', 'Frost', 'Marsh', 'Cohen', 'Adler', 'Ortiz', 'Dahl', 'Wren', 'Vogel'];
const CITY = ['Austin', 'Austin', 'Austin', 'Austin', 'Dallas', 'Houston', 'San Francisco', 'New York'];
const INDUSTRY = ['Technology', 'Venture Capital', 'Hospitality', 'Creative & Design', 'Finance', 'Real Estate'];

function archetypeFor(i: number): string {
  if (i < 9) return 'Patron'; // → Founder tier
  if (i < 18) return 'Builder'; // → Operator tier
  if (i < 22) return 'Curator'; // → Tastemaker
  if (i < 25) return 'Maker'; // → Creator
  if (i < 27) return 'Connector';
  return 'Host';
}
function seniorityFor(arch: string, i: number): string {
  if (arch === 'Patron') return i % 2 === 0 ? 'Founder/CEO' : 'C-Suite';
  if (arch === 'Builder') return i % 2 === 0 ? 'Founder/CEO' : 'VP';
  if (arch === 'Curator') return 'Director';
  return 'Senior';
}
function companyFor(i: number): string {
  return ['1-10', '11-50', '51-200', '201-1000', '1000+'][i % 5];
}

async function main(): Promise<void> {
  const { db } = await import('@/lib/db');

  const ws = WS_ARG
    ? await db.workspace.findUnique({ where: { id: WS_ARG } })
    : await db.workspace.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!ws) throw new Error('No workspace found to attach the demo to.');
  const workspaceId = ws.id;
  console.log(`Workspace: ${ws.name} (${workspaceId})`);

  // ── cleanup (also runs at the start of a seed for idempotency) ───────────────
  async function cleanup(): Promise<void> {
    const ev = await db.event.findFirst({ where: { workspaceId, slug: DEMO_SLUG }, select: { id: true } });
    if (ev) {
      await db.surveyResponse.deleteMany({ where: { workspaceId, eventId: ev.id } });
      await db.rSVP.deleteMany({ where: { workspaceId, eventId: ev.id } });
    }
    const demoMembers = await db.member.findMany({ where: { workspaceId, tags: { has: DEMO_TAG } }, select: { email: true } });
    const emails = demoMembers.map((m) => m.email);
    if (emails.length) await db.application.deleteMany({ where: { workspaceId, email: { in: emails } } });
    await db.member.deleteMany({ where: { workspaceId, tags: { has: DEMO_TAG } } });
  }

  if (CLEAN) {
    await cleanup();
    console.log('Removed demo recap rows (members, applications, RSVPs). Event + sponsor + generated assets left intact.');
    await db.$disconnect();
    return;
  }

  await cleanup();

  // ── demo event (completed, two weeks ago) ────────────────────────────────────
  const startAt = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const event = await db.event.upsert({
    where: { workspaceId_slug: { workspaceId, slug: DEMO_SLUG } },
    update: { title: 'The Founders Table — An Evening with Aesop', startAt, status: 'PUBLISHED', location: 'A private residence, West Austin' },
    create: {
      workspaceId,
      slug: DEMO_SLUG,
      title: 'The Founders Table — An Evening with Aesop',
      startAt,
      location: 'A private residence, West Austin',
      status: 'PUBLISHED',
      accessMode: 'TICKETED',
    },
    select: { id: true, title: true },
  });

  // ── demo sponsor brief ───────────────────────────────────────────────────────
  const existingSponsor = await db.sponsorBrandProfile.findFirst({ where: { workspaceId, name: SPONSOR_NAME }, select: { id: true } });
  const persona = { archetypes: ['Founder', 'Operator'], seniority: ['Founder/CEO', 'C-Suite', 'VP'], industries: ['Technology', 'Venture Capital'] };
  const sponsorData = {
    declaredObjectives:
      'Brand affinity and awareness, with strong activation on the night — we want the right founders and operators in the room and leaving with a feeling about Aesop.',
    targetPersonaCriteria: persona,
    rightsFeeCents: 5_000_000, // $50,000
    category: 'Beauty & Wellness',
  };
  const sponsor = existingSponsor
    ? await db.sponsorBrandProfile.update({ where: { id: existingSponsor.id }, data: sponsorData, select: { id: true } })
    : await db.sponsorBrandProfile.create({ data: { workspaceId, name: SPONSOR_NAME, ...sponsorData }, select: { id: true } });

  // ── demo members + applications + RSVPs ──────────────────────────────────────
  let attended = 0;
  const attendees: { memberId: string; checkedIn: boolean }[] = [];
  for (let i = 0; i < N; i++) {
    const arch = archetypeFor(i);
    const email = `demo+recap-${i}@nobc.demo`;
    const isGuest = i % 7 === 0; // ~4 guests
    const isComp = i % 9 === 0; // ~3-4 comps
    const checkedIn = i % 10 < 8; // ~80% show rate
    if (checkedIn) attended++;
    const fullName = `${FIRST[i]} ${LAST[i]}`;

    const member = await db.member.create({
      data: {
        workspaceId,
        clerkUserId: `demo_recap_${i}`,
        email,
        firstName: FIRST[i],
        lastName: LAST[i],
        // Non-guests are PENDING (not APPROVED) so this demo never inflates the real
        // tenant's approved-member counts; the recap still buckets them as Member Access.
        status: isGuest ? 'GUEST' : 'PENDING',
        approved: false,
        tags: ['__demo', DEMO_TAG],
        industry: INDUSTRY[i % INDUSTRY.length],
        seniority: seniorityFor(arch, i),
        companySize: companyFor(i),
      },
      select: { id: true },
    });

    await db.application.create({
      data: {
        workspaceId,
        email,
        fullName,
        status: 'APPROVED',
        archetype: arch,
        city: CITY[i % CITY.length],
      },
    });

    await db.rSVP.create({
      data: {
        workspaceId,
        eventId: event.id,
        memberId: member.id,
        status: 'CONFIRMED',
        ticketStatus: 'confirmed',
        checkedIn,
        checkedInAt: checkedIn ? startAt : null,
        isComp,
        compType: isComp ? 'host_comp' : null,
        guestEmail: isGuest ? email : null,
        guestName: isGuest ? fullName : null,
      },
    });
    attendees.push({ memberId: member.id, checkedIn });
  }
  console.log(`Seeded ${N} members/applications/RSVPs · ${attended} checked in.`);

  // ── demo brand-lift survey responses (PRE baseline + POST) ───────────────────
  const checkedInAttendees = attendees.filter((a) => a.checkedIn);
  const QUOTES = [
    "I came for the dinner and left with two introductions I'll be following up on Monday.",
    'The small touches — the Aesop wash in the bathroom — said everything about the taste in the room.',
    "Easily the most considered evening I've been to in Austin this year.",
  ];
  let surveyCount = 0;
  for (let i = 0; i < checkedInAttendees.length; i++) {
    const { memberId } = checkedInAttendees[i];
    await db.surveyResponse.create({
      data: {
        workspaceId,
        eventId: event.id,
        sponsorBrandId: sponsor.id,
        memberId,
        phase: 'PRE',
        answers: { awareness: [3, 4, 2, 4, 3][i % 5], consideration: [2, 4, 3, 4, 2][i % 5] },
        submittedAt: startAt,
      },
    });
    await db.surveyResponse.create({
      data: {
        workspaceId,
        eventId: event.id,
        sponsorBrandId: sponsor.id,
        memberId,
        phase: 'POST',
        answers: {
          awareness: [4, 5, 4, 3, 5][i % 5],
          consideration: [4, 4, 5, 3, 4][i % 5],
          recall: i % 6 === 0 ? 'no' : 'yes',
          nps: [9, 10, 9, 8, 10, 9][i % 6],
          conversation_quality: i % 5 === 0 ? 4 : 5,
          ...(i < QUOTES.length ? { quote: QUOTES[i] } : {}),
        },
        submittedAt: startAt,
      },
    });
    surveyCount += 2;
  }
  console.log(`Seeded ${surveyCount} survey responses (${checkedInAttendees.length} PRE+POST pairs).`);

  // ── generate the recap (the real pipeline) ───────────────────────────────────
  const { generateAndStoreRecap } = await import('@/lib/intelligence/recap-delivery');
  const { renderRecapPdf } = await import('@/lib/pdf/render');

  const t0 = Date.now();
  const result = await generateAndStoreRecap({
    workspaceId,
    eventId: event.id,
    sponsorBrandId: sponsor.id,
    ownedImpressions: 120_000,
    earnedImpressions: 380_000,
    generatedBySession: 'seed-script',
  });
  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  const p = result.payload;

  // local copy for visual inspection
  try {
    const pdf = await renderRecapPdf(p);
    writeFileSync('/tmp/sponsor-recap-demo.pdf', pdf);
    console.log(`\nPDF written to /tmp/sponsor-recap-demo.pdf (${(pdf.length / 1024).toFixed(0)} KB)`);
  } catch (e) {
    console.error('local PDF write failed:', e);
  }

  const line = '─'.repeat(78);
  console.log(`\n${line}\nGENERATED in ${seconds}s · storage configured: ${result.storageConfigured}`);
  console.log(`Magic link: ${result.url}`);
  console.log(`GeneratedAsset: ${result.generatedAssetId} · Snapshot: ${result.snapshotId}\n${line}`);

  console.log(`\nEVENT: ${p.event.name} — ${p.event.dateLabel}${p.event.venue ? ` · ${p.event.venue}` : ''}`);
  console.log(`SPONSOR: ${p.sponsor.name}`);
  console.log(`ATTENDED ${p.audience.attended} of ${p.audience.registered} · influence ${p.audience.aggregateInfluenceScore}/100 · exec mix ${Math.round(p.audience.qualifiedExecMix * 100)}%`);

  console.log(`\n=== COVER STANDFIRST ===\n${p.narrative.coverStandfirst}`);

  console.log(`\n=== OBJECTIVES (declared) ===`);
  for (const o of p.objectives.filter((x) => x.declared)) {
    console.log(`\n• ${o.objective} — [${o.status}]\n  ${o.headline}\n  What this means: ${o.whatThisMeans}\n  Benchmark: ${o.benchmark}`);
  }

  console.log(`\n=== HERO STATS ===`);
  for (const h of p.heroStats) {
    console.log(`\n  ${h.value}  ${h.label}\n  ${h.whatThisMeans}\n  (${h.benchmark})`);
  }

  console.log(`\n=== EQUIVALENT MEDIA VALUE ===`);
  for (const t of p.mediaValue.tiers) {
    const hl = t.tier === 'typical' ? ' (HEADLINE)' : '';
    console.log(`\n  ${t.label}${hl}: $${(t.totalCents / 100).toLocaleString()}  [audience $${(t.audienceValueCents / 100).toLocaleString()} + impressions $${(t.impressionValueCents / 100).toLocaleString()}]\n  ${t.methodology}`);
  }
  if (p.mediaValue.valueVsFeeMultiple != null) {
    console.log(`\n  Value vs rights fee: ${p.mediaValue.valueVsFeeMultiple}× ($${((p.mediaValue.rightsFeeCents ?? 0) / 100).toLocaleString()} fee)`);
  }

  console.log(`\n=== NARRATIVE ===`);
  console.log(`\nAudience: ${p.narrative.audienceSummary}`);
  console.log(`\nAwareness: ${p.narrative.awarenessSummary}`);
  console.log(`\nActivation: ${p.narrative.activationSummary}`);
  console.log(`\nRenewal: ${p.narrative.renewal}`);

  console.log(`\n=== INFLUENCE DISTRIBUTION ===`);
  for (const s of p.audience.influenceDistribution) {
    console.log(`  ${s.tier}: ${s.count} (${Math.round(s.pct * 100)}%)${s.suppressed ? ' [suppressed <5]' : ''}`);
  }

  if (p.affinity) {
    const a = p.affinity;
    console.log(`\n=== AFFINITY — brand lift (live) ===`);
    console.log(`  sample ${a.sampleSize}${a.smallSample ? ' (small — read qualitatively)' : ''}`);
    console.log(`  awareness +${a.awarenessLiftPct}pp · consideration +${a.considerationLiftPct}pp · recall ${a.sponsorshipRecallPct}% · activation NPS ${a.activationNps} · conversation ${a.conversationQuality}/100`);
    for (const q of a.quotes) console.log(`  “${q}”`);
    const affObj = p.objectives.find((o) => o.objective === 'Affinity');
    if (affObj) console.log(`  Affinity objective: [${affObj.status}] ${affObj.headline}`);
  }

  console.log(`\nDone.`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error('seed-sponsor-recap failed:', e);
  process.exit(1);
});

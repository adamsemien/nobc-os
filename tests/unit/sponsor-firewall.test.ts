import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Sponsor firewall (member-intelligence PR2, S9). Psychographic member data —
// archetype, interests, taste signals — must never reach a sponsor-facing surface.
// The boundary is physical (the separate MemberPsychographics table) and typed
// (lib/intelligence/sponsor-safe.ts). This test is the runtime guard: it fails if a
// sponsor-facing module reads any member-psychographic source.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

// Surfaces that render to — or assemble deliverables about — sponsors, including the
// public share routes (/assets, /doc). Every one must stay psychographic-free.
const SPONSOR_FACING = [
  'app/operator/intelligence/sponsor/page.tsx',
  'app/operator/intelligence/sponsor/actions.ts',
  'app/operator/intelligence/sponsor/_components/SentimentPanel.tsx',
  'app/operator/intelligence/sponsor/_components/SponsorBriefBar.tsx',
  'app/assets/[token]/page.tsx',
  'app/doc/[token]/page.tsx',
  'lib/intelligence/brief-assemble.ts',
];

// Leak-specific tokens: member-psychographic READS only. Deliberately NOT bare
// `archetype`/`archetypes` — a sponsor's own PersonaCriteria.archetypes targeting
// input (brief-assemble) is a legitimate filter, not a member-data leak. We match
// the actual member psychographic fields, scores, aggregates, and the firewalled
// table/relation. `archetype`/`interests` are additionally barred at compile time by
// SponsorAudienceMember in sponsor-safe.ts.
const PSYCHOGRAPHIC_LEAK =
  /MemberPsychographics|archetypeScores|archetypeAverages|tasteSignals|psychographics/;

describe('sponsor firewall — no psychographic reads on sponsor-facing surfaces', () => {
  it.each(SPONSOR_FACING)('%s contains no member-psychographic read', (file) => {
    const src = read(file);
    const match = src.match(PSYCHOGRAPHIC_LEAK);
    expect(
      match,
      match ? `psychographic leak token "${match[0]}" found in ${file}` : undefined,
    ).toBeNull();
  });
});

// The type boundary must exist and export the sponsor-safe shape + provenance union.
describe('sponsor firewall — type boundary present', () => {
  it('lib/intelligence/sponsor-safe.ts exports SponsorAudienceMember + ProvenanceSource', () => {
    const src = read('lib/intelligence/sponsor-safe.ts');
    expect(src).toMatch(/export\s+interface\s+SponsorAudienceMember/);
    expect(src).toMatch(/export\s+type\s+ProvenanceSource/);
  });
});

// The firewall VIEW (S8) is structurally projection-only: a single-table SELECT with
// no JOIN (so it physically cannot reach MemberPsychographics) and an explicit column
// list (no SELECT *). Both audience invariants must be baked into its WHERE. These
// checks are comment-proof — they assert on structure, not prose.
describe('sponsor firewall — sponsor_audience_member view definition', () => {
  const sql = read('prisma/sql/sponsor-audience-view.sql');

  it('has no JOIN — cannot reach another table', () => {
    expect(sql).not.toMatch(/\bjoin\b/i);
  });
  it('uses an explicit column list, never SELECT *', () => {
    expect(sql).not.toMatch(/select\s+\*/i);
  });
  it('bakes in the dedup invariant (mergedIntoId IS NULL)', () => {
    expect(sql).toMatch(/"mergedIntoId"\s+IS\s+NULL/i);
  });
  it('bakes in the no-guests invariant (status = APPROVED)', () => {
    expect(sql).toMatch(/"status"\s*=\s*'APPROVED'/i);
  });
});

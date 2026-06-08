/**
 * Display metadata for per-field provenance sources (member-intelligence PR3, F3 badges).
 * Every provenance source — including `producer` — maps to an operator-readable label and a
 * tone that the ProvenanceBadge renders with design tokens. Typed against ProvenanceSource
 * so a new source can't ship without a badge.
 */
import type { ProvenanceSource } from '@/lib/intelligence/sponsor-safe';

export type ProvenanceTone = 'neutral' | 'success' | 'accent' | 'ai';

export interface ProvenanceMeta {
  label: string;
  tone: ProvenanceTone;
}

const PROVENANCE_META: Record<ProvenanceSource, ProvenanceMeta> = {
  self_reported: { label: 'Self-reported', tone: 'neutral' },
  operator_entered: { label: 'Operator', tone: 'neutral' },
  ai_inferred: { label: 'AI inferred', tone: 'ai' },
  verified_enrichment: { label: 'Verified', tone: 'success' },
  producer: { label: 'Producer', tone: 'accent' },
};

function humanizeToken(token: string): string {
  const cleaned = token.replace(/[_-]+/g, ' ').trim();
  if (!cleaned) return 'Unknown';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function provenanceMeta(source: string): ProvenanceMeta {
  return (
    PROVENANCE_META[source as ProvenanceSource] ?? {
      label: humanizeToken(source),
      tone: 'neutral',
    }
  );
}

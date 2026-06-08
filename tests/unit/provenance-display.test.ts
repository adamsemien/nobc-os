import { describe, it, expect } from 'vitest';
import { PROVENANCE_SOURCES } from '@/lib/member-provenance';
import { provenanceMeta } from '@/lib/provenance-display';

describe('provenanceMeta — F3 badge metadata', () => {
  it('maps all five provenance sources (including producer) to a label + tone', () => {
    for (const source of PROVENANCE_SOURCES) {
      const meta = provenanceMeta(source);
      expect(meta.label.length).toBeGreaterThan(0);
      expect(['neutral', 'success', 'accent', 'ai']).toContain(meta.tone);
    }
    // producer must render — the firewall lets producer-sourced fields through
    expect(provenanceMeta('producer')).toEqual({ label: 'Producer', tone: 'accent' });
  });

  it('distinguishes machine-inferred and verified sources by tone', () => {
    expect(provenanceMeta('ai_inferred').tone).toBe('ai');
    expect(provenanceMeta('verified_enrichment')).toEqual({ label: 'Verified', tone: 'success' });
  });

  it('falls back to a humanized label for an unknown source', () => {
    expect(provenanceMeta('mystery_source')).toEqual({ label: 'Mystery source', tone: 'neutral' });
  });
});

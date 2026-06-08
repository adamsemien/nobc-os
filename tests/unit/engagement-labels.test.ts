import { describe, it, expect } from 'vitest';
import { MemberEngagementEventType } from '@prisma/client';
import { engagementMeta } from '@/lib/engagement-labels';

describe('engagementMeta — timeline labels', () => {
  const allTypes = Object.values(MemberEngagementEventType);

  it('maps every engagement event type to a human label (never a raw enum token)', () => {
    for (const t of allTypes) {
      const meta = engagementMeta(t);
      expect(meta.label.length).toBeGreaterThan(0);
      // never the bare snake_case token
      expect(meta.label).not.toBe(t);
      // labels carry a space or capital — i.e. they are phrased, not tokens
      expect(meta.label).toMatch(/[A-Z]/);
    }
  });

  it('never uses the banned term "RSVP" — Event Access terminology only', () => {
    for (const t of allTypes) {
      expect(engagementMeta(t).label).not.toMatch(/rsvp/i);
    }
  });

  it('uses locked product terminology for access events', () => {
    expect(engagementMeta('rsvp_confirmed').label).toBe('Confirmed Event Access');
    expect(engagementMeta('comp_issued').label).toBe('Comp Access issued');
    expect(engagementMeta('guest_created').label).toBe('Added as a Guest');
  });

  it('assigns tones that drive the marker color', () => {
    expect(engagementMeta('checked_in').tone).toBe('positive');
    expect(engagementMeta('rsvp_cancelled').tone).toBe('negative');
    expect(engagementMeta('newsletter_opened').tone).toBe('neutral');
  });

  it('humanizes an unknown token instead of leaking it raw', () => {
    const meta = engagementMeta('some_new_db_value');
    expect(meta.label).toBe('Some new db value');
    expect(meta.tone).toBe('neutral');
  });
});

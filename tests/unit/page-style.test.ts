import { describe, it, expect } from 'vitest';
import {
  PAGE_STYLE_DEFAULTS,
  parsePageStyle,
  heroHeightVh,
} from '@/lib/page-style';

describe('PAGE_STYLE_DEFAULTS', () => {
  it('equals the current hard-coded member-page look (no-regression contract)', () => {
    // If any of these change, member pages with a null pageStyle shift. That is a
    // visual regression unless intentional — update the templates' var() fallbacks
    // in lockstep.
    expect(PAGE_STYLE_DEFAULTS).toEqual({
      heroScrimTop: 0.55,
      heroScrimBottom: 0.65,
      heroTextMode: 'light',
      heroTitleColor: 'light',
      heroTitleAccent: false,
      titleScale: 1,
      heroHeight: 'standard',
      textureOn: false,
      textureOpacity: 0.1,
      cardShadow: 'raised',
      footerScale: 'md',
    });
  });
});

describe('parsePageStyle', () => {
  it('falls back to defaults for null/undefined/non-object input', () => {
    expect(parsePageStyle(null)).toEqual(PAGE_STYLE_DEFAULTS);
    expect(parsePageStyle(undefined)).toEqual(PAGE_STYLE_DEFAULTS);
    expect(parsePageStyle('nope')).toEqual(PAGE_STYLE_DEFAULTS);
    expect(parsePageStyle(42)).toEqual(PAGE_STYLE_DEFAULTS);
  });

  it('returns full defaults for an empty object', () => {
    expect(parsePageStyle({})).toEqual(PAGE_STYLE_DEFAULTS);
  });

  it('merges a valid partial onto defaults', () => {
    expect(parsePageStyle({ titleScale: 1.1, textureOn: true })).toEqual({
      ...PAGE_STYLE_DEFAULTS,
      titleScale: 1.1,
      textureOn: true,
    });
  });

  it('rejects an out-of-bounds field and resets to defaults (fail-safe)', () => {
    // Bounds reject rather than clamp; one bad field discards the whole object.
    // The bounded editor never produces these, so this only guards bad/legacy data.
    expect(parsePageStyle({ heroScrimBottom: 0.2 })).toEqual(PAGE_STYLE_DEFAULTS);
    expect(parsePageStyle({ titleScale: 5 })).toEqual(PAGE_STYLE_DEFAULTS);
  });
});

describe('heroHeightVh', () => {
  it('maps the hero-height enum to viewport-height numbers', () => {
    expect(heroHeightVh('compact')).toBe(44);
    expect(heroHeightVh('standard')).toBe(58);
    expect(heroHeightVh('tall')).toBe(72);
  });
});

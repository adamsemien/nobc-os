import { describe, it, expect } from 'vitest';
import { toScoreDisplay } from '@/lib/score-display';

// toScoreDisplay normalizes three input ranges (0–1 aiScore, 0–30 worth, 0–100 raw)
// to a 0–100 display score + tier. Tier is computed from the UNROUNDED normalized
// value; cutoffs: top ≥ 0.73, mid ≥ 0.53, low < 0.53.

describe('toScoreDisplay', () => {
  describe('invalid input → null', () => {
    it('returns null for null', () => expect(toScoreDisplay(null)).toBeNull());
    it('returns null for undefined', () => expect(toScoreDisplay(undefined)).toBeNull());
    it('returns null for NaN', () => expect(toScoreDisplay(NaN)).toBeNull());
  });

  describe('0–1 range tier cutoffs', () => {
    it('0 → score 0, low', () => {
      expect(toScoreDisplay(0)).toMatchObject({ score: 0, tier: 'low' });
    });
    it('0.52 (just under mid) → score 52, low', () => {
      expect(toScoreDisplay(0.52)).toMatchObject({ score: 52, tier: 'low' });
    });
    it('0.53 (exact mid cutoff) → score 53, mid', () => {
      expect(toScoreDisplay(0.53)).toMatchObject({ score: 53, tier: 'mid' });
    });
    it('0.72 (just under top) → score 72, mid', () => {
      expect(toScoreDisplay(0.72)).toMatchObject({ score: 72, tier: 'mid' });
    });
    it('0.73 (exact top cutoff) → score 73, top', () => {
      expect(toScoreDisplay(0.73)).toMatchObject({ score: 73, tier: 'top' });
    });
    it('1 (max) → score 100, top', () => {
      expect(toScoreDisplay(1)).toMatchObject({ score: 100, tier: 'top' });
    });
  });

  describe('rounded display score vs unrounded tier', () => {
    it('0.729 → score rounds to 73 but tier is mid (tier uses unrounded value)', () => {
      expect(toScoreDisplay(0.729)).toMatchObject({ score: 73, tier: 'mid' });
    });
    it('0.529 → score rounds to 53 but tier is low', () => {
      expect(toScoreDisplay(0.529)).toMatchObject({ score: 53, tier: 'low' });
    });
  });

  describe('0–30 worth-score range (input/30)', () => {
    it('2 → score 7, low', () => {
      expect(toScoreDisplay(2)).toMatchObject({ score: 7, tier: 'low' });
    });
    it('15 (0.50) → score 50, low', () => {
      expect(toScoreDisplay(15)).toMatchObject({ score: 50, tier: 'low' });
    });
    it('16 (≈16/30, the doc mid example) → score 53, mid', () => {
      expect(toScoreDisplay(16)).toMatchObject({ score: 53, tier: 'mid' });
    });
    it('22 (≈22/30, the doc top example) → score 73, top', () => {
      expect(toScoreDisplay(22)).toMatchObject({ score: 73, tier: 'top' });
    });
    it('30 (top of range) → score 100, top', () => {
      expect(toScoreDisplay(30)).toMatchObject({ score: 100, tier: 'top' });
    });
  });

  describe('0–100 raw range + clamp', () => {
    it('50 → score 50, low', () => {
      expect(toScoreDisplay(50)).toMatchObject({ score: 50, tier: 'low' });
    });
    it('53 → score 53, mid', () => {
      expect(toScoreDisplay(53)).toMatchObject({ score: 53, tier: 'mid' });
    });
    it('73 → score 73, top', () => {
      expect(toScoreDisplay(73)).toMatchObject({ score: 73, tier: 'top' });
    });
    it('100 → score 100, top', () => {
      expect(toScoreDisplay(100)).toMatchObject({ score: 100, tier: 'top' });
    });
    it('150 (over max) → clamped to score 100, top', () => {
      expect(toScoreDisplay(150)).toMatchObject({ score: 100, tier: 'top' });
    });
  });

  describe('discontinuity at 30 (characterization of current behavior)', () => {
    // 30 is treated as a 0–30 worth score (30/30 = 1.0); 31 falls into the
    // 0–100 branch (31/100 = 0.31). This is a real cliff — pinned, not endorsed.
    it('30 → score 100, top', () => {
      expect(toScoreDisplay(30)).toMatchObject({ score: 100, tier: 'top' });
    });
    it('31 → score 31, low (collapses into the /100 branch)', () => {
      expect(toScoreDisplay(31)).toMatchObject({ score: 31, tier: 'low' });
    });
  });

  describe('default tier labels + tone tokens', () => {
    it('top → Resident, text-primary / var(--primary)', () => {
      expect(toScoreDisplay(0.9)).toEqual({
        score: 90,
        tier: 'top',
        tierLabel: 'Resident',
        toneClass: 'text-primary',
        toneVar: 'var(--primary)',
      });
    });
    it('mid → Member, text-text-primary / var(--text-primary)', () => {
      expect(toScoreDisplay(0.6)).toEqual({
        score: 60,
        tier: 'mid',
        tierLabel: 'Member',
        toneClass: 'text-text-primary',
        toneVar: 'var(--text-primary)',
      });
    });
    it('low → Considering, text-text-secondary / var(--text-secondary)', () => {
      expect(toScoreDisplay(0.2)).toEqual({
        score: 20,
        tier: 'low',
        tierLabel: 'Considering',
        toneClass: 'text-text-secondary',
        toneVar: 'var(--text-secondary)',
      });
    });
  });

  describe('tierNames override', () => {
    const custom = { top: 'VIP', mid: 'Crew', low: 'Maybe' };
    it('uses the override label for the resolved tier (top)', () => {
      expect(toScoreDisplay(0.8, custom)).toMatchObject({ tier: 'top', tierLabel: 'VIP' });
    });
    it('uses the override label for mid', () => {
      expect(toScoreDisplay(0.6, custom)).toMatchObject({ tier: 'mid', tierLabel: 'Crew' });
    });
    it('uses the override label for low', () => {
      expect(toScoreDisplay(0.2, custom)).toMatchObject({ tier: 'low', tierLabel: 'Maybe' });
    });
  });

  describe('negative input (characterization — no low-end clamp)', () => {
    it('-1 → score -100, low (function does not floor the score at 0)', () => {
      expect(toScoreDisplay(-1)).toMatchObject({ score: -100, tier: 'low' });
    });
  });
});

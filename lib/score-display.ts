/** Score display rules.
 *
 *  Application.aiScore is stored canonically as 0–1.
 *  For operator UIs we display it as 0–100 and tag a tier.
 *
 *  Tier cutoffs (from CLAUDE.md):
 *    charter ≥ 0.73  (≈ 22/30)
 *    standard ≥ 0.53 (≈ 16/30)
 *    waitlist < 0.53
 */

export type ScoreTier = 'charter' | 'standard' | 'waitlist';

export type ScoreDisplay = {
  score: number;
  tier: ScoreTier;
  tierLabel: 'Charter' | 'Standard' | 'Waitlist';
  /** Token name to use via Tailwind utility classes. */
  toneClass: string;
  /** CSS variable string for inline style. */
  toneVar: string;
};

/** Accepts either a 0–1 aiScore or a 0–30 worth score. Returns 0–100 display. */
export function toScoreDisplay(input: number | null | undefined): ScoreDisplay | null {
  if (input == null || Number.isNaN(input)) return null;

  let normalized: number;
  if (input <= 1) normalized = input;
  else if (input <= 30) normalized = input / 30;
  else normalized = Math.min(1, input / 100);

  const score = Math.round(normalized * 100);

  let tier: ScoreTier;
  let tierLabel: ScoreDisplay['tierLabel'];
  let toneClass: string;
  let toneVar: string;

  if (normalized >= 0.73) {
    tier = 'charter';
    tierLabel = 'Charter';
    toneClass = 'text-primary';
    toneVar = 'var(--primary)';
  } else if (normalized >= 0.53) {
    tier = 'standard';
    tierLabel = 'Standard';
    toneClass = 'text-text-primary';
    toneVar = 'var(--text-primary)';
  } else {
    tier = 'waitlist';
    tierLabel = 'Waitlist';
    toneClass = 'text-text-secondary';
    toneVar = 'var(--text-secondary)';
  }

  return { score, tier, tierLabel, toneClass, toneVar };
}

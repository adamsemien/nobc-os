/** Score display rules.
 *
 *  Application.aiScore is stored canonically as 0–1.
 *  For operator UIs we display it as 0–100 and tag a tier.
 *
 *  Tier cutoffs (from CLAUDE.md):
 *    top   ≥ 0.73  (≈ 22/30)  — default label: Resident
 *    mid   ≥ 0.53  (≈ 16/30)  — default label: Member
 *    low   < 0.53            — default label: Considering
 *
 *  Operators can rename the tier labels via Workspace.tierNames JSON
 *  ({ top, mid, low }). null = use defaults. */

export type ScoreTier = 'top' | 'mid' | 'low';

export type TierNames = { top: string; mid: string; low: string };

export const DEFAULT_TIER_NAMES: TierNames = {
  top: 'Resident',
  mid: 'Member',
  low: 'Considering',
};

export type ScoreDisplay = {
  score: number;
  tier: ScoreTier;
  tierLabel: string;
  /** Token name to use via Tailwind utility classes. */
  toneClass: string;
  /** CSS variable string for inline style. */
  toneVar: string;
};

/** Coerce a stored Workspace.tierNames Json column into a typed TierNames. */
export function resolveTierNames(value: unknown): TierNames {
  if (value && typeof value === 'object') {
    const v = value as Partial<TierNames>;
    return {
      top: typeof v.top === 'string' && v.top.trim() ? v.top : DEFAULT_TIER_NAMES.top,
      mid: typeof v.mid === 'string' && v.mid.trim() ? v.mid : DEFAULT_TIER_NAMES.mid,
      low: typeof v.low === 'string' && v.low.trim() ? v.low : DEFAULT_TIER_NAMES.low,
    };
  }
  return DEFAULT_TIER_NAMES;
}

/** Accepts either a 0–1 aiScore, a 0–30 worth score, or a 0–100 raw score.
 *  Returns 0–100 display + tier metadata. Pass tierNames to override defaults. */
export function toScoreDisplay(
  input: number | null | undefined,
  tierNames: TierNames = DEFAULT_TIER_NAMES,
): ScoreDisplay | null {
  if (input == null || Number.isNaN(input)) return null;

  let normalized: number;
  if (input <= 1) normalized = input;
  else if (input <= 30) normalized = input / 30;
  else normalized = Math.min(1, input / 100);

  const score = Math.round(normalized * 100);

  let tier: ScoreTier;
  let tierLabel: string;
  let toneClass: string;
  let toneVar: string;

  if (normalized >= 0.73) {
    tier = 'top';
    tierLabel = tierNames.top;
    toneClass = 'text-primary';
    toneVar = 'var(--primary)';
  } else if (normalized >= 0.53) {
    tier = 'mid';
    tierLabel = tierNames.mid;
    toneClass = 'text-text-primary';
    toneVar = 'var(--text-primary)';
  } else {
    tier = 'low';
    tierLabel = tierNames.low;
    toneClass = 'text-text-secondary';
    toneVar = 'var(--text-secondary)';
  }

  return { score, tier, tierLabel, toneClass, toneVar };
}

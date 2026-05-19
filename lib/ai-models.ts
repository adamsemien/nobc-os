/** Operator-selectable Claude models. */

export type AIModelId =
  | 'claude-opus-4-7'
  | 'claude-sonnet-4-6'
  | 'claude-haiku-4-5-20251001';

export type AIModelChoice = {
  id: AIModelId;
  label: string;
  family: 'Opus' | 'Sonnet' | 'Haiku';
  speed: 'slow' | 'medium' | 'fast';
  /** Lower = cheaper. `●●●` low / `●●` medium / `●` high. */
  costTier: 'low' | 'medium' | 'high';
  description: string;
};

export const DEFAULT_AI_MODEL: AIModelId = 'claude-sonnet-4-6';

export const AI_MODELS: AIModelChoice[] = [
  {
    id: 'claude-opus-4-7',
    label: 'Opus 4.7',
    family: 'Opus',
    speed: 'medium',
    costTier: 'high',
    description: 'Highest quality. Best for deep reasoning on application reviews.',
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Sonnet 4.6',
    family: 'Sonnet',
    speed: 'medium',
    costTier: 'medium',
    description: 'Balanced quality and speed. Default for most operator work.',
  },
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Haiku 4.5',
    family: 'Haiku',
    speed: 'fast',
    costTier: 'low',
    description: 'Fastest and cheapest. Best for chat and quick suggestions.',
  },
];

export function costGlyphs(tier: AIModelChoice['costTier']): string {
  if (tier === 'low') return '●●●';
  if (tier === 'medium') return '●●';
  return '●';
}

export function speedLabel(speed: AIModelChoice['speed']): string {
  if (speed === 'fast') return 'Fast';
  if (speed === 'medium') return 'Medium';
  return 'Considered';
}

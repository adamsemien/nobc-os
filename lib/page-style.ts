import { z } from 'zod';

/**
 * Per-event page-style overrides for the member event page. Stored on
 * `Event.pageStyle` (additive Json column). Every field is bounded so the
 * operator editor can only produce on-brand, legible pages — there are no
 * free-form color or font controls (brand red, fonts, and body/paper tokens
 * stay locked). Defaults equal the current hard-coded look, so a null/absent
 * value renders exactly as before.
 */

export type HeroTextMode = 'light' | 'dark';
export type HeroTitleColor = 'light' | 'dark' | 'red';
export type HeroHeight = 'compact' | 'standard' | 'tall';
export type CardShadow = 'flat' | 'raised' | 'lifted';
export type FooterScale = 'sm' | 'md' | 'lg';

export const PageStyleSchema = z.object({
  // Hero legibility scrims — black-opacity only. Bounds guarantee readable text
  // on a worst-case photo without a heavy black-box feel. The top scrim covers
  // the nav/logo zone; the bottom covers the title/date.
  heroScrimTop: z.number().min(0.3).max(0.75).default(0.55),
  heroScrimBottom: z.number().min(0.45).max(0.85).default(0.65),
  // Nav + date color over the hero photo: light over dark photos (default) or dark
  // over light photos. The nav "No Bad" stays brand red regardless.
  heroTextMode: z.enum(['light', 'dark']).default('light'),
  // Hero title color, chosen against the photo: white (default), ink, or brand red.
  // Independent of heroTextMode so the title can be red while the nav/date stay light.
  heroTitleColor: z.enum(['light', 'dark', 'red']).default('light'),
  // When on, a leading "No Bad" in the title renders brand red (the wordmark
  // treatment), the rest stays heroTitleColor. Off by default — no-op for titles
  // that don't start with "No Bad".
  heroTitleAccent: z.boolean().default(false),
  // Display title size multiplier (Cormorant stays the family — size only).
  titleScale: z.number().min(0.8).max(1.2).default(1),
  heroHeight: z.enum(['compact', 'standard', 'tall']).default('standard'),
  // Subtle paper grain. Off by default; capped low so it never reads as degraded print.
  textureOn: z.boolean().default(false),
  textureOpacity: z.number().min(0.01).max(0.06).default(0.03),
  // Access card depth + footer wordmark size — the "spruce" knobs. Token-only.
  cardShadow: z.enum(['flat', 'raised', 'lifted']).default('raised'),
  footerScale: z.enum(['sm', 'md', 'lg']).default('md'),
});

export type PageStyle = z.infer<typeof PageStyleSchema>;

/** Equals the current hard-coded look — a null pageStyle renders identically. */
export const PAGE_STYLE_DEFAULTS: PageStyle = PageStyleSchema.parse({});

/** Tolerant parse for DB/JSON input — bad/missing values fall back to defaults. */
export function parsePageStyle(raw: unknown): PageStyle {
  if (raw == null || typeof raw !== 'object') return PAGE_STYLE_DEFAULTS;
  const result = PageStyleSchema.safeParse(raw);
  return result.success ? result.data : PAGE_STYLE_DEFAULTS;
}

/** Hero height enum → viewport-height number used by the templates. */
export function heroHeightVh(h: HeroHeight): number {
  return h === 'compact' ? 44 : h === 'tall' ? 72 : 58;
}

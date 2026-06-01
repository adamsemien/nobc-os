/**
 * PDF color palette for Sponsor Intelligence documents.
 *
 * @react-pdf/renderer's StyleSheet requires LITERAL hex — CSS variables, oklch, and
 * color-mix() do not resolve in the PDF renderer. This is the ONE place in the codebase
 * where hex literals are intentional: every value is the resolved value of a documented
 * semantic CSS token (source noted inline), so the editorial PDF tracks the same palette
 * as the themed web UI. Do NOT scatter these elsewhere — the "no hex literals in
 * components" rule still governs all React/TSX components.
 */
export const PDF = {
  paper: '#f8f5ef', // --events-paper (cream page background)
  cream: '#fcfaf6', // --events-ref-cream (field / alt background)
  card: '#fefcf7', // --events-paper-card (card surface)
  ink: '#201915', // --events-ref-ink (body + headings)
  muted: '#5b504a', // --events-ref-muted (secondary text)
  faint: '#90837b', // --events-ref-faint (captions)
  accent: '#9d5037', // --events-ref-accent (terracotta)
  rule: '#ddd6cf', // --events-ref-rule (hairline rule)
  red: '#b22e21', // --nobc-red (primary accent)
  onRed: '#fdfcf9', // --nobc-on-red (text on red)
  onInkMuted: '#cbbfb6', // muted caption text on the dark (ink) value band
} as const;

/** Influence-tier chart palette (mirrors the literal archetype chart colors in the web UI). */
export const TIER_COLORS: Record<string, string> = {
  Founder: '#1a3a5c',
  Operator: '#2d5a3d',
  Tastemaker: '#8b6914',
  Creator: '#4a3580',
  Connector: '#b22e21',
  Unsegmented: '#90837b',
};

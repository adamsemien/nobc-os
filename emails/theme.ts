/** Email brand constants - the sanctioned literal-hex exception.
 *
 *  Email clients do not support CSS variables, so rendered emails (and the
 *  operator email editor theme that must match them) need literal values.
 *  These mirror the live emails/ components and the app brand tokens
 *  (app/globals.css). Everywhere else in the app, use semantic tokens -
 *  never these literals.
 *
 *  Fonts are Georgia with system serif fallbacks, matching every live email
 *  template (per Adam, 2026-07-14: match the live font, no webfonts).
 */

export const EMAIL_THEME = {
  /** NBC Red - buttons, accents, links. Matches --primary. */
  red: '#B22E21',
  /** Body ink. Matches --text-primary. */
  ink: '#1A1512',
  /** Secondary body text used across live templates. */
  text: '#333333',
  /** Muted footer text used across live templates. */
  muted: '#666666',
  /** Cream paper background. Matches the live templates' body color. */
  paper: '#F9F7F2',
  /** Divider rule color on cream templates. */
  rule: '#e8e4dc',
  /** Display + body font: the live email font. */
  fontDisplay: "Georgia, 'Times New Roman', serif",
  fontBody: "Georgia, 'Times New Roman', serif",
} as const;

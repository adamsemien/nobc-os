/**
 * Brand font registration for Sponsor Intelligence PDFs.
 *
 * Registers the repo's brand TTFs (public/fonts/) with @react-pdf/renderer. The .ttf
 * variants are used deliberately — react-pdf's CFF/.otf support is unreliable — and each
 * weight/style is a separate entry because react-pdf does not synthesize bold/italic.
 * Node runtime only (reads from process.cwd()). Idempotent.
 *
 * LICENSING NOTE: PP Editorial New and Neue Haas Grotesk are commercial retail fonts.
 * Embedding them into distributable PDFs is a separate grant from the site's web @font-face
 * use — flag to Adam before sponsor PDFs are distributed externally at scale.
 */
import path from 'node:path';
import { Font } from '@react-pdf/renderer';

export const SERIF = 'PP Editorial New';
export const SANS = 'Neue Haas Grotesk Display Pro';

let registered = false;
const fontPath = (file: string): string => path.join(process.cwd(), 'public', 'fonts', file);

export function registerRecapFonts(): void {
  if (registered) return;

  Font.register({
    family: SERIF,
    fonts: [
      { src: fontPath('PPEditorialNew-Ultralight.ttf'), fontWeight: 200 },
      { src: fontPath('PPEditorialNew-Regular.ttf'), fontWeight: 400 },
      { src: fontPath('PPEditorialNew-Italic.ttf'), fontWeight: 400, fontStyle: 'italic' },
      { src: fontPath('PPEditorialNew-Bold.ttf'), fontWeight: 700 },
      { src: fontPath('PPEditorialNew-BoldItalic.ttf'), fontWeight: 700, fontStyle: 'italic' },
    ],
  });

  Font.register({
    family: SANS,
    fonts: [
      { src: fontPath('NHaasGroteskDSPro-55Rg.ttf'), fontWeight: 400 },
      { src: fontPath('NHaasGroteskDSPro-56It.ttf'), fontWeight: 400, fontStyle: 'italic' },
      { src: fontPath('NHaasGroteskDSPro-65Md.ttf'), fontWeight: 500 },
      { src: fontPath('NHaasGroteskDSPro-75Bd.ttf'), fontWeight: 700 },
    ],
  });

  // Keep the editorial body from hyphenating mid-word.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

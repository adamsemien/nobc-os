/** Render a RecapPayload to a PDF buffer. Node runtime only (font files + sharp upstream). */
import { renderToBuffer } from '@react-pdf/renderer';
import type { RecapPayload } from '@/lib/intelligence/recap-types';
import { registerRecapFonts } from './fonts';
import { RecapDocument } from './recap-document';

export async function renderRecapPdf(payload: RecapPayload): Promise<Buffer> {
  registerRecapFonts();
  return renderToBuffer(<RecapDocument payload={payload} />);
}

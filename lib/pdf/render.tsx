/** Render a RecapPayload to a PDF buffer, choosing the document by kind. Node runtime only. */
import { renderToBuffer } from '@react-pdf/renderer';
import type { RecapPayload } from '@/lib/intelligence/recap-types';
import { registerRecapFonts } from './fonts';
import { RecapDocument } from './recap-document';
import { BriefDocument } from './brief-document';

/** Render the activation recap. */
export async function renderRecapPdf(payload: RecapPayload): Promise<Buffer> {
  registerRecapFonts();
  return renderToBuffer(<RecapDocument payload={payload} />);
}

/** Render whichever document the payload kind calls for (recap or pre-sale brief). */
export async function renderDocPdf(payload: RecapPayload): Promise<Buffer> {
  registerRecapFonts();
  return renderToBuffer(
    payload.kind === 'audience_intelligence_brief' ? <BriefDocument payload={payload} /> : <RecapDocument payload={payload} />,
  );
}

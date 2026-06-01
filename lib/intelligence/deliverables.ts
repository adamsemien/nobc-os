/**
 * Deliverables Audit — photo proof pulled from the DAM (Asset).
 *
 * Assets are private in R2; we mint a short-lived signed GET for the 800px thumbnail,
 * fetch it server-side, downscale to a recap-sized JPEG with sharp, and embed it as a
 * base64 data URI (@react-pdf/renderer's <Image> needs a buffer or fetchable URL — a data
 * URI keeps the PDF self-contained). All lookups are workspace-scoped; failures degrade to
 * a "pending" proof row rather than throwing.
 */
import sharp from 'sharp';
import { db } from '@/lib/db';
import { presignGet } from '@/lib/dam/storage';
import type { DeliverableProof } from './recap-types';

const PREVIEW_PX = 520;

async function thumbToDataUri(thumbnailKey: string): Promise<string | null> {
  const url = await presignGet(thumbnailKey, 600);
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const out = await sharp(buf)
      .resize(PREVIEW_PX, PREVIEW_PX, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 72 })
      .toBuffer();
    return `data:image/jpeg;base64,${out.toString('base64')}`;
  } catch (e) {
    console.error('[deliverables] thumbnail fetch/resize failed:', e);
    return null;
  }
}

/** Resolve the operator's declared deliverables, embedding DAM photo previews where present. */
export async function resolveDeliverables(args: {
  workspaceId: string;
  declared: { label: string; assetId?: string }[];
}): Promise<DeliverableProof[]> {
  const { workspaceId, declared } = args;
  const out: DeliverableProof[] = [];
  for (const d of declared) {
    if (d.assetId) {
      const asset = await db.asset.findFirst({
        where: { id: d.assetId, workspaceId, deletedAt: null },
        select: { thumbnailUrl: true },
      });
      const uri = asset?.thumbnailUrl ? await thumbToDataUri(asset.thumbnailUrl) : null;
      out.push({
        label: d.label,
        status: uri ? 'verified' : 'pending',
        imageDataUri: uri ?? undefined,
        note: uri ? undefined : 'Photo proof pending upload',
      });
    } else {
      out.push({ label: d.label, status: 'pending', note: 'Photo proof pending upload' });
    }
  }
  return out;
}

/** Auto-pull the strongest event photos from the DAM as visual proof (top picks first). */
export async function autoEventPhotos(args: {
  workspaceId: string;
  eventId: string;
  sponsorName?: string | null;
  limit?: number;
}): Promise<DeliverableProof[]> {
  const { workspaceId, eventId, sponsorName, limit = 3 } = args;
  const assets = await db.asset.findMany({
    where: {
      workspaceId,
      eventId,
      deletedAt: null,
      fileType: 'PHOTO',
      ...(sponsorName ? { sponsorName } : {}),
    },
    orderBy: [{ isSelect: 'desc' }, { qualityScore: 'desc' }, { sortOrder: 'asc' }],
    take: limit,
    select: { thumbnailUrl: true },
  });
  const out: DeliverableProof[] = [];
  for (const a of assets) {
    const uri = await thumbToDataUri(a.thumbnailUrl);
    if (uri) out.push({ label: 'Event photography', status: 'verified', imageDataUri: uri });
  }
  return out;
}

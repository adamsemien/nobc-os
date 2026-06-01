/**
 * Generate → store → deliver a sponsor document (Activation Recap or Audience Intelligence Brief).
 *
 * Both kinds travel as a RecapPayload, render via renderDocPdf, upload to private R2, and mint a
 * GeneratedAsset with a 256-bit magic-link token resolved at /doc/[token]. Optional password
 * gating reuses the DAM scrypt hash + HttpOnly cookie pattern (hash stored on the GeneratedAsset
 * payload, so no new column). Recaps also persist a reproducible RecapSnapshot.
 */
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { isStorageConfigured, uploadObject } from '@/lib/dam/storage';
import { hashPassword } from '@/lib/share/password';
import { mintShareToken } from '@/lib/share/token';
import { renderDocPdf } from '@/lib/pdf/render';
import { assembleRecap, type AssembleArgs } from './recap-assemble';
import { assembleBrief } from './brief-assemble';
import type { RecapPayload } from './recap-types';

function docUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');
  return base ? `${base}/doc/${token}` : `/doc/${token}`;
}

// Magic links are 256-bit bearer tokens; expire them by default so a leaked link is not perpetual.
const DOC_TTL_DAYS = 90;

export interface GeneratedDoc {
  token: string;
  url: string;
  generatedAssetId: string;
  snapshotId: string | null;
  payload: RecapPayload;
  storageConfigured: boolean;
}

/** Shared: render the payload, upload, mint the GeneratedAsset + magic link. */
async function storeAndDeliver(
  payload: RecapPayload,
  opts: { workspaceId: string; sponsorBrandId?: string | null; password?: string | null; generatedBySession?: string | null },
): Promise<Omit<GeneratedDoc, 'snapshotId'>> {
  const { workspaceId, sponsorBrandId, password, generatedBySession } = opts;
  const token = mintShareToken();
  const key = `generated/${workspaceId}/${token}/${payload.kind}.pdf`;
  const passwordHash = password ? await hashPassword(password) : null;

  const pdf = await renderDocPdf(payload);
  const storageConfigured = isStorageConfigured();
  if (storageConfigured) {
    await uploadObject(key, pdf, 'application/pdf');
  } else {
    console.error('[recap-delivery] R2 not configured — PDF rendered but not stored. token=', token);
  }

  const asset = await db.generatedAsset.create({
    data: {
      workspaceId,
      sponsorBrandId: sponsorBrandId ?? null,
      type: payload.kind,
      pdfUrl: key,
      magicLinkUrl: token,
      generatedBySession: generatedBySession ?? null,
      expiresAt: new Date(Date.now() + DOC_TTL_DAYS * 24 * 60 * 60 * 1000),
      payload: { recap: payload, access: { passwordHash } } as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  return { token, url: docUrl(token), generatedAssetId: asset.id, payload, storageConfigured };
}

export interface GenerateRecapArgs extends AssembleArgs {
  password?: string | null;
  generatedBySession?: string | null;
}

/** Activation Recap: compute → snapshot → store → deliver. */
export async function generateAndStoreRecap(args: GenerateRecapArgs): Promise<GeneratedDoc> {
  const { workspaceId, eventId, sponsorBrandId, password, generatedBySession, ...rest } = args;
  const { payload, snapshotMetrics, mediaValueInputs } = await assembleRecap({ workspaceId, eventId, sponsorBrandId, ...rest });

  const snapshot = await db.recapSnapshot.create({
    data: {
      workspaceId,
      eventId,
      sponsorBrandId: sponsorBrandId ?? null,
      metrics: snapshotMetrics as unknown as Prisma.InputJsonValue,
      mediaValueInputs: mediaValueInputs as unknown as Prisma.InputJsonValue,
      generatedBySession: generatedBySession ?? null,
    },
    select: { id: true },
  });

  const delivered = await storeAndDeliver(payload, { workspaceId, sponsorBrandId, password, generatedBySession });
  return { ...delivered, snapshotId: snapshot.id };
}

/** Pre-sale Audience Intelligence Brief: assemble → store → deliver (no event snapshot). */
export async function generateAndStoreBrief(args: {
  workspaceId: string;
  sponsorBrandId: string;
  password?: string | null;
  generatedBySession?: string | null;
}): Promise<GeneratedDoc> {
  const { payload } = await assembleBrief({ workspaceId: args.workspaceId, sponsorBrandId: args.sponsorBrandId });
  const delivered = await storeAndDeliver(payload, {
    workspaceId: args.workspaceId,
    sponsorBrandId: args.sponsorBrandId,
    password: args.password,
    generatedBySession: args.generatedBySession,
  });
  return { ...delivered, snapshotId: null };
}

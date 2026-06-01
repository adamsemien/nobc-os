/**
 * Generate → store → deliver an Activation Recap.
 *
 * Persists a reproducible RecapSnapshot, renders the editorial PDF, uploads it to private R2,
 * and mints a GeneratedAsset with a 256-bit magic-link token. Optional password gating reuses
 * the DAM scrypt hash + HttpOnly cookie pattern (the hash is stored on the GeneratedAsset
 * payload so the public /doc/[token] route can HMAC-key its auth cookie without a new column).
 */
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { isStorageConfigured, uploadObject } from '@/lib/dam/storage';
import { hashPassword } from '@/lib/share/password';
import { mintShareToken } from '@/lib/share/token';
import { renderRecapPdf } from '@/lib/pdf/render';
import { assembleRecap, type AssembleArgs } from './recap-assemble';
import type { RecapPayload } from './recap-types';

function recapKey(workspaceId: string, token: string): string {
  return `generated/${workspaceId}/${token}/activation-recap.pdf`;
}

function docUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');
  return base ? `${base}/doc/${token}` : `/doc/${token}`;
}

export interface GenerateRecapArgs extends AssembleArgs {
  password?: string | null;
  generatedBySession?: string | null;
}

export interface GeneratedRecap {
  token: string;
  url: string;
  generatedAssetId: string;
  snapshotId: string;
  payload: RecapPayload;
  storageConfigured: boolean;
}

export async function generateAndStoreRecap(args: GenerateRecapArgs): Promise<GeneratedRecap> {
  const { workspaceId, eventId, sponsorBrandId, password, generatedBySession, ...rest } = args;

  const { payload, snapshotMetrics, mediaValueInputs } = await assembleRecap({
    workspaceId,
    eventId,
    sponsorBrandId,
    ...rest,
  });

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

  const token = mintShareToken();
  const key = recapKey(workspaceId, token);
  const passwordHash = password ? await hashPassword(password) : null;

  const pdf = await renderRecapPdf(payload);
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
      payload: { recap: payload, access: { passwordHash } } as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  return { token, url: docUrl(token), generatedAssetId: asset.id, snapshotId: snapshot.id, payload, storageConfigured };
}

import { describe, it, expect, vi, afterAll } from 'vitest';

/**
 * DB ACCEPTANCE — applicant photo -> DAM mirror on REAL seeded rows.
 *
 * Everything Prisma touches is the real dev database from .env.local: the
 * Application + ApplicationAnswer seed rows, the find-or-create Applications
 * MediaFolder, the Asset rows (including any live unique index on
 * (workspaceId, sourceSystem, sourceId)), retirement, and storage accounting.
 * The Sharp thumbnail/BlurHash pipeline is also real.
 *
 * Only the R2 HTTP layer is swapped for an in-memory store: the R2 credentials
 * are Vercel-sensitive values that never pull into .env.local, so the live
 * bucket is unreachable from a dev checkout (the DAM has the same local
 * limitation). scripts/acceptance-apply-photo-mirror.ts is the full-loop
 * variant to run in an environment that has real R2 credentials.
 *
 * Run: npx vitest run --config vitest.acceptance.config.ts
 */

const r2 = vi.hoisted(() => new Map<string, Buffer>());

vi.mock('@/lib/dam/storage', () => ({
  isStorageConfigured: () => true,
  uploadObject: async (key: string, body: Buffer) => {
    r2.set(key, body);
  },
  getObjectBuffer: async (key: string) => r2.get(key) ?? null,
  deleteObject: async (key: string) => {
    r2.delete(key);
  },
}));

import sharp from 'sharp';
import { db } from '@/lib/db';
import { applicationPhotoKey } from '@/lib/apply-photo';
import { mirrorApplicationPhotosToDam } from '@/lib/apply-photo-mirror';

const cleanup: (() => Promise<unknown>)[] = [];

afterAll(async () => {
  for (const fn of cleanup.reverse()) {
    await fn().catch(() => {});
  }
});

describe('applicant photo -> DAM mirror (real dev DB)', () => {
  it('mirrors a seeded application photo into the DAM, idempotently, and retires replacements', async () => {
    const ws = await db.workspace.findFirst({ select: { id: true } });
    expect(ws, 'a workspace must exist in the dev DB').toBeTruthy();
    if (!ws) return;

    // Seed the photo object exactly where the /apply upload route puts it.
    const jpeg = await sharp({
      create: { width: 96, height: 128, channels: 3, background: { r: 178, g: 46, b: 33 } },
    })
      .jpeg()
      .toBuffer();
    const key = applicationPhotoKey(ws.id, 'jpg');
    r2.set(key, jpeg);

    // Seed a real application row + photos.urls answer.
    const app = await db.application.create({
      data: {
        workspaceId: ws.id,
        email: `qa+photo-mirror-${Date.now()}@nobc-dev.test`,
        fullName: 'QA Mirror Test',
        status: 'PENDING',
      },
      select: { id: true, fullName: true },
    });
    cleanup.push(() => db.application.delete({ where: { id: app.id } }));
    await db.applicationAnswer.create({
      data: { applicationId: app.id, questionKey: 'photos.urls', answer: JSON.stringify([key]) },
    });
    cleanup.push(() => db.applicationAnswer.deleteMany({ where: { applicationId: app.id } }));

    const mirrorOpts = {
      applicationId: app.id,
      workspaceId: ws.id,
      applicantName: app.fullName,
      photoUrlsAnswer: JSON.stringify([key]),
    };
    await mirrorApplicationPhotosToDam(mirrorOpts);

    const asset = await db.asset.findFirst({
      where: { workspaceId: ws.id, sourceSystem: 'apply', sourceId: key },
      select: {
        id: true,
        url: true,
        thumbnailUrl: true,
        width: true,
        height: true,
        blurhash: true,
        filename: true,
        size: true,
        folder: { select: { name: true } },
      },
    });
    expect(asset).toBeTruthy();
    if (!asset) return;
    cleanup.push(() => db.asset.delete({ where: { id: asset.id } }));
    cleanup.push(() =>
      db.workspace.update({
        where: { id: ws.id },
        data: { storageBytes: { decrement: BigInt(jpeg.length) } },
      }),
    );

    expect(asset.url).toBe(key);
    expect(asset.thumbnailUrl).toBe(`${key}.thumb.webp`);
    expect(r2.get(asset.thumbnailUrl)).toBeInstanceOf(Buffer);
    expect(asset.width).toBe(96);
    expect(asset.height).toBe(128);
    expect(asset.blurhash).toBeTruthy();
    expect(asset.size).toBe(jpeg.length);
    expect(asset.folder?.name).toBe('Applications');
    expect(asset.filename.startsWith('QA Mirror Test')).toBe(true);

    // Idempotency on the real DB: a retried PATCH creates no duplicate.
    await mirrorApplicationPhotosToDam(mirrorOpts);
    const count = await db.asset.count({
      where: { workspaceId: ws.id, sourceSystem: 'apply', sourceId: key },
    });
    expect(count).toBe(1);

    // A retried submit that replaced this photo retires it into the DAM trash.
    await mirrorApplicationPhotosToDam({
      ...mirrorOpts,
      photoUrlsAnswer: JSON.stringify([]),
      previousPhotoUrlsAnswer: JSON.stringify([key]),
    });
    const retired = await db.asset.findUnique({
      where: { id: asset.id },
      select: { deletedAt: true },
    });
    expect(retired?.deletedAt).toBeTruthy();
  });
});

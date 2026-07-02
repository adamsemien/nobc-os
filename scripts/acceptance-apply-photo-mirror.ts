/**
 * Acceptance test - applicant photo -> DAM mirror, against the REAL dev DB + R2.
 *
 * Exercises the exact production path lib/apply-photo-mirror.ts runs after the
 * final-submit PATCH: uploads a real JPEG to R2 under the `applications/` prefix
 * (as /api/apply/membership/upload does), seeds a real Application row with a
 * `photos.urls` answer, runs the mirror, and asserts the DAM side effects.
 *
 * Self-cleaning: deletes every row and R2 object it created (the shared
 * "Applications" folder is left in place - it is a real feature artifact and
 * find-or-create makes reruns idempotent).
 *
 * Run: npx tsx scripts/acceptance-apply-photo-mirror.ts
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main(): Promise<void> {
  const { db } = await import('../lib/db');
  const { uploadObject, getObjectBuffer, deleteObject, isStorageConfigured } = await import(
    '../lib/dam/storage'
  );
  const { applicationPhotoKey } = await import('../lib/apply-photo');
  const { mirrorApplicationPhotosToDam } = await import('../lib/apply-photo-mirror');
  const sharp = (await import('sharp')).default;

  if (!isStorageConfigured()) {
    throw new Error('R2 storage is not configured in .env.local - cannot run acceptance test');
  }

  const ws = await db.workspace.findFirst({ select: { id: true } });
  if (!ws) throw new Error('No workspace found in this database');

  // A real (tiny) JPEG, stored exactly like the /apply upload route stores it.
  const jpeg = await sharp({
    create: { width: 96, height: 128, channels: 3, background: { r: 178, g: 46, b: 33 } },
  })
    .jpeg()
    .toBuffer();
  const key = applicationPhotoKey(ws.id, 'jpg');
  await uploadObject(key, jpeg, 'image/jpeg');

  const app = await db.application.create({
    data: {
      workspaceId: ws.id,
      email: `qa+photo-mirror-${Date.now()}@nobc-dev.test`,
      fullName: 'QA Mirror Test',
      status: 'PENDING',
    },
    select: { id: true, fullName: true },
  });
  await db.applicationAnswer.create({
    data: { applicationId: app.id, questionKey: 'photos.urls', answer: JSON.stringify([key]) },
  });

  const results: string[] = [];
  const check = (label: string, ok: boolean): void => {
    results.push(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (!ok) process.exitCode = 1;
  };

  let asset: {
    id: string;
    url: string;
    thumbnailUrl: string;
    width: number | null;
    height: number | null;
    blurhash: string | null;
    filename: string;
    folder: { name: string } | null;
  } | null = null;

  try {
    const mirrorOpts = {
      applicationId: app.id,
      workspaceId: ws.id,
      applicantName: app.fullName,
      photoUrlsAnswer: JSON.stringify([key]),
    };
    await mirrorApplicationPhotosToDam(mirrorOpts);

    asset = await db.asset.findFirst({
      where: { workspaceId: ws.id, sourceSystem: 'apply', sourceId: key },
      select: {
        id: true,
        url: true,
        thumbnailUrl: true,
        width: true,
        height: true,
        blurhash: true,
        filename: true,
        folder: { select: { name: true } },
      },
    });
    check('Asset row created', asset !== null);
    check('Asset url points at the uploaded key', asset?.url === key);
    check(
      'thumbnail generated and stored in R2',
      !!asset?.thumbnailUrl && (await getObjectBuffer(asset.thumbnailUrl)) !== null,
    );
    check('dimensions captured', asset?.width === 96 && asset?.height === 128);
    check('blurhash present', !!asset?.blurhash);
    check('lives in the Applications folder', asset?.folder?.name === 'Applications');
    check(
      'filename carries the applicant name',
      asset?.filename.startsWith('QA Mirror Test') === true,
    );

    await mirrorApplicationPhotosToDam(mirrorOpts);
    const count = await db.asset.count({
      where: { workspaceId: ws.id, sourceSystem: 'apply', sourceId: key },
    });
    check('idempotent re-run (still exactly 1 asset)', count === 1);

    await mirrorApplicationPhotosToDam({
      ...mirrorOpts,
      photoUrlsAnswer: JSON.stringify([]),
      previousPhotoUrlsAnswer: JSON.stringify([key]),
    });
    const retired = asset
      ? await db.asset.findUnique({ where: { id: asset.id }, select: { deletedAt: true } })
      : null;
    check('replaced photo soft-deletes into the DAM trash', retired?.deletedAt != null);
  } finally {
    if (asset) {
      await db.asset.delete({ where: { id: asset.id } }).catch(() => {});
      await db.workspace
        .update({ where: { id: ws.id }, data: { storageBytes: { decrement: BigInt(jpeg.length) } } })
        .catch(() => {});
      if (asset.thumbnailUrl) await deleteObject(asset.thumbnailUrl).catch(() => {});
    }
    await db.applicationAnswer.deleteMany({ where: { applicationId: app.id } }).catch(() => {});
    await db.application.delete({ where: { id: app.id } }).catch(() => {});
    await deleteObject(key).catch(() => {});
  }

  console.log(results.join('\n'));
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

/**
 * DAM mirror for applicant photos — lib/apply-photo-mirror.ts.
 *
 * Pins the contract of the post-PATCH mirror pass:
 *   - Only keys under this workspace's `applications/` prefix are mirrored
 *     (the photos.urls answer is applicant-controlled — IDOR defense).
 *   - Idempotent per photo via sourceSystem='apply' + sourceId=<key>.
 *   - A retried submit retires the assets it replaced (soft-delete).
 *   - Best-effort: any failure resolves quietly (never break /apply).
 *
 * db, storage, and image processing are mocked. No real DB or R2 calls.
 */

const m = vi.hoisted(() => ({
  assetFindFirst: vi.fn(),
  assetCreate: vi.fn(),
  assetUpdateMany: vi.fn(),
  folderFindFirst: vi.fn(),
  folderCreate: vi.fn(),
  workspaceUpdate: vi.fn(),
  isStorageConfigured: vi.fn(),
  getObjectBuffer: vi.fn(),
  uploadObject: vi.fn(),
  processImage: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    asset: { findFirst: m.assetFindFirst, create: m.assetCreate, updateMany: m.assetUpdateMany },
    mediaFolder: { findFirst: m.folderFindFirst, create: m.folderCreate },
    workspace: { update: m.workspaceUpdate },
  },
}));

vi.mock('@/lib/dam/storage', () => ({
  isStorageConfigured: m.isStorageConfigured,
  getObjectBuffer: m.getObjectBuffer,
  uploadObject: m.uploadObject,
}));

vi.mock('@/lib/dam/image', () => ({
  processImage: m.processImage,
}));

import { mirrorApplicationPhotosToDam } from '@/lib/apply-photo-mirror';

const WS = 'ws_1';
const APP = 'app_1';
const KEY = (n: number) => `applications/${WS}/175000000000${n}-abcdefgh.jpg`;

function baseOpts(keys: string[], previous?: string[]) {
  return {
    applicationId: APP,
    workspaceId: WS,
    applicantName: 'Jordan Voss',
    photoUrlsAnswer: JSON.stringify(keys),
    previousPhotoUrlsAnswer: previous ? JSON.stringify(previous) : null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.isStorageConfigured.mockReturnValue(true);
  m.assetFindFirst.mockResolvedValue(null);
  m.assetCreate.mockResolvedValue({ id: 'asset_1' });
  m.assetUpdateMany.mockResolvedValue({ count: 0 });
  m.folderFindFirst.mockResolvedValue({ id: 'folder_1' });
  m.folderCreate.mockResolvedValue({ id: 'folder_new' });
  m.workspaceUpdate.mockResolvedValue({});
  m.getObjectBuffer.mockResolvedValue(Buffer.from('image-bytes'));
  m.uploadObject.mockResolvedValue(undefined);
  m.processImage.mockResolvedValue({
    thumbnail: Buffer.from('thumb'),
    thumbnailContentType: 'image/webp',
    blurhash: 'LKO2?U%2Tw=w]~RB',
    width: 3024,
    height: 4032,
    shootDate: null,
  });
});

describe('mirrorApplicationPhotosToDam', () => {
  it('creates one asset per valid key with the apply provenance + thumbnail', async () => {
    await mirrorApplicationPhotosToDam(baseOpts([KEY(1), KEY(2)]));

    expect(m.uploadObject).toHaveBeenCalledTimes(2);
    expect(m.uploadObject).toHaveBeenCalledWith(`${KEY(1)}.thumb.webp`, expect.any(Buffer), 'image/webp');
    expect(m.assetCreate).toHaveBeenCalledTimes(2);
    const first = m.assetCreate.mock.calls[0][0].data;
    expect(first).toMatchObject({
      workspaceId: WS,
      url: KEY(1),
      thumbnailUrl: `${KEY(1)}.thumb.webp`,
      fileType: 'PHOTO',
      sourceSystem: 'apply',
      sourceId: KEY(1),
      folderId: 'folder_1',
      uploadedBy: 'applicant',
      filename: 'Jordan Voss - application photo 1.jpg',
    });
    expect(first.width).toBe(3024);
    expect(first.blurhash).toBeTruthy();
    expect(m.workspaceUpdate).toHaveBeenCalledTimes(2);
  });

  it('creates the Applications folder when missing', async () => {
    m.folderFindFirst.mockResolvedValue(null);
    await mirrorApplicationPhotosToDam(baseOpts([KEY(1)]));
    expect(m.folderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ workspaceId: WS, name: 'Applications' }),
      }),
    );
    expect(m.assetCreate.mock.calls[0][0].data.folderId).toBe('folder_new');
  });

  it('ignores keys outside this workspace prefix, http URLs, and traversal', async () => {
    await mirrorApplicationPhotosToDam(
      baseOpts([
        `applications/ws_OTHER/1-x.jpg`,
        'https://example.com/photo.jpg',
        `applications/${WS}/../dam/${WS}/steal.jpg`,
        `dam/${WS}/asset/original.jpg`,
      ]),
    );
    expect(m.assetCreate).not.toHaveBeenCalled();
    expect(m.uploadObject).not.toHaveBeenCalled();
  });

  it('caps mirroring at 5 photos', async () => {
    await mirrorApplicationPhotosToDam(baseOpts([1, 2, 3, 4, 5, 6].map(KEY)));
    expect(m.assetCreate).toHaveBeenCalledTimes(5);
  });

  it('skips keys that are already mirrored (idempotent retry)', async () => {
    m.assetFindFirst.mockResolvedValue({ id: 'asset_existing' });
    await mirrorApplicationPhotosToDam(baseOpts([KEY(1)]));
    expect(m.getObjectBuffer).not.toHaveBeenCalled();
    expect(m.assetCreate).not.toHaveBeenCalled();
    expect(m.workspaceUpdate).not.toHaveBeenCalled();
  });

  it('swallows a P2002 race on create without touching storage accounting', async () => {
    m.assetCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(mirrorApplicationPhotosToDam(baseOpts([KEY(1)]))).resolves.toBeUndefined();
    expect(m.workspaceUpdate).not.toHaveBeenCalled();
  });

  it('retires previously mirrored assets a resubmit replaced', async () => {
    await mirrorApplicationPhotosToDam(baseOpts([KEY(2)], [KEY(1), KEY(2)]));
    expect(m.assetUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: WS,
          sourceSystem: 'apply',
          sourceId: { in: [KEY(1)] },
          deletedAt: null,
        }),
        data: { deletedAt: expect.any(Date) },
      }),
    );
    // The surviving key is still (re-)mirrored idempotently.
    expect(m.assetCreate).toHaveBeenCalledTimes(1);
  });

  it('skips a photo whose original object is missing, but mirrors the rest', async () => {
    m.getObjectBuffer.mockResolvedValueOnce(null);
    await mirrorApplicationPhotosToDam(baseOpts([KEY(1), KEY(2)]));
    expect(m.assetCreate).toHaveBeenCalledTimes(1);
    expect(m.assetCreate.mock.calls[0][0].data.url).toBe(KEY(2));
  });

  it('does nothing when storage is unconfigured', async () => {
    m.isStorageConfigured.mockReturnValue(false);
    await mirrorApplicationPhotosToDam(baseOpts([KEY(1)]));
    expect(m.folderFindFirst).not.toHaveBeenCalled();
    expect(m.assetCreate).not.toHaveBeenCalled();
  });

  it('resolves quietly on a malformed answer value', async () => {
    await expect(
      mirrorApplicationPhotosToDam({ ...baseOpts([]), photoUrlsAnswer: 'not-json{{' }),
    ).resolves.toBeUndefined();
    expect(m.assetCreate).not.toHaveBeenCalled();
  });

  it('never rejects even when the DB explodes mid-pass', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    m.folderFindFirst.mockRejectedValue(new Error('db down'));
    await expect(mirrorApplicationPhotosToDam(baseOpts([KEY(1)]))).resolves.toBeUndefined();
    expect(consoleErr).toHaveBeenCalled();
    consoleErr.mockRestore();
  });
});

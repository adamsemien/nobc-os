import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

/**
 * Apply photo upload — POST /api/apply/membership/upload.
 *
 * REGRESSION (P0, 2026-07-02): this route once resolved its tenant with a bare
 * unordered db.workspace.findFirst() while the create route resolved through
 * resolveDefaultApplyWorkspace() (APPLY_DEFAULT_WORKSPACE_ID, else oldest
 * workspace). In prod the two answers diverged, so photo keys were minted under
 * a foreign workspace prefix and every downstream IDOR guard (photo proxy, DAM
 * mirror) correctly refused them — photos uploaded fine but never rendered.
 *
 * These tests fail if the upload route's resolved workspace can ever diverge
 * from the create route's again: the db mock deliberately answers a bare
 * findFirst() with a DIFFERENT workspace than the resolver path, and the minted
 * key prefix must follow the resolver. The real resolveDefaultApplyWorkspace
 * runs unmocked; only db/storage/rate-limit are mocked (same pattern as
 * apply-create-route.test.ts).
 */

const m = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  wsFindFirst: vi.fn(),
  wsFindUnique: vi.fn(),
  wsFindMany: vi.fn(),
  uploadObject: vi.fn(),
  isStorageConfigured: vi.fn(),
}));

vi.mock('@/lib/public-rate-limit', () => ({ publicRateLimit: m.rateLimit }));
vi.mock('@/lib/db', () => ({
  db: {
    workspace: { findFirst: m.wsFindFirst, findUnique: m.wsFindUnique, findMany: m.wsFindMany },
  },
}));
vi.mock('@/lib/dam/storage', () => ({
  isStorageConfigured: m.isStorageConfigured,
  uploadObject: m.uploadObject,
}));

import { POST } from '@/app/api/apply/membership/upload/route';

async function postJpeg() {
  const jpeg = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 178, g: 46, b: 33 } },
  })
    .jpeg()
    .toBuffer();
  const fd = new FormData();
  fd.append('file', new File([new Uint8Array(jpeg)], 'portrait.jpg', { type: 'image/jpeg' }));
  return POST({ headers: { get: () => '1.2.3.4' }, formData: async () => fd } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  m.rateLimit.mockReturnValue({ allowed: true, retryAfterSecs: 0 });
  m.isStorageConfigured.mockReturnValue(true);
  m.uploadObject.mockResolvedValue(undefined);
  // The trap: a bare findFirst() (the old bug) answers a DIFFERENT workspace
  // than the resolver path. If the route ever regresses, the key prefix flips
  // to ws_WRONG and the assertions below fail.
  m.wsFindFirst.mockResolvedValue({ id: 'ws_WRONG' });
  m.wsFindMany.mockResolvedValue([{ id: 'ws_RIGHT' }]);
  m.wsFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === 'ws_CONFIGURED' ? { id: 'ws_CONFIGURED' } : null,
  );
  delete process.env.APPLY_DEFAULT_WORKSPACE_ID;
});

afterEach(() => {
  delete process.env.APPLY_DEFAULT_WORKSPACE_ID;
});

describe('apply upload: workspace resolution matches the create route', () => {
  it('mints the key under the resolver workspace, never a bare findFirst', async () => {
    const res = await postJpeg();
    expect(res.status).toBe(200);
    const { key } = await res.json();
    expect(key).toMatch(/^applications\/ws_RIGHT\//);
    expect(m.wsFindFirst).not.toHaveBeenCalled();
    // The R2 object lands under the same (resolver-chosen) key it returns.
    expect(m.uploadObject).toHaveBeenCalledWith(key, expect.any(Buffer), 'image/jpeg');
  });

  it('honors APPLY_DEFAULT_WORKSPACE_ID exactly like the create route (prod config)', async () => {
    process.env.APPLY_DEFAULT_WORKSPACE_ID = 'ws_CONFIGURED';
    const res = await postJpeg();
    expect(res.status).toBe(200);
    const { key } = await res.json();
    expect(key).toMatch(/^applications\/ws_CONFIGURED\//);
    expect(m.wsFindFirst).not.toHaveBeenCalled();
    expect(m.wsFindMany).not.toHaveBeenCalled();
  });

  it('source contract: upload + create routes resolve through the SAME function', () => {
    // Pins both call sites to resolveDefaultApplyWorkspace so the behavioral
    // tests above stay meaningful for the create route half of the contract.
    const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');
    const uploadSrc = read('app/api/apply/membership/upload/route.ts');
    const createSrc = read('app/api/apply/membership/route.ts');
    expect(uploadSrc).toContain('resolveDefaultApplyWorkspace()');
    expect(createSrc).toContain('resolveDefaultApplyWorkspace()');
    expect(uploadSrc).not.toMatch(/workspace\.findFirst/);
  });
});

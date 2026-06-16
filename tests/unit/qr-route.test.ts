/**
 * Tests for the public QR image endpoint GET /api/qr/[id].
 *
 * Locks the contract the confirmation/comp emails depend on:
 *   - valid rsvpId -> 200 image/png, non-empty PNG, 1-day cache header
 *   - the PNG encodes the member's door credential (memberQrCode), NOT the
 *     rsvpId, so the scanner (which matches memberQrCode) still works
 *   - unknown / malformed / QR-less members fail closed to 404, never a PNG
 *   - a DB error fails closed to 404, never a 500
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: { rSVP: { findUnique: vi.fn() } },
}));

import { db } from '@/lib/db';
import QRCode from 'qrcode';
import { GET } from '@/app/api/qr/[id]/route';

const findUnique = db.rSVP.findUnique as unknown as ReturnType<typeof vi.fn>;

function call(id: string) {
  return GET(new Request('http://localhost/api/qr/test') as never, {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/qr/[id]', () => {
  const VALID_ID = 'rsvp_abc12345';
  const DOOR_CODE = 'nobc_door_credential_xyz';

  it('valid rsvpId returns a 200 PNG with the 1-day cache header', async () => {
    findUnique.mockResolvedValue({ member: { memberQrCode: DOOR_CODE } });
    const res = await call(VALID_ID);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('public, max-age=86400');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(0);
    // PNG magic number: 89 50 4E 47
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('encodes the member door credential, not the rsvpId (indirection holds)', async () => {
    findUnique.mockResolvedValue({ member: { memberQrCode: DOOR_CODE } });
    const spy = vi.spyOn(QRCode, 'toBuffer');
    await call(VALID_ID);
    const encoded = spy.mock.calls[0]?.[0];
    expect(encoded).toBe(DOOR_CODE);
    expect(encoded).not.toBe(VALID_ID);
    spy.mockRestore();
  });

  it('unknown id returns 404, not a PNG', async () => {
    findUnique.mockResolvedValue(null);
    const res = await call(VALID_ID);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).not.toBe('image/png');
  });

  it('member without a memberQrCode returns 404', async () => {
    findUnique.mockResolvedValue({ member: { memberQrCode: null } });
    const res = await call(VALID_ID);
    expect(res.status).toBe(404);
  });

  it('malformed id returns 404 and never touches the DB', async () => {
    const res = await call('bad id!');
    expect(res.status).toBe(404);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('id shorter than the guard returns 404 without a DB call', async () => {
    const res = await call('short');
    expect(res.status).toBe(404);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('a DB error fails closed to 404, never a 500', async () => {
    findUnique.mockRejectedValue(new Error('db down'));
    const res = await call(VALID_ID);
    expect(res.status).toBe(404);
  });
});

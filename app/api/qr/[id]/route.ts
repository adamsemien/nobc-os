import { NextRequest } from 'next/server';
import QRCode from 'qrcode';
import { db } from '@/lib/db';

// qrcode needs Node (Buffer/zlib), not the Edge runtime.
export const runtime = 'nodejs';

// Bounded guard: allows cuid/cuid2/uuid id shapes, rejects junk/oversized input.
const ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

/**
 * Public, unauthenticated QR image endpoint, keyed by rsvpId.
 *
 * Confirmation/comp emails embed `<img src=".../api/qr/{rsvpId}">` because Gmail
 * and Outlook refuse to render inline `data:` URI images. We resolve the RSVP's
 * member and encode that member's `memberQrCode` — the exact value the door
 * scanner matches (see CheckInClient) — so the emailed QR stays scannable.
 *
 * Fail closed: a missing/malformed id, no matching RSVP, or a member without a
 * `memberQrCode` all return 404 — we never render an arbitrary passed-in string.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id || !ID_RE.test(id)) {
    return new Response('Not found', { status: 404 });
  }

  const rsvp = await db.rSVP.findUnique({
    where: { id },
    select: { member: { select: { memberQrCode: true } } },
  });
  if (!rsvp?.member?.memberQrCode) {
    return new Response('Not found', { status: 404 });
  }
  const memberQrCode = rsvp.member.memberQrCode;

  const png = await QRCode.toBuffer(memberQrCode, { width: 400, margin: 1, type: 'png' });
  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      // 1-day cache: lets Gmail/Outlook image proxies cache the PNG without
      // pinning a stale/voided QR for a year (revocation headroom).
      'Cache-Control': 'public, max-age=86400',
    },
  });
}

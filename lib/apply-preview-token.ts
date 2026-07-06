/** Signed capability token for the public Apply Preview (the reviewer link).
 *
 *  Mirrors lib/preview-token.ts: HMAC-SHA256 over a b64url payload, signed with
 *  the server-only CHECKIN_SECRET (reused with domain separation via the
 *  "applyprev" version tag - no new env var). A valid token renders
 *  <MembershipForm previewMode/> with NO Clerk requirement; previewMode makes the
 *  render 100% DB-effect-free (no resume, create, autosave, submit, scoring, or
 *  tagApplication), so the token grants nothing but a fixture-driven preview.
 *  There is no per-resource scope to encode - the payload is just a version tag
 *  and an expiry. Unset secret fails closed: nothing mints, nothing verifies, and
 *  the preview route's operator-session gate still works without it.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

interface ApplyPreviewPayload {
  v: "applyprev";
  exp: number; // unix seconds
}

export const APPLY_PREVIEW_TOKEN_VALID_DAYS = 14;

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function sign(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(`applyprev.${payloadB64}`).digest("base64url");
}

export function mintApplyPreviewToken(now: Date = new Date()): string | null {
  const secret = process.env.CHECKIN_SECRET;
  if (!secret) return null;
  const payload: ApplyPreviewPayload = {
    v: "applyprev",
    exp: Math.floor(now.getTime() / 1000) + APPLY_PREVIEW_TOKEN_VALID_DAYS * 24 * 3600,
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

export function verifyApplyPreviewToken(
  token: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const secret = process.env.CHECKIN_SECRET;
  if (!secret || !token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payloadB64, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as ApplyPreviewPayload;
    if (payload.v !== "applyprev") return false;
    if (payload.exp * 1000 <= now.getTime()) return false;
    return true;
  } catch {
    return false;
  }
}

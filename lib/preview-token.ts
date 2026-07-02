/** Draft-preview tokens (Event Builder Rebuild, Phase B - Locked Decision 1).
 *
 *  A signed, event-scoped, expiring capability that lets the TRUE anonymous
 *  /e/ render run against a DRAFT event - the WYSIWYG preview the builder
 *  embeds and the link an operator can hand to a reviewer. Pattern and key
 *  discipline mirror lib/check-in-token.ts: HMAC-SHA256 over a b64url
 *  payload, signed with the server-only CHECKIN_SECRET (no new env var - a
 *  deliberate reuse with domain separation via the "evprev" version tag).
 *  Unset secret fails closed: nothing mints, nothing verifies; the preview
 *  route's operator-session gate still works without it.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface PreviewTokenScope {
  workspaceId: string;
  eventId: string;
}

interface TokenPayload extends PreviewTokenScope {
  v: "evprev";
  exp: number; // unix seconds
}

export const PREVIEW_TOKEN_VALID_HOURS = 24 * 7;

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function sign(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(`evprev.${payloadB64}`).digest("base64url");
}

export function mintPreviewToken(
  scope: PreviewTokenScope,
  now: Date = new Date(),
): string | null {
  const secret = process.env.CHECKIN_SECRET;
  if (!secret) return null;
  const payload: TokenPayload = {
    v: "evprev",
    workspaceId: scope.workspaceId,
    eventId: scope.eventId,
    exp: Math.floor(now.getTime() / 1000) + PREVIEW_TOKEN_VALID_HOURS * 3600,
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

export function verifyPreviewToken(
  token: string | null | undefined,
  now: Date = new Date(),
): PreviewTokenScope | null {
  const secret = process.env.CHECKIN_SECRET;
  if (!secret || !token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payloadB64, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as TokenPayload;
    if (payload.v !== "evprev") return null;
    if (!payload.workspaceId || !payload.eventId) return null;
    if (payload.exp * 1000 <= now.getTime()) return null;
    return { workspaceId: payload.workspaceId, eventId: payload.eventId };
  } catch {
    return null;
  }
}

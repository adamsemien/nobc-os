/**
 * ShareLink token mint + public URL builder.
 *
 * Tokens are 32 random bytes encoded base64url — ~256 bits of entropy, URL-safe,
 * no padding. Public surface routes resolve them via Prisma's unique `token`
 * column. The same token is used for both sponsor (`/assets/[token]`) and member
 * gallery (`/gallery/[slug]`) URLs — the prefix is derived from `ShareLink.mode`.
 */
import { randomBytes } from 'node:crypto';
import { ShareLinkMode } from '@prisma/client';

/** 32-byte (256-bit) random token, base64url-encoded. */
export function mintShareToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Public route path for a share token, branched on share mode. */
export function shareUrlPath(mode: ShareLinkMode, token: string): string {
  return mode === ShareLinkMode.SPONSOR ? `/assets/${token}` : `/gallery/${token}`;
}

/** Absolute public URL for a share. Falls back to a relative path when APP_URL is unset. */
export function shareAbsoluteUrl(mode: ShareLinkMode, token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');
  const path = shareUrlPath(mode, token);
  return base ? `${base}${path}` : path;
}

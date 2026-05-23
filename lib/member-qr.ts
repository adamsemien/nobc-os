import { randomBytes } from 'crypto';

/**
 * Canonical member QR / scan-token generator.
 *
 * EVERY Member-creation path must mint its `memberQrCode` through this helper.
 * The offline door scanner (`app/check-in/[slug]/_components/CheckInClient.tsx`)
 * matches strictly on `memberQrCode`, so a Member created without one cannot be
 * scanned in at the door (its QR would fall back to `rsvpId` and fail the match).
 *
 * This token is a scan identifier only — it does NOT grant or change membership
 * status. A GUEST ticket buyer gets a `memberQrCode` and stays a GUEST.
 *
 * Format: 16 lowercase hex chars (8 random bytes), matching the value historically
 * minted at application approval (`lib/applications/approve.ts`).
 */
export function generateMemberQrCode(): string {
  return randomBytes(8).toString('hex');
}

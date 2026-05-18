import { PassNinjaClient } from '@passninja/passninja-js';
import { db } from './db';

// PassNinja pass type slug configured in PassNinja dashboard
const PASS_TYPE = process.env.PASSNINJA_PASS_TYPE ?? 'nobc.member';
// Event pass type — falls back to member pass type if not separately configured
const EVENT_PASS_TYPE =
  process.env.PASSNINJA_PASS_TYPE_SLUG ?? process.env.PASSNINJA_PASS_TYPE ?? 'nobc.member';

export function isPassNinjaConfigured(): boolean {
  return !!(process.env.PASSNINJA_API_KEY);
}

function getClient(): PassNinjaClient {
  const accountId = process.env.PASSNINJA_ACCOUNT_ID;
  const apiKey = process.env.PASSNINJA_API_KEY;
  if (!accountId || !apiKey) throw new Error('PassNinja env vars not set');
  return new PassNinjaClient(accountId, apiKey);
}

export interface EventPassResult {
  passUrl: string;
  passNinjaId: string;
}

/**
 * Create or retrieve an Apple Wallet pass for a given RSVP.
 * Returns a URL to the .pkpass file (redirect-compatible).
 */
export async function generateEventPass(rsvpId: string): Promise<EventPassResult | null> {
  const rsvp = await db.rSVP.findUnique({
    where: { id: rsvpId },
    select: {
      id: true,
      workspaceId: true,
      event: { select: { title: true, startAt: true, location: true } },
      member: { select: { firstName: true, lastName: true, memberQrCode: true } },
    },
  });
  if (!rsvp) return null;

  try {
    const client = getClient();
    const eventDate = rsvp.event.startAt.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
    const pass = await client.pass.create(EVENT_PASS_TYPE, {
      pass: {
        eventTitle: rsvp.event.title,
        eventDate,
        location: rsvp.event.location ?? '',
        memberName: `${rsvp.member.firstName} ${rsvp.member.lastName}`,
        barcodeMessage: rsvpId,
        backgroundColor: '#B22E21',
      },
    }) as Record<string, string>;

    const passId = pass.serialNumber ?? pass.id ?? '';
    const passUrl = pass.appleWalletUrl ?? pass.url ?? '';

    return { passUrl, passNinjaId: passId };
  } catch (err) {
    console.error('[wallet-pass] event pass generation failed:', err);
    return null;
  }
}

export interface WalletPassUrls {
  appleWalletUrl: string;
  googleWalletUrl: string;
  passNinjaId: string;
}

export async function generateMemberPass(memberId: string): Promise<WalletPassUrls | null> {
  const member = await db.member.findUnique({
    where: { id: memberId },
    select: { id: true, firstName: true, lastName: true, email: true, memberQrCode: true, workspaceId: true },
  });
  if (!member || !member.memberQrCode) return null;

  try {
    const client = getClient();
    const pass = await client.pass.create(PASS_TYPE, {
      pass: {
        memberName: `${member.firstName} ${member.lastName}`,
        memberId: member.memberQrCode,
        email: member.email,
      },
    });

    const passId = (pass as { serialNumber?: string; id?: string }).serialNumber
      ?? (pass as { id?: string }).id
      ?? '';
    const appleUrl = (pass as Record<string, string>).appleWalletUrl
      ?? (pass as Record<string, string>).url
      ?? '';
    const googleUrl = (pass as Record<string, string>).googleWalletUrl ?? '';

    if (passId) {
      await db.member.update({
        where: { id: memberId },
        data: { walletPassId: passId, passIssuedAt: new Date() },
      });
    }

    return { appleWalletUrl: appleUrl, googleWalletUrl: googleUrl, passNinjaId: passId };
  } catch (err) {
    console.error('[wallet-pass] generation failed:', err);
    return null;
  }
}

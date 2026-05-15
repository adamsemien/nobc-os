import { PassNinjaClient } from '@passninja/passninja-js';
import { db } from './db';

// PassNinja pass type slug configured in PassNinja dashboard
const PASS_TYPE = process.env.PASSNINJA_PASS_TYPE ?? 'nobc.member';

function getClient(): PassNinjaClient {
  const accountId = process.env.PASSNINJA_ACCOUNT_ID;
  const apiKey = process.env.PASSNINJA_API_KEY;
  if (!accountId || !apiKey) throw new Error('PassNinja env vars not set');
  return new PassNinjaClient(accountId, apiKey);
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

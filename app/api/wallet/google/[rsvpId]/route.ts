import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { importPKCS8, SignJWT } from 'jose';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';

function isGoogleWalletConfigured(): boolean {
  return !!(process.env.GOOGLE_WALLET_CREDENTIALS);
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ rsvpId: string }> },
) {
  if (!isGoogleWalletConfigured()) {
    return NextResponse.json({ error: 'Google Wallet not configured' }, { status: 503 });
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { rsvpId } = await params;

  // Fetch RSVP + Event + Member, workspace-scoped
  const rsvp = await db.rSVP.findUnique({
    where: { id: rsvpId },
    select: {
      id: true,
      workspaceId: true,
      event: {
        select: { title: true, startAt: true, endAt: true, location: true },
      },
      member: {
        select: { firstName: true, lastName: true },
      },
    },
  });

  if (!rsvp || rsvp.workspaceId !== workspaceId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID!;
    const classId = process.env.GOOGLE_WALLET_CLASS_ID!;
    const objectId = `${issuerId}.rsvp-${rsvpId}`;

    // Parse service account credentials
    const credentials = JSON.parse(process.env.GOOGLE_WALLET_CREDENTIALS!) as ServiceAccountKey;

    // Build the event ticket object
    const ticketObject = {
      id: objectId,
      classId: `${issuerId}.${classId}`,
      state: 'ACTIVE',
      ticketHolder: {
        name: `${rsvp.member.firstName} ${rsvp.member.lastName}`,
      },
      ticketNumber: rsvpId,
      barcode: {
        type: 'QR_CODE',
        value: rsvpId,
        alternateText: rsvpId,
      },
      hexBackgroundColor: '#B22E21',
      validTimeInterval: {
        start: { date: rsvp.event.startAt.toISOString() },
        ...(rsvp.event.endAt ? { end: { date: rsvp.event.endAt.toISOString() } } : {}),
      },
      textModulesData: [
        { header: 'Event', body: rsvp.event.title, id: 'event_title' },
        { header: 'Location', body: rsvp.event.location ?? 'TBD', id: 'location' },
      ],
    };

    // Import PKCS8 private key for RS256 signing
    const privateKey = await importPKCS8(credentials.private_key, 'RS256');

    // Sign Google Wallet JWT (iss, aud, typ are required claims)
    const token = await new SignJWT({
      iss: credentials.client_email,
      aud: 'google',
      typ: 'savetowallet',
      payload: {
        eventTicketObjects: [ticketObject],
      },
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .sign(privateKey);

    const saveUrl = `https://pay.google.com/gp/v/save/${token}`;

    // Log audit event
    await db.auditEvent.create({
      data: {
        workspaceId,
        actorId: userId,
        action: 'wallet.google_pass_created',
        entityType: 'RSVP',
        entityId: rsvpId,
        metadata: { objectId },
      },
    });

    return NextResponse.json({ saveUrl });
  } catch (err) {
    console.error('[wallet/google] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

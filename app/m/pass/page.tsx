import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';
import Image from 'next/image';

export default async function MemberPassPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) redirect('/apply');

  const member = await db.member.findFirst({
    where: { workspaceId, clerkUserId: userId },
    select: {
      firstName: true,
      lastName: true,
      memberQrCode: true,
      walletPassId: true,
      approved: true,
    },
  });

  if (!member?.approved) redirect('/apply/thanks');

  // Build QR image URL via a public QR service (no external SDK needed on client)
  const qrValue = member.memberQrCode ?? '';
  const qrImageUrl = qrValue
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrValue)}`
    : null;

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        background: 'var(--color-bg)',
        fontFamily: 'var(--font-geist-sans, system-ui, sans-serif)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 360,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          padding: '32px 24px',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            fontSize: 11,
            color: 'var(--color-text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: 8,
          }}
        >
          Member Pass
        </p>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            marginBottom: 24,
            fontFamily: "'PP Editorial New', Georgia, serif",
          }}
        >
          {member.firstName} {member.lastName}
        </h1>

        {qrImageUrl ? (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrImageUrl}
              alt="Member QR code"
              width={200}
              height={200}
              style={{ borderRadius: 8 }}
            />
          </div>
        ) : (
          <div
            style={{
              width: 200,
              height: 200,
              margin: '0 auto 24px',
              background: 'var(--color-border)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              color: 'var(--color-text-muted)',
            }}
          >
            QR not available
          </div>
        )}

        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 24 }}>
          Show this at the door to check in to events.
        </p>

        {member.walletPassId ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <a
              href={`/m/pass/apple`}
              style={{
                display: 'block',
                padding: '10px 16px',
                borderRadius: 6,
                background: '#000',
                color: '#fff',
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Add to Apple Wallet
            </a>
            <a
              href={`/m/pass/google`}
              style={{
                display: 'block',
                padding: '10px 16px',
                borderRadius: 6,
                background: '#1a73e8',
                color: '#fff',
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Add to Google Wallet
            </a>
          </div>
        ) : (
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Wallet pass will be available shortly after approval.
          </p>
        )}
      </div>
    </main>
  );
}

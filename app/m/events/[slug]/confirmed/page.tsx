import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import QRCode from 'qrcode';
import { db } from '@/lib/db';
import { QR_RENDER_COLORS } from '@/lib/page-style';
import { getMemberWorkspaceId } from '@/lib/auth';
import { MemberShellNav, MemberShellFooter } from '../../_components/MemberShell';
import ShareButton from './_components/ShareButton';

function getApplyHref(): string {
  const slug = process.env.NEXT_PUBLIC_APPLY_SLUG?.trim();
  return `/apply/${slug && slug.length > 0 ? slug : 'nobc'}`;
}

function formatEventDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Chicago',
  });
}

function formatEventTime(d: Date): string {
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
  });
}

export default async function EventConfirmedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ rsvpId?: string }>;
}) {
  const { slug } = await params;
  const { rsvpId } = await searchParams;
  const { userId } = await auth();

  if (!userId) {
    redirect('/');
  }

  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) {
    redirect('/');
  }

  // Graceful fallback — missing rsvpId
  if (!rsvpId) {
    return <FallbackPage slug={slug} applyHref={getApplyHref()} reason="missing" />;
  }

  // Fetch RSVP + event, workspace-scoped
  const rsvp = await db.rSVP.findFirst({
    where: { id: rsvpId, workspaceId },
    select: {
      id: true,
      ticketStatus: true,
      event: {
        select: {
          title: true,
          slug: true,
          startAt: true,
          endAt: true,
          location: true,
          mapsUrl: true,
        },
      },
      member: {
        select: {
          firstName: true,
          memberQrCode: true,
        },
      },
    },
  });

  if (!rsvp) {
    return <FallbackPage slug={slug} applyHref={getApplyHref()} reason="notfound" />;
  }

  const event = rsvp.event;
  const qrValue = rsvp.member.memberQrCode ?? rsvpId;
  const qrDataUrl = await QRCode.toDataURL(qrValue, {
    width: 240,
    margin: 2,
    color: QR_RENDER_COLORS,
  });

  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/m/events/${event.slug}`;
  const applyHref = getApplyHref();

  // TODO(wallet): the Apple/Google wallet CTAs below post to /api/wallet/* which
  // returns 503 until wallet passes are configured (PassNinja certs unset), so
  // today they lead to a broken "this page isn't working" target. Gate the whole
  // block on the documented go-live env so the dead CTA never renders.
  // To re-enable: set PASSNINJA_API_KEY + PASSNINJA_ACCOUNT_ID (the same step
  // that brings wallet passes live - see CLAUDE.md / README env vars).
  const walletConfigured = Boolean(
    process.env.PASSNINJA_API_KEY && process.env.PASSNINJA_ACCOUNT_ID,
  );

  return (
    <div
      style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--ev-ground, #F9F7F2)' }}
    >
      <MemberShellNav applyHref={applyHref} theme="cream" />

      <main
        style={{
          flex: 1,
          maxWidth: '480px',
          width: '100%',
          margin: '0 auto',
          padding: '48px 24px 64px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '32px',
        }}
      >
        {/* Headline */}
        <div style={{ textAlign: 'center', width: '100%' }}>
          <p
            style={{
              fontSize: '0.65rem',
              fontFamily: 'var(--font-dm-sans, DM Sans, sans-serif)',
              fontWeight: 500,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--ev-accent, #B22E21)',
              marginBottom: '12px',
            }}
          >
            You&apos;re confirmed
          </p>
          <h1
            style={{
              fontFamily: "'PP Editorial New', Georgia, serif",
              fontStyle: 'italic',
              fontSize: 'clamp(2rem, 6vw, 2.75rem)',
              fontWeight: 400,
              lineHeight: 1.1,
              color: 'var(--ev-ink, #1a1a1a)',
              margin: 0,
            }}
          >
            {event.title}
          </h1>
        </div>

        {/* Event details */}
        <div
          style={{
            width: '100%',
            borderTop: '1px solid var(--ev-rule, #E0DDD5)',
            borderBottom: '1px solid var(--ev-rule, #E0DDD5)',
            padding: '20px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <DetailRow label="Date" value={formatEventDate(event.startAt)} />
          <DetailRow label="Time" value={formatEventTime(event.startAt)} />
          {event.location && (
            <DetailRow
              label="Location"
              value={event.location}
              href={event.mapsUrl ?? undefined}
            />
          )}
        </div>

        {/* QR code */}
        <div
          style={{
            background: 'var(--ev-ground-raised, #F9F7F2)',
            borderRadius: '10px',
            border: '1px solid var(--ev-rule, #E0DDD5)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            width: '100%',
          }}
        >
          <p
            style={{
              fontSize: '0.65rem',
              fontFamily: 'var(--font-dm-sans, DM Sans, sans-serif)',
              fontWeight: 500,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--ev-muted, #888)',
              margin: 0,
            }}
          >
            Show at check-in
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt="Check-in QR code"
            width={200}
            height={200}
            style={{ borderRadius: '6px', display: 'block' }}
          />
          <p
            style={{
              fontSize: '0.65rem',
              fontFamily: 'var(--font-dm-sans, DM Sans, sans-serif)',
              color: 'var(--ev-muted, #888)',
              margin: 0,
              letterSpacing: '0.02em',
            }}
          >
            {rsvpId}
          </p>
        </div>

        {/* Wallet buttons - hidden until wallet passes are configured; see TODO(wallet) above */}
        {walletConfigured && (
        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <a
            href={`/api/wallet/apple/${rsvpId}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              padding: '14px 20px',
              // Apple Wallet badge: Apple's brand guidelines fix the black
              // button - third-party brand color, exempt from tokens.
              background: '#000',
              color: '#fff',
              borderRadius: '6px',
              textDecoration: 'none',
              fontFamily: 'var(--font-dm-sans, DM Sans, sans-serif)',
              fontSize: '0.875rem',
              fontWeight: 500,
              letterSpacing: '0.01em',
            }}
          >
            <AppleWalletIcon />
            Add to Apple Wallet
          </a>
          <a
            href={`/api/wallet/google/${rsvpId}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              padding: '14px 20px',
              // Google Wallet badge: Google's brand blue - third-party brand
              // color, exempt from tokens (logo fills below likewise).
              background: '#1a73e8',
              color: '#fff',
              borderRadius: '6px',
              textDecoration: 'none',
              fontFamily: 'var(--font-dm-sans, DM Sans, sans-serif)',
              fontSize: '0.875rem',
              fontWeight: 500,
              letterSpacing: '0.01em',
            }}
          >
            <GoogleWalletIcon />
            Add to Google Wallet
          </a>
        </div>
        )}

        {/* Share event link */}
        <ShareButton
          url={`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/m/events/${event.slug}`}
          eventTitle={event.title}
        />
      </main>

      <MemberShellFooter applyHref={applyHref} theme="cream" />
    </div>
  );
}

function DetailRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
      <span
        style={{
          fontFamily: 'var(--font-dm-sans, DM Sans, sans-serif)',
          fontSize: '0.7rem',
          fontWeight: 500,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--ev-muted, #888)',
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontFamily: 'var(--font-dm-sans, DM Sans, sans-serif)',
            fontSize: '0.9rem',
            color: 'var(--ev-accent, #B22E21)',
            textDecoration: 'underline',
            textAlign: 'right',
          }}
        >
          {value}
        </a>
      ) : (
        <span
          style={{
            fontFamily: 'var(--font-dm-sans, DM Sans, sans-serif)',
            fontSize: '0.9rem',
            color: 'var(--ev-ink, #1a1a1a)',
            textAlign: 'right',
          }}
        >
          {value}
        </span>
      )}
    </div>
  );
}

function FallbackPage({ slug, applyHref, reason }: { slug: string; applyHref: string; reason: string }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--ev-ground, #F9F7F2)' }}>
      <MemberShellNav applyHref={applyHref} theme="cream" />
      <main
        style={{
          flex: 1,
          maxWidth: '480px',
          margin: '0 auto',
          padding: '64px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontFamily: "'PP Editorial New', Georgia, serif",
            fontStyle: 'italic',
            fontSize: '2rem',
            fontWeight: 400,
            color: 'var(--ev-ink, #1a1a1a)',
          }}
        >
          {reason === 'notfound' ? "We couldn't find your registration." : 'Something went wrong.'}
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-dm-sans, DM Sans, sans-serif)',
            fontSize: '0.9rem',
            color: 'var(--ev-muted, #888)',
            maxWidth: '320px',
          }}
        >
          {reason === 'notfound'
            ? 'This confirmation link may be expired or incorrect. Check your email for your registration details.'
            : 'Return to the event page and try again.'}
        </p>
        <a
          href={`/m/events/${slug}`}
          style={{
            marginTop: '8px',
            fontFamily: 'var(--font-dm-sans, DM Sans, sans-serif)',
            fontSize: '0.8rem',
            fontWeight: 500,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--ev-accent, #B22E21)',
            textDecoration: 'none',
          }}
        >
          Back to event
        </a>
      </main>
      <MemberShellFooter applyHref={applyHref} theme="cream" />
    </div>
  );
}

function AppleWalletIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function GoogleWalletIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.56 10.738l-9.56-.01v3.284l5.507.001c-.237 1.271-.96 2.349-2.045 3.071l3.304 2.566c1.928-1.778 3.04-4.395 3.04-7.493 0-.47-.042-.925-.107-1.419z" />
      <path d="M12 22c2.7 0 4.962-.894 6.616-2.421l-3.304-2.566c-.894.6-2.04.955-3.312.955-2.547 0-4.704-1.72-5.474-4.033l-3.35 2.598C4.438 19.861 8.003 22 12 22z" fill="#34A853" />
      <path d="M6.526 13.935A5.85 5.85 0 0 1 6.2 12c0-.68.12-1.34.326-1.957L3.176 7.445A9.996 9.996 0 0 0 2 12c0 1.614.387 3.138 1.068 4.487l3.458-2.552z" fill="#FBBC05" />
      <path d="M12 6.012c1.437 0 2.727.494 3.741 1.464l2.804-2.804C16.956 3.054 14.695 2 12 2 8.003 2 4.438 4.14 2.794 7.445l3.732 2.598C7.296 7.73 9.453 6.012 12 6.012z" fill="#EA4335" />
    </svg>
  );
}

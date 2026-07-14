/**
 * GuestAccessConfirmation: transactional email for public buyer page access.
 *
 * Two variants:
 *   confirmed        : QR code image + event details
 *   pending_approval : application received, we'll be in touch
 *
 * Exported send function: sendGuestAccessConfirmation(params)
 * From: team@thenobadcompany.com (locked, do not change)
 */

import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Text,
} from 'react-email';
import * as React from 'react';
import { render } from '@react-email/render';
import { resend } from '@/lib/resend';

// Same appUrl/fallback as lib/email-templates.ts. The QR is delivered as a hosted
// HTTPS <img> (/api/qr/{rsvpId}), never a data: URI, because Gmail and Outlook
// refuse to render inline data: URI images. Fallback targets the app domain that
// hosts /api/qr, not the marketing site.
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.thenobadcompany.com';

// ── Types ────────────────────────────────────────────────────────────────────

type Variant = 'confirmed' | 'pending_approval';

interface GuestAccessConfirmationProps {
  variant: Variant;
  eventName: string;
  eventDate: Date;
  eventLocation: string | null;
  rsvpId: string;
  qrAvailable?: boolean; // only for 'confirmed': whether the member has a QR
}

// ── Template ─────────────────────────────────────────────────────────────────

export default function GuestAccessConfirmation({
  variant,
  eventName,
  eventDate,
  eventLocation,
  rsvpId,
  qrAvailable,
}: GuestAccessConfirmationProps) {
  const formattedDate = eventDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Chicago',
  });
  const formattedTime = eventDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
  });

  const isConfirmed = variant === 'confirmed';

  return (
    <Html lang="en">
      <Head />
      <Preview>
        {isConfirmed
          ? `you're on the list: ${eventName}`
          : `application received: ${eventName}`}
      </Preview>
      <Body style={body}>
        <Container style={container}>
          {/* Brand */}
          <Text style={brand}>
            <span style={{ color: '#B22E21' }}>NO BAD </span>COMPANY
          </Text>

          {/* Headline */}
          <Text style={headline}>
            {isConfirmed ? "you're on the list." : 'application received.'}
          </Text>

          {/* Event name */}
          <Text style={eventTitle}>{eventName}</Text>

          {/* Date + location */}
          <Text style={meta}>
            {formattedDate} · {formattedTime}
            {eventLocation ? ` · ${eventLocation}` : ''}
          </Text>

          <Hr style={divider} />

          {/* Confirmed variant: QR code (hosted HTTPS image, not a data: URI) */}
          {isConfirmed && qrAvailable ? (
            <>
              <Text style={paragraph}>
                Show this QR code at the door.
              </Text>
              <Img
                src={`${appUrl}/api/qr/${encodeURIComponent(rsvpId)}`}
                alt="Event access QR code"
                width={200}
                height={200}
                style={qrImage}
              />
            </>
          ) : null}

          {/* Confirmed variant: no QR (fallback) */}
          {isConfirmed && !qrAvailable ? (
            <Text style={paragraph}>
              We&apos;ll see you there. Show this email at the door if asked.
            </Text>
          ) : null}

          {/* Pending approval variant */}
          {!isConfirmed ? (
            <>
              <Text style={paragraph}>
                we&apos;ve got your application. we&apos;ll be in touch once
                it&apos;s reviewed.
              </Text>
              {qrAvailable ? (
                <>
                  <Text style={paragraph}>Show this QR at the door.</Text>
                  <Img
                    src={`${appUrl}/api/qr/${encodeURIComponent(rsvpId)}`}
                    alt="Member QR code"
                    width={200}
                    height={200}
                    style={qrImage}
                  />
                </>
              ) : null}
            </>
          ) : null}

          <Hr style={divider} />

          <Text style={signoff}>no bad company</Text>

          <Text style={footer}>
            Questions?{' '}
            <a href="mailto:team@thenobadcompany.com" style={link}>
              team@thenobadcompany.com
            </a>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// ── Inline styles (email clients don't support CSS custom properties) ─────────

const body: React.CSSProperties = {
  backgroundColor: '#F5EDE0',
  fontFamily: 'Georgia, serif',
  margin: 0,
};

const container: React.CSSProperties = {
  maxWidth: 560,
  margin: '0 auto',
  padding: '48px 24px',
};

const brand: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.18em',
  color: '#1C1008',
  margin: '0 0 40px',
  textTransform: 'uppercase',
};

const headline: React.CSSProperties = {
  fontSize: 26,
  lineHeight: '1.3',
  color: '#1C1008',
  margin: '0 0 16px',
  fontWeight: 400,
};

const eventTitle: React.CSSProperties = {
  fontSize: 20,
  lineHeight: '1.4',
  color: '#1C1008',
  margin: '0 0 8px',
  fontWeight: 400,
};

const meta: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  color: '#8B7B6E',
  margin: '0 0 0',
};

const paragraph: React.CSSProperties = {
  fontSize: 15,
  lineHeight: '1.75',
  color: '#1C1008',
  margin: '0 0 16px',
};

const qrImage: React.CSSProperties = {
  display: 'block',
  margin: '16px auto',
  borderRadius: 4,
};

const divider: React.CSSProperties = {
  borderTop: '1px solid #D4C4B4',
  margin: '32px 0',
};

const signoff: React.CSSProperties = {
  fontSize: 14,
  color: '#8B7B6E',
  lineHeight: '1.7',
  margin: '0 0 16px',
};

const footer: React.CSSProperties = {
  fontSize: 12,
  color: '#8B7B6E',
  margin: 0,
};

const link: React.CSSProperties = {
  color: '#B22E21',
  textDecoration: 'underline',
};

// ── Send function (Spine imports this) ────────────────────────────────────────

export async function sendGuestAccessConfirmation(params: {
  to: string;
  variant: 'confirmed' | 'pending_approval';
  eventName: string;
  eventDate: Date;
  eventLocation: string | null;
  rsvpId: string;
  qrAvailable?: boolean; // present only for 'confirmed'
  workspaceId: string;
}): Promise<void> {
  const { to, variant, eventName, eventDate, eventLocation, rsvpId, qrAvailable } = params;

  const html = await render(
    <GuestAccessConfirmation
      variant={variant}
      eventName={eventName}
      eventDate={eventDate}
      eventLocation={eventLocation}
      rsvpId={rsvpId}
      qrAvailable={qrAvailable}
    />,
  );

  const subject =
    variant === 'confirmed'
      ? `you're on the list: ${eventName}`
      : `application received: ${eventName}`;

  await resend.emails.send({
    from: 'No Bad Company <team@thenobadcompany.com>',
    to,
    subject,
    html,
  });
}

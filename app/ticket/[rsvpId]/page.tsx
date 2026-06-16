import { notFound } from 'next/navigation';
import {
  resolveTicketView,
  formatTicketDate,
  formatTicketTime,
} from '@/lib/ticket-view';

/**
 * Public, no-login ticket page - the safety-net target for the email fallback
 * link. Every NoBC buyer is an unauthenticated guest, so a ticket holder must
 * always be able to reach their QR here without signing in.
 *
 * PUBLIC BY OMISSION: /ticket is intentionally not in the Clerk protected
 * matcher (middleware.ts protects /m, /operator, /onboarding, /check-in,
 * /qa-panel), exactly like /api/qr.
 *
 * Fail closed: a missing / unknown / malformed rsvpId 404s via notFound(),
 * mirroring /api/qr. The member door credential never appears in markup or in a
 * URL - the QR reaches the page only as the hosted /api/qr/[rsvpId] image.
 */

const SERIF = "'PP Editorial New', Georgia, serif";
const SANS = "'Neue Haas Grotesk Display Pro', system-ui, sans-serif";

export default async function TicketPage({
  params,
}: {
  params: Promise<{ rsvpId: string }>;
}) {
  const { rsvpId } = await params;
  const ticket = await resolveTicketView(rsvpId);
  if (!ticket) notFound();

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
      }}
    >
      <main
        style={{
          flex: 1,
          width: '100%',
          maxWidth: '480px',
          margin: '0 auto',
          padding: '56px 24px 64px',
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
              fontFamily: SANS,
              fontSize: '0.65rem',
              fontWeight: 500,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--primary)',
              margin: '0 0 12px',
            }}
          >
            Your Access Pass
          </p>
          <h1
            style={{
              fontFamily: SERIF,
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: 'clamp(2rem, 6vw, 2.75rem)',
              lineHeight: 1.1,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            {ticket.eventTitle}
          </h1>
          {ticket.firstName && (
            <p
              style={{
                fontFamily: SANS,
                fontSize: '0.95rem',
                color: 'var(--text-secondary)',
                margin: '14px 0 0',
              }}
            >
              {ticket.firstName}, you are on the list.
            </p>
          )}
        </div>

        {/* Event details */}
        <div
          style={{
            width: '100%',
            borderTop: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
            padding: '20px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <DetailRow label="Date" value={formatTicketDate(ticket.startAt)} />
          <DetailRow label="Time" value={formatTicketTime(ticket.startAt)} />
          {ticket.location && <DetailRow label="Location" value={ticket.location} />}
        </div>

        {/* QR code - hosted image endpoint, never the raw credential */}
        <div
          style={{
            width: '100%',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-base)',
            boxShadow: 'var(--card-shadow)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <p
            style={{
              fontFamily: SANS,
              fontSize: '0.65rem',
              fontWeight: 500,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--text-tertiary)',
              margin: 0,
            }}
          >
            Show at check-in
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/qr/${ticket.rsvpId}`}
            alt="Check-in QR code"
            width={220}
            height={220}
            style={{ borderRadius: '6px', display: 'block' }}
          />
          <p
            style={{
              fontFamily: SANS,
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              textAlign: 'center',
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Staff will scan you in at the door.
          </p>
        </div>

        <p
          style={{
            fontFamily: SANS,
            fontSize: '0.65rem',
            letterSpacing: '0.04em',
            color: 'var(--text-tertiary)',
            margin: 0,
          }}
        >
          {ticket.rsvpId}
        </p>
      </main>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: '12px',
      }}
    >
      <span
        style={{
          fontFamily: SANS,
          fontSize: '0.7rem',
          fontWeight: 500,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--text-tertiary)',
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: SANS,
          fontSize: '0.9rem',
          color: 'var(--text-primary)',
          textAlign: 'right',
        }}
      >
        {value}
      </span>
    </div>
  );
}

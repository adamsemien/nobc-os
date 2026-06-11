import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import QRCode from 'qrcode';

type Props = {
  searchParams: Promise<{ rsvpId?: string }>;
};

export default async function PublicConfirmedPage({ searchParams }: Props) {
  const { rsvpId } = await searchParams;

  if (!rsvpId) notFound();

  // Resolve RSVP — capability URL pattern (CUID is unguessable).
  // workspaceId is derived from the RSVP row itself (F4 — never from client).
  const rsvp = await db.rSVP.findFirst({
    where: { id: rsvpId },
    select: {
      id: true,
      workspaceId: true,
      memberId: true,
      ticketStatus: true,
      guestName: true,
      guestEmail: true,
      member: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          memberQrCode: true,
        },
      },
      event: {
        select: {
          id: true,
          title: true,
          startAt: true,
          location: true,
        },
      },
    },
  });

  if (!rsvp) notFound();

  // Workspace-scope verification — confirm the RSVP belongs to its own workspace.
  const eventCheck = await db.event.findFirst({
    where: { id: rsvp.event.id, workspaceId: rsvp.workspaceId },
    select: { id: true },
  });
  if (!eventCheck) notFound();

  const { ticketStatus, member, event } = rsvp;
  const displayName = member
    ? `${member.firstName} ${member.lastName}`.trim()
    : (rsvp.guestName ?? 'Guest');

  // Waitlist position — look up THIS person's WaitlistEntry (by memberId or
  // email), scoped to the event + workspace. Never the lowest entry overall.
  let waitlistPosition: number | null = null;
  if (ticketStatus === 'waitlisted') {
    const wlEmail = rsvp.guestEmail ?? member?.email ?? null;
    const identityOr = [
      ...(rsvp.memberId ? [{ memberId: rsvp.memberId }] : []),
      ...(wlEmail ? [{ email: wlEmail }] : []),
    ];
    if (identityOr.length > 0) {
      const entry = await db.waitlistEntry.findFirst({
        where: { eventId: event.id, workspaceId: rsvp.workspaceId, OR: identityOr },
        select: { position: true },
      });
      waitlistPosition = entry?.position ?? null;
    }
  }

  // QR code SVG — only for confirmed.
  let qrSvg: string | null = null;
  const qrValue = member?.memberQrCode ?? rsvp.id;
  if (ticketStatus === 'confirmed') {
    qrSvg = await QRCode.toString(qrValue, {
      type: 'svg',
      margin: 1,
      color: { dark: '#1C1008', light: '#F5EDE0' },
    });
  }

  const eventDate = new Date(event.startAt);
  const formattedDate = eventDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const formattedTime = eventDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="flex min-h-screen flex-col bg-events-paper text-[var(--apply-ink)]">
      {/* Plain wordmark header */}
      <header className="mx-auto w-full max-w-xl px-6 pt-10 text-center">
        <Link
          href="/"
          className="text-[10px] uppercase tracking-[0.3em] text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]"
        >
          <span className="text-[var(--nobc-red)]">NO BAD </span>
          <span>COMPANY</span>
        </Link>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-6 pb-20 pt-10 text-center">
        <div className="my-10 h-px w-full bg-[var(--apply-rule)]" aria-hidden />

        {/* ── CONFIRMED ── */}
        {ticketStatus === 'confirmed' && (
          <div className="space-y-8">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
                You&apos;re on the list
              </p>
              <h1 className="mt-4 text-[clamp(2rem,5vw,3rem)] font-normal leading-[1.1] text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
                {event.title}
              </h1>
              <div className="mt-4 space-y-1">
                <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                  {formattedDate} · {formattedTime}
                </p>
                {event.location ? (
                  <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                    {event.location}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="my-8 h-px w-full bg-[var(--apply-rule)]" aria-hidden />

            {/* QR code */}
            {qrSvg ? (
              <div className="flex flex-col items-center gap-4">
                <div
                  className="text-[var(--apply-ink)] [&_svg]:h-auto [&_svg]:max-w-[200px]"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
                <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                  Show at the door
                </p>
              </div>
            ) : null}

            <p className="text-[14px] leading-[1.8] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
              We&apos;ll see you there, {displayName.split(' ')[0]}.
            </p>
          </div>
        )}

        {/* ── PENDING APPROVAL / HELD ── */}
        {(ticketStatus === 'pending_approval' || ticketStatus === 'held') && (
          <div className="space-y-6">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
                Application received
              </p>
              <h1 className="mt-4 text-[clamp(2rem,5vw,3rem)] font-normal leading-[1.1] text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
                {event.title}
              </h1>
              <div className="mt-4 space-y-1">
                <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                  {formattedDate} · {formattedTime}
                </p>
                {event.location ? (
                  <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                    {event.location}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="my-8 h-px w-full bg-[var(--apply-rule)]" aria-hidden />

            <p className="text-[16px] leading-[1.8] text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
              You&apos;ve applied to attend. We&apos;ll be in touch.
            </p>

            {/* R9 — required line for TICKETED + approvalRequired (held) */}
            {ticketStatus === 'held' && (
              <p className="text-[13px] leading-[1.7] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                Your card is authorized and will be captured once your application is approved.
              </p>
            )}

            <p className="text-[13px] leading-[1.7] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
              Questions? Reach us at{' '}
              <a
                href="mailto:team@thenobadcompany.com"
                className="underline underline-offset-4 transition-colors hover:text-[var(--nobc-red)]"
              >
                team@thenobadcompany.com
              </a>
            </p>
          </div>
        )}

        {/* ── WAITLISTED ── */}
        {ticketStatus === 'waitlisted' && (
          <div className="space-y-6">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
                You&apos;re on the waitlist
              </p>
              <h1 className="mt-4 text-[clamp(2rem,5vw,3rem)] font-normal leading-[1.1] text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
                {event.title}
              </h1>
              <div className="mt-4 space-y-1">
                <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                  {formattedDate} · {formattedTime}
                </p>
                {event.location ? (
                  <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                    {event.location}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="my-8 h-px w-full bg-[var(--apply-rule)]" aria-hidden />

            {waitlistPosition != null ? (
              <p className="text-[16px] leading-[1.8] text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
                You&apos;re #{waitlistPosition} on the waitlist.
              </p>
            ) : (
              <p className="text-[16px] leading-[1.8] text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
                You&apos;re on the waitlist.
              </p>
            )}

            <p className="text-[13px] leading-[1.7] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
              We&apos;ll reach out if a spot opens up. Questions?{' '}
              <a
                href="mailto:team@thenobadcompany.com"
                className="underline underline-offset-4 transition-colors hover:text-[var(--nobc-red)]"
              >
                team@thenobadcompany.com
              </a>
            </p>
          </div>
        )}

        <div className="mt-16 h-px w-full bg-[var(--apply-rule)]" aria-hidden />

        <footer className="mt-6">
          <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            <span className="text-[var(--nobc-red)]">NO BAD </span>
            <span>COMPANY</span>
          </p>
          <a
            href="mailto:team@thenobadcompany.com"
            className="mt-3 inline-block text-[13px] text-[var(--apply-muted)] underline-offset-4 transition-colors hover:text-[var(--nobc-red)] hover:underline font-[family-name:var(--font-dm-sans)]"
          >
            team@thenobadcompany.com
          </a>
        </footer>
      </main>
    </div>
  );
}

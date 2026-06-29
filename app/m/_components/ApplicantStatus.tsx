import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { resolvePendingApplicationForAccount } from '@/lib/apply-account-link';

/**
 * Status-aware landing for a signed-in applicant (the orgless "buyer/applicant"
 * persona who has no member portal yet). Renders ONE of five states from the
 * caller's own application row. Self-contained server component — does its own
 * auth + read — so it can be mounted wherever the orgless applicant lands.
 *
 * Resolution (without changing the shared resolver's signature, which
 * app/apply/page.tsx depends on):
 *  1. resolvePendingApplicationForAccount — the canonical claim-by-clerkUserId
 *     OR verified-email match. It returns only { id } and only for PENDING rows,
 *     so on a hit we re-read that row for { status, aiScore }.
 *  2. On a miss (no PENDING match) we do a direct clerkUserId read that returns
 *     status, so a DECIDED application (rejected / declined / waitlisted / hold)
 *     is detected and never mistaken for "no application." An invitation-only
 *     club must not invite a declined applicant to reapply.
 *
 * Known boundary: a legacy application that was created fully anonymously (cookie
 * only, no clerkUserId ever stamped) and then DECIDED before the applicant made
 * an account is reachable by neither path and would fall to the "no application"
 * state. Go-forward this cannot happen — the account-first apply flow stamps
 * clerkUserId at creation — so this only affects pre-account-flow legacy rows.
 */

const displayFont = "'PP Editorial New', Georgia, serif";
const bodyFont = "'Neue Haas Grotesk Display Pro', 'Helvetica Neue', Arial, sans-serif";

type ApplicantView = {
  heading: string;
  body: string;
  cta?: { label: string; href: string };
};

function selectView(
  app: { status: string; aiScore: number | null } | null,
): ApplicantView {
  if (!app) {
    return {
      heading: 'Your seat is waiting.',
      body: "You haven't started an application yet. It takes about ten minutes, and we read every word.",
      cta: { label: 'Start your application', href: '/apply' },
    };
  }

  if (app.status === 'PENDING') {
    if (app.aiScore === null) {
      return {
        heading: 'Pick up where you left off.',
        body: "Your application is saved as a draft. Your answers are waiting whenever you're ready to finish.",
        cta: { label: 'Continue your application', href: '/apply' },
      };
    }
    return {
      heading: 'Application received.',
      body: "Thank you. We have your application and it's in review. We'll be in touch by email, so keep an eye on your inbox.",
    };
  }

  if (app.status === 'APPROVED') {
    return {
      heading: "You're a member.",
      body: 'Welcome to No Bad Company. Your member home is where everything lives.',
      cta: { label: 'Go to your member home', href: '/m' },
    };
  }

  // REJECTED / DECLINED / WAITLISTED / HOLD — one neutral, graceful state. No
  // reapply CTA, no raw status shown, warm but with no false promise.
  return {
    heading: 'Thank you for applying.',
    body: "Your application to No Bad Company has been reviewed. If there's a next step, we'll reach out to you directly by email.",
  };
}

export default async function ApplicantStatus() {
  const { userId } = await auth();

  let app: { status: string; aiScore: number | null } | null = null;
  if (userId) {
    const pending = await resolvePendingApplicationForAccount(userId);
    if (pending) {
      app = await db.application.findUnique({
        where: { id: pending.id },
        select: { status: true, aiScore: true },
      });
    } else {
      app = await db.application.findFirst({
        where: { clerkUserId: userId },
        orderBy: { createdAt: 'desc' },
        select: { status: true, aiScore: true },
      });
    }
  }

  const view = selectView(app);

  return (
    <div
      style={{
        background: 'var(--bg)',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(48px, 8vw, 96px) 24px',
      }}
    >
      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
        <span
          style={{
            fontFamily: bodyFont,
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--primary)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            display: 'block',
            marginBottom: 16,
          }}
        >
          Membership
        </span>
        <h1
          style={{
            fontFamily: displayFont,
            fontSize: 'clamp(30px, 4.5vw, 44px)',
            fontStyle: 'italic',
            lineHeight: 1.12,
            color: 'var(--text-primary)',
            margin: '0 0 16px 0',
          }}
        >
          {view.heading}
        </h1>
        <p
          style={{
            fontFamily: bodyFont,
            fontSize: 15,
            lineHeight: 1.6,
            color: 'var(--text-secondary)',
            margin: '0 0 32px 0',
          }}
        >
          {view.body}
        </p>
        {view.cta && (
          <Link
            href={view.cta.href}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: bodyFont,
              fontSize: 14,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#ffffff',
              background: 'var(--primary)',
              border: 'none',
              borderRadius: 0,
              padding: '0 32px',
              height: 52,
              textDecoration: 'none',
            }}
          >
            {view.cta.label}
          </Link>
        )}
      </div>
    </div>
  );
}

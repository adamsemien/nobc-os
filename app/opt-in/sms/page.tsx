import type { Metadata } from 'next';
import { verifyOptInToken } from '@/lib/opt-in/token';
import { buildDisclosureText, DISCLOSURE_VERSION } from '@/lib/opt-in/disclosure';
import { db } from '@/lib/db';
import { OptInForm } from './OptInForm';

/**
 * /opt-in/sms — first-party SMS express-written-consent page (TCPA/CTIA).
 *
 * Public by middleware omission (not under /m, /operator, etc.). Path A
 * arrives with ?t=<signed token> binding a known Person; any token failure
 * silently degrades to the cold form. The disclosure block below the form is
 * legally mandated content, rendered adjacent to the consent action and
 * snapshotted verbatim into the ConsentArtifact server-side at submit.
 */

export const metadata: Metadata = {
  title: 'Text updates — No Bad Company',
  robots: { index: false },
};

export default async function SmsOptInPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;

  // Token greeting only — binding is re-verified server-side at submit; a bad
  // token here just means the anonymous form (no error, no hint).
  let firstName: string | null = null;
  const scope = verifyOptInToken(t);
  if (scope) {
    const person = await db.person.findFirst({
      where: { id: scope.personId, workspaceId: scope.workspaceId },
      select: { firstName: true },
    });
    firstName = person?.firstName ?? null;
  }

  const disclosureText = buildDisclosureText(process.env.MARKETING_TWILIO_PHONE_NUMBER ?? null);

  return (
    <main style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '88px 24px 64px' }}>
        <p
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--primary)',
            margin: 0,
          }}
        >
          No Bad Company
        </p>
        <h1
          style={{
            fontFamily: "'PP Editorial New', Georgia, serif",
            fontStyle: 'italic',
            fontWeight: 300,
            fontSize: 40,
            lineHeight: 1.15,
            margin: '14px 0 0',
          }}
        >
          {/* CHLOE: page headline. Placeholder only. */}
          {firstName ? `${firstName}, stay in the loop.` : 'Stay in the loop.'}
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--text-secondary)', margin: '18px 0 0' }}>
          {/* CHLOE: intro copy above the form. Placeholder only. */}
          Get texts about gatherings before anyone else — invitations, announcements, reminders.
        </p>

        <OptInForm
          token={scope ? t ?? null : null}
          knownPerson={Boolean(scope)}
          disclosureText={disclosureText}
          disclosureVersion={DISCLOSURE_VERSION}
        />
      </div>
    </main>
  );
}

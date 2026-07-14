/** Renders all five emails/ components with pinned fixtures and writes the HTML +
 *  plain-text output to a directory, so a dependency upgrade can be byte-diffed
 *  against a pre-upgrade baseline (React Email 6 migration checkpoint).
 *
 *  Usage:
 *    NEXT_PUBLIC_APP_URL=https://app.thenobadcompany.com \
 *      npx tsx scripts/smoke-render-emails.tsx /tmp/email-baseline
 *
 *  NEXT_PUBLIC_APP_URL must be set on the command line (module-level consts in the
 *  email components read it at import time). Fixtures are fixed values - output is
 *  deterministic, any diff between runs is a real render change.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as React from 'react';
import { render } from '@react-email/render';

import WelcomeEmail from '../emails/WelcomeEmail';
import WaitlistEmail from '../emails/WaitlistEmail';
import DeclineEmail from '../emails/DeclineEmail';
import EventCancelledEmail from '../emails/EventCancelledEmail';
import GuestAccessConfirmation from '../emails/GuestAccessConfirmation';

const outDir = process.argv[2];
if (!outDir) {
  console.error('usage: tsx scripts/smoke-render-emails.tsx <out-dir>');
  process.exit(1);
}

const FIXTURES: Record<string, React.ReactElement> = {
  welcome: <WelcomeEmail name="Jordan Ellis" archetype="Connector" />,
  waitlist: <WaitlistEmail name="Jordan Ellis" />,
  decline: <DeclineEmail name="Jordan Ellis" />,
  'event-cancelled': (
    <EventCancelledEmail name="Jordan Ellis" eventTitle="The Line" dateStr="Friday, June 5" />
  ),
  'guest-access-confirmed': (
    <GuestAccessConfirmation
      variant="confirmed"
      eventName="The Line"
      eventDate={new Date('2026-08-14T19:00:00-05:00')}
      eventLocation="The Green Room"
      rsvpId="rsvp_smoke_1"
      qrAvailable
    />
  ),
  'guest-access-pending': (
    <GuestAccessConfirmation
      variant="pending_approval"
      eventName="The Line"
      eventDate={new Date('2026-08-14T19:00:00-05:00')}
      eventLocation="The Green Room"
      rsvpId="rsvp_smoke_1"
    />
  ),
};

async function main() {
  mkdirSync(outDir, { recursive: true });
  for (const [name, element] of Object.entries(FIXTURES)) {
    const html = await render(element);
    const text = await render(element, { plainText: true });
    writeFileSync(join(outDir, `${name}.html`), html);
    writeFileSync(join(outDir, `${name}.txt`), text);
    console.log(`rendered ${name} (${html.length} bytes html, ${text.length} bytes text)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

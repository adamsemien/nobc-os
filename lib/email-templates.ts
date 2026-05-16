const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://thenobadcompany.com';

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  });
}

export function rsvpConfirmedEmail(
  name: string,
  eventTitle: string,
  startAt: Date,
  location: string | null | undefined,
  eventSlug: string,
  rsvpId: string,
): { subject: string; html: string } {
  const locationLine = location ? `<p><strong>Location:</strong> ${location}</p>` : '';
  const verifyUrl = `${appUrl}/check-in/verify/${rsvpId}`;
  return {
    subject: `You're in — ${eventTitle}`,
    html: `<p>Hi ${name},</p>
<p>You're confirmed for <strong>${eventTitle}</strong>.</p>
<p><strong>Date:</strong> ${formatDate(startAt)}</p>
${locationLine}
<p>Show this link at check-in and staff will scan you in:<br><a href="${verifyUrl}">${verifyUrl}</a></p>
<p>See you there — The NoBC Team</p>`,
  };
}

export function compTicketEmail(
  name: string,
  eventTitle: string,
  startAt: Date,
  location: string | null | undefined,
  rsvpId: string,
  qrDataUrl: string,
): { subject: string; html: string } {
  const locationLine = location ? `<p><strong>Location:</strong> ${location}</p>` : '';
  const verifyUrl = `${appUrl}/check-in/verify/${rsvpId}`;
  return {
    subject: `Your invitation — ${eventTitle}`,
    html: `<p>Hi ${name},</p>
<p>You're confirmed for <strong>${eventTitle}</strong> — this one's on us.</p>
<p><strong>Date:</strong> ${formatDate(startAt)}</p>
${locationLine}
<p>Show this QR code at the door and staff will scan you in:</p>
<p><img src="${qrDataUrl}" alt="Check-in QR code" width="200" height="200" style="border-radius:8px;" /></p>
<p>Can't load the image? Use this link instead:<br><a href="${verifyUrl}">${verifyUrl}</a></p>
<p>See you there — The NoBC Team</p>`,
  };
}

export function applicationApprovedEmail(
  name: string,
): { subject: string; html: string } {
  return {
    subject: 'Welcome to No Bad Company',
    html: `<p>Hi ${name},</p>
<p>You're in. Welcome to No Bad Company.</p>
<p>You're now a member of a community built around good people and great experiences. Check the app for upcoming events — we'll see you there.</p>
<p>— The NoBC Team</p>`,
  };
}

export function applicationRejectedEmail(
  name: string,
): { subject: string; html: string } {
  return {
    subject: 'Your NoBC Application',
    html: `<p>Hi ${name},</p>
<p>Thank you for taking the time to apply to No Bad Company.</p>
<p>After careful consideration, we don't think the community is the right fit at this time. That said, things change — keep an eye out for future opportunities.</p>
<p>We appreciate your interest and wish you well.</p>
<p>— The NoBC Team</p>`,
  };
}

export function waitlistPromotedEmail(
  name: string,
  eventTitle: string,
  eventSlug: string,
): { subject: string; html: string } {
  const eventUrl = `${appUrl}/m/events/${eventSlug}`;
  return {
    subject: `Good news — a spot just opened for ${eventTitle}`,
    html: `<p>Hi ${name},</p>
<p>A spot just opened up for <strong>${eventTitle}</strong>. You have 24 hours to claim it before it moves to the next person on the list.</p>
<p><a href="${eventUrl}">Claim your spot →</a></p>
<p>— The NoBC Team</p>`,
  };
}

export function welcomeEmail(
  fullName: string,
  opts?: { appleWalletUrl?: string; googleWalletUrl?: string },
): { subject: string; html: string } {
  const passSection = opts?.appleWalletUrl
    ? `
<p>Your member pass is ready — add it to your wallet so staff can scan you in at events:</p>
${opts.appleWalletUrl ? `<p><a href="${opts.appleWalletUrl}" style="display:inline-block;background:#000;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px;">Add to Apple Wallet</a></p>` : ''}
${opts.googleWalletUrl ? `<p><a href="${opts.googleWalletUrl}" style="display:inline-block;background:#1a73e8;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px;">Add to Google Wallet</a></p>` : ''}
`
    : '';

  return {
    subject: "You're in.",
    html: `<p>Hi ${fullName},</p>

<p>Welcome to No Bad Company.</p>

<p>You're officially a member. We'll be in touch with event invites and what's coming up — keep an eye on your inbox.</p>
${passSection}
<p>See you soon.</p>

<p>— The NoBC Team</p>`,
  };
}

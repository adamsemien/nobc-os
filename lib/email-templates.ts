// Fallback targets the app domain (which hosts /api/qr), NOT the marketing site,
// so an unset NEXT_PUBLIC_APP_URL can't point the email QR <img> at a route-less host.
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.thenobadcompany.com';

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
  qrAvailable?: boolean,
): { subject: string; html: string } {
  const locationLine = location ? `<p><strong>Location:</strong> ${location}</p>` : '';
  const confirmedUrl = `${appUrl}/m/events/${eventSlug}/confirmed?rsvpId=${rsvpId}`;
  const dateStr = startAt.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/New_York',
  });
  const timeStr = startAt.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  });
  const qrBlock = qrAvailable
    ? `<p>Show this QR code at the door and staff will scan you in:</p>
<p><img src="${appUrl}/api/qr/${encodeURIComponent(rsvpId)}" alt="Check-in QR code" width="200" height="200" style="border-radius:8px;" /></p>
<p>Can't load the image? Use this link instead:<br><a href="${confirmedUrl}">${confirmedUrl}</a></p>`
    : `<p>Your ticket and QR code are at the link below. Show it at the door and staff will scan you in.</p>
<p><a href="${confirmedUrl}">${confirmedUrl}</a></p>`;
  return {
    subject: `you're in: ${eventTitle}`,
    html: `<p>Hi ${name},</p>

<p>You're confirmed for <strong>${eventTitle}</strong>.</p>

<p><strong>Date:</strong> ${dateStr}<br><strong>Time:</strong> ${timeStr}</p>
${locationLine}
${qrBlock}

<p>adam &amp; chloe</p>`,
  };
}

export function compTicketEmail(
  name: string,
  eventTitle: string,
  startAt: Date,
  location: string | null | undefined,
  rsvpId: string,
): { subject: string; html: string } {
  const locationLine = location ? `<p><strong>Location:</strong> ${location}</p>` : '';
  const verifyUrl = `${appUrl}/check-in/verify/${rsvpId}`;
  return {
    subject: `Your invitation: ${eventTitle}`,
    html: `<p>Hi ${name},</p>
<p>You're confirmed for <strong>${eventTitle}</strong>. This one's on us.</p>
<p><strong>Date:</strong> ${formatDate(startAt)}</p>
${locationLine}
<p>Show this QR code at the door and staff will scan you in:</p>
<p><img src="${appUrl}/api/qr/${encodeURIComponent(rsvpId)}" alt="Check-in QR code" width="200" height="200" style="border-radius:8px;" /></p>
<p>Can't load the image? Use this link instead:<br><a href="${verifyUrl}">${verifyUrl}</a></p>
<p>See you there.</p>
<p>adam &amp; chloe</p>`,
  };
}

export function applicationApprovedEmail(
  name: string,
): { subject: string; html: string } {
  return {
    subject: 'Welcome to No Bad Company',
    html: `<p>Hi ${name},</p>
<p>You're in. Welcome to No Bad Company.</p>
<p>You're now a member of a community built around good people and great experiences. Check the app for upcoming events. We'll see you there.</p>
<p>adam &amp; chloe</p>`,
  };
}

export function applicationRejectedEmail(
  name: string,
): { subject: string; html: string } {
  return {
    subject: 'Your NoBC Application',
    html: `<p>Hi ${name},</p>
<p>Thank you for taking the time to apply to No Bad Company.</p>
<p>After careful consideration, we don't think the community is the right fit at this time. That said, things change. Keep an eye out for future opportunities.</p>
<p>We appreciate your interest and wish you well.</p>
<p>adam &amp; chloe</p>`,
  };
}

export function waitlistPromotedEmail(
  name: string,
  eventTitle: string,
  eventSlug: string,
): { subject: string; html: string } {
  const eventUrl = `${appUrl}/m/events/${eventSlug}`;
  return {
    subject: `Good news: a spot just opened for ${eventTitle}`,
    html: `<p>Hi ${name},</p>
<p>A spot just opened up for <strong>${eventTitle}</strong>. You have 24 hours to claim it before it moves to the next person on the list.</p>
<p><a href="${eventUrl}">Claim your spot →</a></p>
<p>adam &amp; chloe</p>`,
  };
}

export function welcomeEmail(
  fullName: string,
  opts?: { appleWalletUrl?: string; googleWalletUrl?: string },
): { subject: string; html: string } {
  const passSection = opts?.appleWalletUrl
    ? `
<p>Your member pass is ready. Add it to your wallet so staff can scan you in at events:</p>
${opts.appleWalletUrl ? `<p><a href="${opts.appleWalletUrl}" style="display:inline-block;background:#000;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px;">Add to Apple Wallet</a></p>` : ''}
${opts.googleWalletUrl ? `<p><a href="${opts.googleWalletUrl}" style="display:inline-block;background:#1a73e8;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px;">Add to Google Wallet</a></p>` : ''}
`
    : '';

  return {
    subject: "You're in.",
    html: `<p>Hi ${fullName},</p>

<p>Welcome to No Bad Company.</p>

<p>You're officially a member. We'll be in touch with event invites and what's coming up. Keep an eye on your inbox.</p>
${passSection}
<p>See you soon.</p>

<p>adam &amp; chloe</p>`,
  };
}

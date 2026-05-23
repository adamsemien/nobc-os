import twilio from 'twilio';

// House Phone outbound sends. nobc-os only sends replies via the Twilio REST
// API; inbound SMS is handled by a separate Railway service (see the Twilio
// override note in CLAUDE.md). Client is null until TWILIO_* is configured so
// builds/dev stay green without credentials.
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

export const twilioClient =
  accountSid && authToken ? twilio(accountSid, authToken) : null;

/** Send an SMS via the Twilio REST API. Throws if Twilio isn't configured. */
export async function sendSms(to: string, body: string): Promise<void> {
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!twilioClient || !from) {
    throw new Error(
      'Twilio not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER)',
    );
  }
  await twilioClient.messages.create({ to, from, body });
}

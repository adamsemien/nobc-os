import twilio from 'twilio';

// House Phone outbound sends. nobc-os only sends replies via the Twilio REST
// API; inbound SMS is handled by a separate Railway service (see the Twilio
// override note in CLAUDE.md). Client is null until TWILIO_* is configured so
// builds/dev stay green without credentials.
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

export const twilioClient =
  accountSid && authToken ? twilio(accountSid, authToken) : null;

/**
 * Thrown when a send fails because the recipient has opted out of SMS (replied
 * STOP). This is an expected compliance outcome, NOT a system failure — callers
 * should surface it to the operator plainly and must not fire an error alert.
 */
export class SmsOptedOutError extends Error {
  constructor(message = 'Recipient has opted out of SMS (replied STOP)') {
    super(message);
    this.name = 'SmsOptedOutError';
  }
}

/**
 * Twilio returns error code 21610 when you attempt to message a number that has
 * sent STOP to your sender. Detect it structurally without depending on the SDK
 * surfacing a typed error.
 */
export function isTwilioOptOut(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: unknown }).code === 21610
  );
}

/**
 * Send an SMS via the Twilio REST API. Throws if Twilio isn't configured, and
 * throws {@link SmsOptedOutError} if the recipient has opted out (STOP).
 */
export async function sendSms(to: string, body: string): Promise<void> {
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!twilioClient || !from) {
    throw new Error(
      'Twilio not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER)',
    );
  }
  try {
    await twilioClient.messages.create({ to, from, body });
  } catch (e) {
    if (isTwilioOptOut(e)) throw new SmsOptedOutError();
    throw e;
  }
}

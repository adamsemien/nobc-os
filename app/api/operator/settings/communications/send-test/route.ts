import { currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requirePermission } from '@/lib/operator-role';
import { sendTemplatedEmail } from '@/lib/email';
import { SAMPLE_EMAIL_DATA } from '@/lib/email-sample-data';

/** Send a template to the CURRENTLY-AUTHENTICATED operator's own email with
 *  the shared sample data. Deliberately narrow:
 *   - recipient comes from the Clerk session, NEVER the request body
 *   - no identities arg → TransactionalEmailLog rows get memberId/personId
 *     null, so the Resend webhook can never emit a MemberEngagementEvent
 *     for a test send
 *   - template keys are allow-listed to the rich-editor slice
 */

const BodySchema = z.object({
  templateKey: z.literal('event.reminder'),
});

export async function POST(req: NextRequest) {
  const gate = await requirePermission('settings.edit');
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const user = await currentUser();
  const email =
    user?.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress;
  if (!email) return NextResponse.json({ error: 'No email on your operator account' }, { status: 400 });

  const result = await sendTemplatedEmail(workspaceId, parsed.data.templateKey, email, SAMPLE_EMAIL_DATA);
  if (!result.ok) {
    const status = result.reason === 'send_failed' ? 502 : 409;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return NextResponse.json({ ok: true, to: email });
}

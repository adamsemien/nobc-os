/** Clerk webhook — Person spine first-touch for account creation (Phase 2A).
 *
 * `user.created` mints (or resolves) a Person so account-only humans exist in
 * the CRM from their very first touch. The Clerk-reported primary email is the
 * one identity-provider-proven address in the system: it arrives with a
 * verification status, and only `verified` passes emailVerified=true into
 * resolvePerson.
 *
 * FAIL-CLOSED tenancy (locked at Gate 1 review): the target workspace comes
 * ONLY from APPLY_DEFAULT_WORKSPACE_ID, set explicitly by Adam. There is NO
 * oldest-workspace fallback — a junk workspace exists in this database and a
 * fallback could mint Persons into it. Unset env → verify, log, skip.
 *
 * Setup (Adam): create a webhook endpoint in the Clerk dashboard pointing at
 * /api/webhooks/clerk, subscribe to `user.created`, and set its signing secret
 * as CLERK_WEBHOOK_SECRET in Vercel.
 */
import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { db } from '@/lib/db';
import { resolvePerson } from '@/lib/crm/resolve-person';
import { logEngagementEvent } from '@/lib/engagement';

type ClerkEmailAddress = {
  id: string;
  email_address: string;
  verification?: { status?: string } | null;
};

type ClerkUserCreatedEvent = {
  type: string;
  data: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    primary_email_address_id?: string | null;
    email_addresses?: ClerkEmailAddress[];
  };
};

export async function POST(req: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed: without the signing secret nothing can be verified.
    console.error('[clerk-webhook] CLERK_WEBHOOK_SECRET unset — rejecting (fail-closed)');
    return new NextResponse('Webhook not configured', { status: 401 });
  }

  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return new NextResponse('Missing svix headers', { status: 401 });
  }

  const payload = await req.text();
  let event: ClerkUserCreatedEvent;
  try {
    event = new Webhook(secret).verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkUserCreatedEvent;
  } catch (err) {
    console.error('[clerk-webhook] signature verification failed:', err);
    return new NextResponse('Invalid signature', { status: 401 });
  }

  if (event.type !== 'user.created') {
    return NextResponse.json({ received: true });
  }

  const workspaceId = process.env.APPLY_DEFAULT_WORKSPACE_ID;
  if (!workspaceId) {
    // Fail closed: NEVER fall back to "oldest workspace" — log + skip. 200 so
    // Clerk does not retry-storm a deliberate configuration gate.
    console.error(
      '[clerk-webhook] APPLY_DEFAULT_WORKSPACE_ID unset — skipping Person mint for user=%s (fail-closed, no fallback)',
      event.data.id,
    );
    return NextResponse.json({ received: true, skipped: 'no_default_workspace' });
  }

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true },
  });
  if (!workspace) {
    console.error(
      '[clerk-webhook] APPLY_DEFAULT_WORKSPACE_ID=%s does not match a workspace — skipping (fail-closed)',
      workspaceId,
    );
    return NextResponse.json({ received: true, skipped: 'workspace_not_found' });
  }

  const user = event.data;
  const primaryEmail =
    user.email_addresses?.find((e) => e.id === user.primary_email_address_id) ??
    user.email_addresses?.[0];
  const email = primaryEmail?.email_address?.trim().toLowerCase() || null;
  const emailVerified = primaryEmail?.verification?.status === 'verified';

  try {
    const person = await resolvePerson({
      workspaceId,
      clerkUserId: user.id,
      email,
      emailVerified,
      firstName: user.first_name,
      lastName: user.last_name,
      source: 'clerk',
      sourceExternalId: user.id,
    });
    void logEngagementEvent({
      workspaceId,
      personId: person.id,
      eventType: 'account_created',
      metadata: { via: 'clerk_webhook', emailVerified },
    });
  } catch (err) {
    // Log with enough context to replay by hand; 200 keeps Clerk from
    // retry-storming a persistent failure (the claim flow is the backstop).
    console.error('[clerk-webhook] person mint failed for user=%s:', user.id, err);
  }

  return NextResponse.json({ received: true });
}

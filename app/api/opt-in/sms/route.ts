import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { publicRateLimit } from '@/lib/public-rate-limit';
import { resolveDefaultApplyWorkspace } from '@/lib/apply-workspace';
import { verifyOptInToken } from '@/lib/opt-in/token';
import { toE164 } from '@/lib/opt-in/phone';
import { isKnownZip } from '@/lib/opt-in/zip-timezone';
import { buildDisclosureText, DISCLOSURE_VERSION } from '@/lib/opt-in/disclosure';
import { recordSmsOptIn, type OptInBinding } from '@/lib/opt-in/record';

/**
 * POST /api/opt-in/sms — first-party SMS express-written-consent capture.
 *
 * PUBLIC (outside every Clerk-protected matcher; deliberately NOT under
 * /api/sms/*, which is House Phone's Clerk-org-gated namespace). Two paths:
 *
 *  PATH A (token): the request carries a signed opt-in token identifying a
 *    known Person — consent binds to that Person, no matching, no minting.
 *    ANY token failure silently degrades to Path B.
 *  PATH B (cold): resolvePerson once, strict identity policy as designed —
 *    the merge queue catches duplicates.
 *
 * The disclosure text is REBUILT SERVER-SIDE from the versioned constant at
 * submit time (never trusted from the client) and snapshotted verbatim into
 * the ConsentArtifact.
 */

const BodySchema = z.object({
  phone: z.string().trim().min(10).max(30),
  postalCode: z.string().trim().regex(/^\d{5}(-\d{4})?$/, 'Enter a 5-digit US ZIP code.'),
  consent: z.literal(true),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal('')),
  token: z.string().max(2048).optional(),
  /** Honeypot — humans never see it; any value = silent accept, no write. */
  website: z.string().optional(),
});

/** Follow a soft-merge pointer to the canonical Person (capped against cycles,
 *  mirrors resolvePerson's own followMergedInto). */
async function followMerged(personId: string, workspaceId: string) {
  let current = await db.person.findFirst({
    where: { id: personId, workspaceId },
    select: { id: true, phone: true, potentialDuplicateOfId: true, mergedIntoId: true },
  });
  for (let hops = 0; current?.mergedIntoId && hops < 10; hops++) {
    const next = await db.person.findFirst({
      where: { id: current.mergedIntoId, workspaceId },
      select: { id: true, phone: true, potentialDuplicateOfId: true, mergedIntoId: true },
    });
    if (!next) break;
    current = next;
  }
  return current;
}

export async function POST(req: NextRequest) {
  const rateCheck = publicRateLimit(req, { bucket: 'sms-optin', max: 10 });
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfterSecs) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 422 },
    );
  }
  const input = parsed.data;

  // Honeypot filled = bot. Accept silently, write nothing.
  if (input.website) return NextResponse.json({ ok: true });

  const e164 = toE164(input.phone);
  if (!e164) {
    return NextResponse.json({ error: 'Enter a valid US phone number.' }, { status: 422 });
  }
  const postalCode = input.postalCode.slice(0, 5);
  if (!isKnownZip(postalCode)) {
    return NextResponse.json({ error: 'Enter a valid US ZIP code.' }, { status: 422 });
  }

  // ── Bind the Person ────────────────────────────────────────────────────────
  // Path A: valid token → that Person, always. Any verify failure (tampered,
  // expired, malformed) returns null and we fall through to Path B, silently.
  let binding: OptInBinding = 'cold';
  let workspaceId: string | null = null;
  let person: { id: string; phone: string | null; potentialDuplicateOfId: string | null } | null =
    null;

  const scope = verifyOptInToken(input.token);
  if (scope) {
    const bound = await followMerged(scope.personId, scope.workspaceId);
    if (bound) {
      binding = 'token';
      workspaceId = scope.workspaceId;
      person = { id: bound.id, phone: bound.phone, potentialDuplicateOfId: bound.potentialDuplicateOfId };
    }
  }

  if (!person) {
    const workspace = await resolveDefaultApplyWorkspace();
    if (!workspace) {
      return NextResponse.json({ error: 'Not available right now.' }, { status: 503 });
    }
    workspaceId = workspace.id;
    try {
      // Cold path: one resolvePerson call, strict identity policy as designed
      // (unverified email never links; phone is the weak key; the merge queue
      // is the net). source 'application' = closest existing ContactSourceSystem
      // value for a first-party public web form touch.
      const { resolvePerson } = await import('@/lib/crm/resolve-person');
      const resolved = await resolvePerson({
        workspaceId: workspace.id,
        email: input.email || null,
        emailVerified: false,
        phone: e164,
        firstName: input.firstName || null,
        lastName: input.lastName || null,
        source: 'application',
      });
      person = {
        id: resolved.id,
        phone: resolved.phone,
        potentialDuplicateOfId: resolved.potentialDuplicateOfId,
      };
    } catch (err) {
      console.error('[opt-in/sms] cold-path person resolve failed:', err);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
  }

  // ── Record the act ─────────────────────────────────────────────────────────
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const userAgent = (req.headers.get('user-agent') ?? 'unknown').slice(0, 500);
  const disclosureText = buildDisclosureText(process.env.MARKETING_TWILIO_PHONE_NUMBER ?? null);

  try {
    const result = await recordSmsOptIn({
      workspaceId: workspaceId!,
      person,
      binding,
      e164,
      postalCode,
      consentAt: new Date(),
      ip,
      userAgent,
      disclosureText,
      disclosureVersion: DISCLOSURE_VERSION,
      formUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/opt-in/sms`,
    });
    return NextResponse.json({
      ok: true,
      alreadySubscribed: result.alreadySubscribed,
      suppressed: result.suppressed,
    });
  } catch (err) {
    console.error(
      `[opt-in/sms] consent record failed (workspace=${workspaceId} person=${person.id}):`,
      err,
    );
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

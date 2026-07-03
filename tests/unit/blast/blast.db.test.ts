/** Attendee blast acceptance (Stage 18, 4E) - real rows on ep-sweet-term
 *  (env-gated: GATE_M1_DB_TESTS=1).
 *
 *  Resend + Twilio + auth are mocked at the module boundary (zero real
 *  provider calls); routes, engine, resolution, consent, and the durable
 *  rails are all real. Test order is load-bearing: the route's rate limit
 *  counts Blast rows per event per hour, so the 429 test runs LAST and the
 *  accumulated blasts from earlier tests ARE its fixture.
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.test.local" });
dotenv.config({ path: ".env.local" });

import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const RUN = process.env.GATE_M1_DB_TESTS === "1";
const describeDb = RUN ? describe : describe.skip;
const T = 120_000;

const authState = {
  gate: {
    ok: true as const,
    userId: "user_blast_test",
    workspaceId: "",
    role: "ADMIN",
  },
};
vi.mock("@/lib/operator-role", () => ({
  requireRole: vi.fn(async () => authState.gate),
}));

type EmailSend = { from: string; to: string[]; subject: string; text: string };
const emailState = {
  sends: [] as EmailSend[],
  /** Destinations that fail once with a 429-class error, then succeed. */
  failOnce: new Set<string>(),
  failed: new Set<string>(),
};
vi.mock("@/lib/resend", () => ({
  resend: {
    emails: {
      send: vi.fn(async (args: EmailSend) => {
        const to = args.to[0];
        if (emailState.failOnce.has(to) && !emailState.failed.has(to)) {
          emailState.failed.add(to);
          return {
            data: null,
            error: { name: "rate_limit_exceeded", message: "Too many requests" },
          };
        }
        emailState.sends.push(args);
        return { data: { id: `re_blast_${emailState.sends.length}` }, error: null };
      }),
    },
  },
}));

type SmsSend = { to: string; body: string };
const smsState = {
  configured: true,
  sends: [] as SmsSend[],
};
vi.mock("@/lib/twilio", () => ({
  marketingSmsConfigured: vi.fn(() => smsState.configured),
  sendMarketingSms: vi.fn(async (to: string, body: string) => {
    smsState.sends.push({ to, body });
    return { sid: `SM_blast_${smsState.sends.length}` };
  }),
}));

type Ctx = { params: Promise<{ id: string }> };
type DryRunRoute = { POST: (req: Request, ctx: Ctx) => Promise<Response> };
type BlastRoute = {
  GET: (req: Request, ctx: Ctx) => Promise<Response>;
  POST: (req: Request, ctx: Ctx) => Promise<Response>;
};

let db: PrismaClient;
let dryRunRoute: DryRunRoute;
let blastRoute: BlastRoute;
let workspaceId: string;
let eventId: string;
const rsvpIds: Record<string, string> = {};

const SLUG = "blast-accept";

function ctx(id: string): Ctx {
  return { params: Promise.resolve({ id }) };
}
function post(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function dryRun(channel: "EMAIL" | "SMS") {
  const res = await dryRunRoute.POST(
    post(`/api/operator/events/${eventId}/blast/dry-run`, { channel }),
    ctx(eventId),
  );
  expect(res.status).toBe(200);
  return (await res.json()) as {
    enabled: boolean;
    reason?: string;
    verdicts?: {
      rsvpId: string;
      status: string;
      consentSource: string | null;
      reason: string | null;
      destination: string | null;
    }[];
    counts?: { total: number; queued: number };
    confirmSentence?: string;
  };
}
function verdictOf(
  verdicts: { rsvpId: string; status: string; consentSource: string | null; reason: string | null }[],
  key: string,
) {
  return verdicts.find((v) => v.rsvpId === rsvpIds[key])!;
}

async function cleanup(dbc: PrismaClient, slug: string) {
  const ws = await dbc.workspace.findUnique({ where: { slug } });
  if (!ws) return;
  const scope = { workspaceId: ws.id };
  await dbc.blastRecipient.deleteMany({ where: scope });
  await dbc.blast.deleteMany({ where: scope });
  await dbc.suppressedContact.deleteMany({ where: scope });
  await dbc.smsMessage.deleteMany({ where: { conversation: { workspaceId: ws.id } } });
  await dbc.smsConversation.deleteMany({ where: scope });
  await dbc.auditEvent.deleteMany({ where: scope });
  await dbc.rSVP.deleteMany({ where: scope });
  await dbc.application.deleteMany({ where: scope });
  await dbc.event.deleteMany({ where: scope });
  await dbc.member.deleteMany({ where: scope });
  await dbc.workspace.delete({ where: { id: ws.id } });
}

describeDb("attendee blast (dry run + email + sms + rails on real rows)", () => {
  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? "";
    if (url.includes("ep-twilight-forest")) throw new Error("prod refused");

    db = (await import("@/lib/db")).db;
    dryRunRoute = (await import(
      "@/app/api/operator/events/[id]/blast/dry-run/route"
    )) as unknown as DryRunRoute;
    blastRoute = (await import(
      "@/app/api/operator/events/[id]/blast/route"
    )) as unknown as BlastRoute;

    await cleanup(db, SLUG);
    const ws = await db.workspace.create({
      data: { name: "Blast Acceptance", slug: SLUG, clerkOrgId: "org_blast_test" },
    });
    workspaceId = ws.id;
    authState.gate.workspaceId = ws.id;

    const event = await db.event.create({
      data: {
        workspaceId: ws.id,
        title: "Blast Test Evening",
        slug: "blast-evening",
        status: "PUBLISHED",
        startAt: new Date("2026-08-15T20:00:00-05:00"),
      },
    });
    eventId = event.id;

    type Seed = {
      key: string;
      email: string;
      phone: string | null;
      emailOptIn?: boolean;
      smsOptIn?: boolean;
      redListed?: boolean;
      guest?: boolean;
      application?: { emailOptIn: boolean; smsOptInAt: Date | null };
      rsvpStatus?: string;
      guestEmail?: string;
    };
    const seeds: Seed[] = [
      // Profile consent on both channels.
      { key: "alice", email: "blast-alice@example.com", phone: "+15550000001", emailOptIn: true, smsOptIn: true },
      // Consent ONLY via the latest-application fallback.
      {
        key: "bob",
        email: "blast-bob@example.com",
        phone: "+15550000002",
        application: { emailOptIn: true, smsOptInAt: new Date("2026-01-15T00:00:00Z") },
      },
      // Guest buyer, no consent record anywhere.
      { key: "carol", email: "", phone: null, guest: true, guestEmail: "blast-carol-guest@example.com" },
      // SMS consent but no phone on file.
      { key: "dave", email: "blast-dave@example.com", phone: null, smsOptIn: true },
      // Email consent but on the suppression list.
      { key: "eve", email: "blast-eve@example.com", phone: null, emailOptIn: true },
      // RED-LISTED but consented on both channels - must receive (rule 1).
      { key: "red", email: "blast-red@example.com", phone: "+15550000003", emailOptIn: true, smsOptIn: true, redListed: true },
      // SMS consent but the phone is suppressed.
      { key: "frank", email: "blast-frank@example.com", phone: "+15550000009", smsOptIn: true },
      // Held seat - never part of a blast.
      { key: "held", email: "blast-held@example.com", phone: "+15550000010", emailOptIn: true, rsvpStatus: "held" },
    ];
    for (const s of seeds) {
      const member = await db.member.create({
        data: {
          workspaceId: ws.id,
          clerkUserId: `user_blast_${s.key}`,
          email: s.email,
          firstName: s.key,
          lastName: "Blast",
          status: s.guest ? "GUEST" : "APPROVED",
          approved: !s.guest,
          phone: s.phone,
          marketingEmailOptIn: s.emailOptIn ?? false,
          marketingSmsOptIn: s.smsOptIn ?? false,
          redListed: s.redListed ?? false,
        },
      });
      if (s.application) {
        await db.application.create({
          data: {
            workspaceId: ws.id,
            memberId: member.id,
            email: s.email,
            fullName: `${s.key} Blast`,
            emailOptIn: s.application.emailOptIn,
            smsOptInAt: s.application.smsOptInAt,
          },
        });
      }
      const rsvp = await db.rSVP.create({
        data: {
          workspaceId: ws.id,
          eventId: event.id,
          memberId: member.id,
          ticketStatus: s.rsvpStatus ?? "confirmed",
          guestEmail: s.guestEmail ?? null,
          guestName: s.guest ? "Carol Guest" : null,
        },
      });
      rsvpIds[s.key] = rsvp.id;
    }

    await db.suppressedContact.createMany({
      data: [
        { workspaceId: ws.id, channel: "EMAIL", destination: "blast-eve@example.com", reason: "hard_bounce" },
        { workspaceId: ws.id, channel: "SMS", destination: "+15550000009", reason: "opt_out" },
      ],
    });
  }, 180_000);

  it(
    "4E-1a: the email dry run returns exact per-person verdicts",
    async () => {
      const run = await dryRun("EMAIL");
      expect(run.enabled).toBe(true);
      const v = run.verdicts!;
      // The held seat is not part of the resolution at all.
      expect(v.some((x) => x.rsvpId === rsvpIds.held)).toBe(false);
      expect(verdictOf(v, "alice")).toMatchObject({ status: "QUEUED", consentSource: "profile" });
      expect(verdictOf(v, "bob")).toMatchObject({ status: "QUEUED", consentSource: "application" });
      expect(verdictOf(v, "red")).toMatchObject({ status: "QUEUED", consentSource: "profile" });
      // The guest buyer HAS a destination (guestEmail) but no consent - visible.
      expect(verdictOf(v, "carol")).toMatchObject({
        status: "SKIPPED_NO_CONSENT",
        destination: "blast-carol-guest@example.com",
      });
      expect(verdictOf(v, "eve")).toMatchObject({ status: "SKIPPED_SUPPRESSED" });
      expect(run.counts).toMatchObject({ queued: 3, total: 7 });
      expect(run.confirmSentence).toContain("Sending to 3 of 7 attendees");
    },
    T,
  );

  it(
    "4E-1b: the SMS dry run distinguishes no-phone from no-consent from suppressed",
    async () => {
      const run = await dryRun("SMS");
      expect(run.enabled).toBe(true);
      const v = run.verdicts!;
      expect(verdictOf(v, "alice")).toMatchObject({ status: "QUEUED", consentSource: "profile" });
      expect(verdictOf(v, "bob")).toMatchObject({ status: "QUEUED", consentSource: "application" });
      expect(verdictOf(v, "red")).toMatchObject({ status: "QUEUED" });
      expect(verdictOf(v, "dave")).toMatchObject({
        status: "SKIPPED_NO_DESTINATION",
        reason: "No phone on file",
      });
      expect(verdictOf(v, "frank")).toMatchObject({ status: "SKIPPED_SUPPRESSED" });
      expect(run.counts?.queued).toBe(3);
    },
    T,
  );

  it(
    "4E-2 + 4E-3: the email blast sends to consented only, retries an injected 429, and the red-listed guest receives",
    async () => {
      emailState.failOnce.add("blast-bob@example.com");
      const res = await blastRoute.POST(
        post(`/api/operator/events/${eventId}/blast`, {
          channel: "EMAIL",
          subject: "See you Saturday",
          body: "Doors at nine. Bring nothing but yourselves.",
          confirm: true,
          expectedRecipients: 3,
          clientToken: "blast-email-000001",
        }),
        ctx(eventId),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { sent: number; failed: number; blastId: string };
      expect(body.sent).toBe(3);
      expect(body.failed).toBe(0);

      const sentTo = emailState.sends.map((s) => s.to[0]).sort();
      expect(sentTo).toEqual([
        "blast-alice@example.com",
        "blast-bob@example.com",
        "blast-red@example.com", // ACCESS never touches CHANNEL (rule 1)
      ]);
      for (const s of emailState.sends) {
        expect(s.from).toBe("The No Bad Company <team@thenobadcompany.com>");
      }
      // bob's first attempt 429'd and the bounded retry landed it.
      expect(emailState.failed.has("blast-bob@example.com")).toBe(true);

      const recipients = await db.blastRecipient.findMany({
        where: { blastId: body.blastId },
        select: { status: true, providerId: true, consentSource: true },
      });
      expect(recipients.filter((r) => r.status === "SENT")).toHaveLength(3);
      expect(
        recipients.filter((r) => r.status === "SENT").every((r) => r.providerId),
      ).toBe(true);
      const blast = await db.blast.findUnique({ where: { id: body.blastId } });
      expect(blast).toMatchObject({ status: "SENT", sentCount: 3, failedCount: 0 });
    },
    T,
  );

  it(
    "4E-4: a raced double-submit fires exactly once",
    async () => {
      const before = emailState.sends.length;
      const payload = {
        channel: "EMAIL" as const,
        subject: "One more thing",
        body: "The cloakroom opens at eight.",
        confirm: true as const,
        expectedRecipients: 3,
        clientToken: "blast-race-000001",
      };
      const [a, b] = await Promise.all([
        blastRoute.POST(post(`/api/operator/events/${eventId}/blast`, payload), ctx(eventId)),
        blastRoute.POST(post(`/api/operator/events/${eventId}/blast`, payload), ctx(eventId)),
      ]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);

      const rows = await db.blast.findMany({
        where: { workspaceId, clientToken: "blast-race-000001" },
      });
      expect(rows).toHaveLength(1); // clientToken idempotency held
      expect(emailState.sends.length - before).toBe(3); // fired once, not twice

      const bodies = [
        (await a.json()) as { alreadyFired?: boolean },
        (await b.json()) as { alreadyFired?: boolean },
      ];
      expect(bodies.filter((x) => x.alreadyFired).length).toBe(1);
    },
    T,
  );

  it(
    "guest-list drift: a stale confirmation refuses with honest copy",
    async () => {
      const res = await blastRoute.POST(
        post(`/api/operator/events/${eventId}/blast`, {
          channel: "EMAIL",
          subject: "Stale",
          body: "This should never send.",
          confirm: true,
          expectedRecipients: 2, // the dry run said 3
          clientToken: "blast-drift-000001",
        }),
        ctx(eventId),
      );
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBe("The guest list changed - run the check again.");
      expect(
        await db.blast.count({ where: { workspaceId, clientToken: "blast-drift-000001" } }),
      ).toBe(0);
    },
    T,
  );

  it(
    "4E-5: the SMS blast appends STOP copy, skips the suppressed number, and logs to the House Phone inbox",
    async () => {
      const res = await blastRoute.POST(
        post(`/api/operator/events/${eventId}/blast`, {
          channel: "SMS",
          body: "Doors at nine tonight.",
          confirm: true,
          expectedRecipients: 3,
          clientToken: "blast-sms-000001",
        }),
        ctx(eventId),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { sent: number };
      expect(body.sent).toBe(3);

      const sentTo = smsState.sends.map((s) => s.to).sort();
      expect(sentTo).toEqual(["+15550000001", "+15550000002", "+15550000003"]);
      expect(sentTo).not.toContain("+15550000009"); // suppressed
      for (const s of smsState.sends) {
        expect(s.body.endsWith("Reply STOP to opt out.")).toBe(true);
      }

      // Every blast SMS is visible in the House Phone inbox.
      const messages = await db.smsMessage.findMany({
        where: { conversation: { workspaceId } },
        select: {
          direction: true,
          category: true,
          aiGenerated: true,
          conversation: { select: { phone: true, eventId: true } },
        },
      });
      expect(messages).toHaveLength(3);
      for (const m of messages) {
        expect(m.direction).toBe("OUTBOUND");
        expect(m.category).toBe("marketing");
        expect(m.aiGenerated).toBe(false);
        expect(m.conversation.eventId).toBe(eventId);
      }
    },
    T,
  );

  it(
    "4E-5b: SMS sends pace at one message per second",
    async () => {
      const { createBlast, fireBlast } = await import("@/lib/blast/run");
      const { blast } = await createBlast(db, {
        workspaceId,
        eventId,
        channel: "SMS",
        subject: null,
        body: "Pacing check. Reply STOP to opt out.",
        createdByUserId: "user_blast_test",
        clientToken: "blast-pace-000001",
        verdicts: ["+15550000001", "+15550000002", "+15550000003"].map((phone, i) => ({
          rsvpId: `pace-rsvp-${i}`,
          memberId: null,
          name: `Pace ${i}`,
          destination: phone,
          status: "QUEUED" as const,
          consentSource: "profile" as const,
          reason: null,
        })),
      });
      const sleeps: number[] = [];
      const before = smsState.sends.length;
      const outcome = await fireBlast(db, blast.id, {
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      });
      expect(outcome.sent).toBe(3);
      expect(smsState.sends.length - before).toBe(3);
      expect(sleeps).toEqual([1000, 1000]); // between sends, never before the first
    },
    T,
  );

  it(
    "4E-6: an unset marketing number disables the SMS surface and refuses sends",
    async () => {
      smsState.configured = false;
      try {
        const run = await dryRun("SMS");
        expect(run.enabled).toBe(false);
        expect(run.reason).toContain("not set up yet");

        const res = await blastRoute.POST(
          post(`/api/operator/events/${eventId}/blast`, {
            channel: "SMS",
            body: "Should not send.",
            confirm: true,
            expectedRecipients: 3,
            clientToken: "blast-nosms-000001",
          }),
          ctx(eventId),
        );
        expect(res.status).toBe(503);
      } finally {
        smsState.configured = true;
      }
    },
    T,
  );

  it(
    "rails: the durable per-event rate limit refuses the fifth blast in an hour",
    async () => {
      // Four Blast rows exist from the tests above (email, race, sms, pace).
      expect(await db.blast.count({ where: { workspaceId, eventId } })).toBe(4);
      const res = await blastRoute.POST(
        post(`/api/operator/events/${eventId}/blast`, {
          channel: "EMAIL",
          subject: "Fifth",
          body: "Over the hourly limit.",
          confirm: true,
          expectedRecipients: 3,
          clientToken: "blast-limit-000001",
        }),
        ctx(eventId),
      );
      expect(res.status).toBe(429);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toContain("in the last hour");
    },
    T,
  );
});

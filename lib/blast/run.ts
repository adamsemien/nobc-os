/** The blast engine (Stage 18): create once, fire once, persist every
 *  per-recipient outcome.
 *
 *  Idempotency is two-layered:
 *   - createBlast collapses double-submits: the compose surface mints one
 *     clientToken per draft and @@unique([workspaceId, clientToken]) makes
 *     the second concurrent create return the first row.
 *   - fireBlast claims DRAFT -> SENDING with a guarded updateMany; the race
 *     loser gets BlastAlreadyFiredError and sends nothing.
 *
 *  Email: bounded concurrency (chunks of 8), per-recipient isolation, retry
 *  with backoff on 429/5xx (2 retries: 300ms, 1200ms).
 *  SMS: sequential at 1 msg/sec from the MARKETING number, STOP copy
 *  auto-appended when absent, every send logged to the House Phone inbox
 *  (SmsConversation upsert + OUTBOUND SmsMessage, category 'marketing').
 */
import type { Blast, PrismaClient } from "@prisma/client";
import { sendBlastEmail } from "@/lib/email";
import { sendMarketingSms } from "@/lib/twilio";
import type { RecipientVerdict } from "./recipients";

export class BlastAlreadyFiredError extends Error {
  constructor() {
    super("This blast already fired.");
    this.name = "BlastAlreadyFiredError";
  }
}

const EMAIL_CONCURRENCY = 8;
const RETRY_DELAYS_MS = [300, 1_200];
const SMS_PACE_MS = 1_000;
const STOP_COPY = "Reply STOP to opt out.";

export type Sleeper = (ms: number) => Promise<void>;
const realSleep: Sleeper = (ms) => new Promise((r) => setTimeout(r, ms));

/** Append the opt-out line unless the operator already wrote a STOP notice. */
export function ensureStopCopy(body: string): string {
  return /\bSTOP\b/i.test(body) ? body : `${body.trimEnd()}\n\n${STOP_COPY}`;
}

/** 429s and 5xx-class provider errors are worth a bounded retry. */
function retryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const status = (err as Error & { statusCode?: number }).statusCode;
  if (status === 429 || (typeof status === "number" && status >= 500)) return true;
  return err.name === "rate_limit_exceeded" || err.name === "internal_server_error";
}

/** Create the Blast + its recipient rows in one transaction. A concurrent
 *  double-submit with the same clientToken returns the existing row. */
export async function createBlast(
  db: PrismaClient,
  args: {
    workspaceId: string;
    eventId: string;
    channel: "EMAIL" | "SMS";
    subject: string | null;
    body: string;
    createdByUserId: string;
    clientToken: string;
    verdicts: RecipientVerdict[];
  },
): Promise<{ blast: Blast; created: boolean }> {
  try {
    const blast = await db.$transaction(async (tx) => {
      const row = await tx.blast.create({
        data: {
          workspaceId: args.workspaceId,
          eventId: args.eventId,
          channel: args.channel,
          subject: args.subject,
          body: args.body,
          createdByUserId: args.createdByUserId,
          clientToken: args.clientToken,
          recipientCount: args.verdicts.length,
          skippedCount: args.verdicts.filter((v) => v.status !== "QUEUED").length,
        },
      });
      await tx.blastRecipient.createMany({
        data: args.verdicts.map((v) => ({
          workspaceId: args.workspaceId,
          blastId: row.id,
          rsvpId: v.rsvpId,
          memberId: v.memberId,
          destination: v.destination ?? "",
          status: v.status,
          consentSource: v.consentSource,
          error: v.reason,
        })),
      });
      return row;
    });
    return { blast, created: true };
  } catch (err) {
    // P2002 on (workspaceId, clientToken): the double-submit twin won.
    if (
      err instanceof Error &&
      "code" in err &&
      (err as Error & { code?: string }).code === "P2002"
    ) {
      const existing = await db.blast.findUnique({
        where: {
          workspaceId_clientToken: {
            workspaceId: args.workspaceId,
            clientToken: args.clientToken,
          },
        },
      });
      if (existing) return { blast: existing, created: false };
    }
    throw err;
  }
}

async function sendOneEmail(
  args: { to: string; subject: string; text: string },
  sleep: Sleeper,
): Promise<{ id: string | null }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await sendBlastEmail(args);
    } catch (err) {
      lastErr = err;
      if (!retryable(err) || attempt === RETRY_DELAYS_MS.length) throw err;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastErr;
}

/** Fire a created blast exactly once. Returns the final counts. */
export async function fireBlast(
  db: PrismaClient,
  blastId: string,
  opts: { sleep?: Sleeper } = {},
): Promise<{ sent: number; failed: number; skipped: number }> {
  const sleep = opts.sleep ?? realSleep;

  const claimed = await db.blast.updateMany({
    where: { id: blastId, status: "DRAFT" },
    data: { status: "SENDING" },
  });
  if (claimed.count === 0) throw new BlastAlreadyFiredError();

  const blast = await db.blast.findUniqueOrThrow({ where: { id: blastId } });
  const queued = await db.blastRecipient.findMany({
    where: { blastId, status: "QUEUED" },
    orderBy: { createdAt: "asc" },
    select: { id: true, destination: true, memberId: true },
  });

  const markSent = (id: string, providerId: string | null) =>
    db.blastRecipient.update({
      where: { id },
      data: { status: "SENT", providerId },
    });
  const markFailed = (id: string, err: unknown) =>
    db.blastRecipient.update({
      where: { id },
      data: {
        status: "FAILED",
        error: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300),
      },
    });

  if (blast.channel === "EMAIL") {
    for (let i = 0; i < queued.length; i += EMAIL_CONCURRENCY) {
      const chunk = queued.slice(i, i + EMAIL_CONCURRENCY);
      await Promise.all(
        chunk.map(async (r) => {
          try {
            const sent = await sendOneEmail(
              { to: r.destination, subject: blast.subject ?? "", text: blast.body },
              sleep,
            );
            await markSent(r.id, sent.id);
          } catch (err) {
            await markFailed(r.id, err);
          }
        }),
      );
    }
  } else {
    const body = ensureStopCopy(blast.body);
    for (let i = 0; i < queued.length; i++) {
      const r = queued[i];
      if (i > 0) await sleep(SMS_PACE_MS); // 1 msg/sec pacing (4C)
      try {
        const { sid } = await sendMarketingSms(r.destination, body);
        await markSent(r.id, sid);
        await logSmsToInbox(db, {
          workspaceId: blast.workspaceId,
          eventId: blast.eventId,
          phone: r.destination,
          body,
          memberId: r.memberId,
        });
      } catch (err) {
        await markFailed(r.id, err);
        // Twilio 21610: the carrier-level STOP list refused the send. Record
        // it so the next dry run skips this number honestly.
        const code = (err as Error & { code?: number }).code;
        if (code === 21610) {
          await db.suppressedContact
            .upsert({
              where: {
                workspaceId_channel_destination: {
                  workspaceId: blast.workspaceId,
                  channel: "SMS",
                  destination: r.destination,
                },
              },
              create: {
                workspaceId: blast.workspaceId,
                channel: "SMS",
                destination: r.destination,
                reason: "carrier_stop",
              },
              update: {},
            })
            .catch(() => {});
        }
      }
    }
  }

  const [sent, failed, skipped] = await Promise.all([
    db.blastRecipient.count({ where: { blastId, status: "SENT" } }),
    db.blastRecipient.count({ where: { blastId, status: "FAILED" } }),
    db.blastRecipient.count({
      where: { blastId, status: { notIn: ["SENT", "FAILED", "QUEUED"] } },
    }),
  ]);
  await db.blast.update({
    where: { id: blastId },
    data: {
      status: queued.length > 0 && sent === 0 ? "FAILED" : "SENT",
      sentCount: sent,
      failedCount: failed,
      skippedCount: skipped,
      sentAt: new Date(),
    },
  });
  return { sent, failed, skipped };
}

/** Every blast SMS shows up in the House Phone inbox: upsert the
 *  conversation for this phone, append the OUTBOUND message. */
async function logSmsToInbox(
  db: PrismaClient,
  args: { workspaceId: string; eventId: string; phone: string; body: string; memberId: string | null },
): Promise<void> {
  const conversation = await db.smsConversation.upsert({
    where: {
      workspaceId_phone: { workspaceId: args.workspaceId, phone: args.phone },
    },
    create: {
      workspaceId: args.workspaceId,
      phone: args.phone,
      eventId: args.eventId,
      memberId: args.memberId,
    },
    update: {},
  });
  // Slice 3 (Communicate + log it) — the ONE authorized Blast exception: stamp the
  // memberId Blast already resolved for this recipient, fill-if-empty (never
  // downgrade/overwrite an already-linked identity — same no-downgrade spirit as
  // lib/comms/consent-sync.ts). Post-send record-keeping only; does not touch
  // canSend, consent checks, or anything upstream of the send decision above.
  if (args.memberId && !conversation.memberId) {
    await db.smsConversation.update({
      where: { id: conversation.id },
      data: { memberId: args.memberId },
    });
  }
  // LANDMINE (recon 2026-07-01): the live DB has an SmsMessage.twilioSid
  // column that is NOT in schema.prisma. Prisma writes leave it NULL, which
  // the unique index permits - do NOT add the column to the schema here.
  await db.smsMessage.create({
    data: {
      conversationId: conversation.id,
      direction: "OUTBOUND",
      body: args.body,
      aiGenerated: false,
      category: "marketing",
    },
  });
}

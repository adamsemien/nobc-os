/** Admission records for the v3 gate flow (Event Builder Rebuild, Phase A).
 *
 *  The gate engine writes proofs; THIS module writes what the rest of the
 *  house reads: Order (the money object), Ticket (the admission ledger row),
 *  and RSVP (the attendance record - the door list at
 *  app/api/check-in/event/route.ts reads ONLY RSVP.ticketStatus, so every
 *  admission must land there or the buyer never reaches the door).
 *
 *  Decision 5: RSVP stays the attendance record, linked to the Order; the
 *  Order is the money object. Idempotency: paid admissions key on the
 *  Order.stripePaymentIntentId unique; comp admissions key on the COMP_CODE
 *  proof + one order per (member, event, promo) check. Everything runs in
 *  one transaction and every read/write is workspace-scoped.
 */
import type { Member, Prisma, PrismaClient } from "@prisma/client";

export type AdmissionMember = Pick<
  Member,
  "id" | "email" | "firstName" | "lastName"
>;

export type AdmissionResult = {
  orderId: string;
  ticketId: string;
  rsvpId: string;
  alreadyRecorded: boolean;
};

function buyerName(member: AdmissionMember): string {
  const name = [member.firstName, member.lastName]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .trim();
  return name || member.email;
}

type Tx = Prisma.TransactionClient;

/** Upsert the attendance record the door list reads. */
async function upsertConfirmedRsvp(
  tx: Tx,
  args: {
    workspaceId: string;
    eventId: string;
    memberId: string;
    orderId: string;
    stripePaymentIntentId: string | null;
    paymentStatus: string;
    amountCents: number;
  },
): Promise<string> {
  const existing = await tx.rSVP.findFirst({
    where: {
      workspaceId: args.workspaceId,
      eventId: args.eventId,
      memberId: args.memberId,
    },
    select: { id: true },
  });
  const data = {
    status: "CONFIRMED" as const,
    ticketStatus: "confirmed",
    origin: "gate",
    orderId: args.orderId,
    stripePaymentIntentId: args.stripePaymentIntentId,
    paymentStatus: args.paymentStatus,
    amountCents: args.amountCents,
  };
  if (existing) {
    await tx.rSVP.update({ where: { id: existing.id }, data });
    return existing.id;
  }
  const created = await tx.rSVP.create({
    data: {
      workspaceId: args.workspaceId,
      eventId: args.eventId,
      memberId: args.memberId,
      ...data,
    },
    select: { id: true },
  });
  return created.id;
}

/** Money records for a succeeded gate PAY charge. Idempotent on the intent id.
 *
 *  Amounts: subtotal is the PAY node's configured price; total is what Stripe
 *  actually received (the fee-adjusted mint amount); the service fee is the
 *  difference - derived from the real charge, never recomputed on a policy
 *  that might have changed between mint and confirm.
 */
export async function recordPaidAdmission(
  db: PrismaClient,
  args: {
    workspaceId: string;
    eventId: string;
    member: AdmissionMember;
    paymentIntentId: string;
    subtotalCents: number;
    amountReceivedCents: number;
    currency: string;
    gateSessionId: string | null;
  },
): Promise<AdmissionResult> {
  const existing = await db.order.findFirst({
    where: {
      workspaceId: args.workspaceId,
      stripePaymentIntentId: args.paymentIntentId,
    },
    select: { id: true, rsvps: { select: { id: true }, take: 1 } },
  });
  if (existing) {
    const ticket = await db.ticket.findFirst({
      where: {
        workspaceId: args.workspaceId,
        stripePaymentIntentId: args.paymentIntentId,
      },
      select: { id: true },
    });
    return {
      orderId: existing.id,
      ticketId: ticket?.id ?? "",
      rsvpId: existing.rsvps[0]?.id ?? "",
      alreadyRecorded: true,
    };
  }

  const serviceFeeCents = Math.max(
    0,
    args.amountReceivedCents - args.subtotalCents,
  );

  return db.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        workspaceId: args.workspaceId,
        eventId: args.eventId,
        buyerMemberId: args.member.id,
        buyerName: buyerName(args.member),
        buyerEmail: args.member.email,
        subtotalCents: args.subtotalCents,
        serviceFeeCents,
        promoDiscountCents: 0,
        totalCents: args.amountReceivedCents,
        stripePaymentIntentId: args.paymentIntentId,
        paymentStatus: "CAPTURED",
      },
      select: { id: true },
    });
    const rsvpId = await upsertConfirmedRsvp(tx, {
      workspaceId: args.workspaceId,
      eventId: args.eventId,
      memberId: args.member.id,
      orderId: order.id,
      stripePaymentIntentId: args.paymentIntentId,
      paymentStatus: "CAPTURED",
      amountCents: args.amountReceivedCents,
    });
    const ticket = await tx.ticket.create({
      data: {
        workspaceId: args.workspaceId,
        eventId: args.eventId,
        memberId: args.member.id,
        rsvpId,
        stripePaymentIntentId: args.paymentIntentId,
        amount: args.amountReceivedCents,
        currency: args.currency,
        status: "CAPTURED",
      },
      select: { id: true },
    });
    return {
      orderId: order.id,
      ticketId: ticket.id,
      rsvpId,
      alreadyRecorded: false,
    };
  });
}

/** Money + attendance records for a 100%-off comp redemption. No Stripe
 *  contact anywhere: a zero-total Order carries the promo linkage, the
 *  Ticket is a real zero-amount admission, and the RSVP uses the house
 *  'COMP' payment status the operator surfaces already understand. */
export class CompExhaustedError extends Error {
  constructor() {
    super("comp_code_exhausted");
    this.name = "CompExhaustedError";
  }
}

export async function recordCompAdmission(
  db: PrismaClient,
  args: {
    workspaceId: string;
    eventId: string;
    member: AdmissionMember;
    promoCodeId: string;
    /** The code's cap, for the race-safe claim below. Null = uncapped. */
    promoMaxUses: number | null;
    subtotalCents: number;
  },
): Promise<AdmissionResult> {
  const existing = await db.order.findFirst({
    where: {
      workspaceId: args.workspaceId,
      eventId: args.eventId,
      buyerMemberId: args.member.id,
      promoCodeId: args.promoCodeId,
    },
    select: { id: true, rsvps: { select: { id: true }, take: 1 } },
  });
  if (existing) {
    const ticket = await db.ticket.findFirst({
      where: {
        workspaceId: args.workspaceId,
        eventId: args.eventId,
        memberId: args.member.id,
        stripePaymentIntentId: null,
      },
      select: { id: true },
    });
    return {
      orderId: existing.id,
      ticketId: ticket?.id ?? "",
      rsvpId: existing.rsvps[0]?.id ?? "",
      alreadyRecorded: true,
    };
  }

  return db.$transaction(async (tx) => {
    // Race-safe claim FIRST (Warden, Phase C): the increment only lands while
    // usedCount is still under the cap, so two concurrent redemptions of the
    // last use cannot both succeed - the loser rolls the whole admission back.
    const claimed = await tx.promoCode.updateMany({
      where: {
        id: args.promoCodeId,
        workspaceId: args.workspaceId,
        ...(args.promoMaxUses !== null
          ? { usedCount: { lt: args.promoMaxUses } }
          : {}),
      },
      data: { usedCount: { increment: 1 } },
    });
    if (claimed.count === 0) throw new CompExhaustedError();

    const order = await tx.order.create({
      data: {
        workspaceId: args.workspaceId,
        eventId: args.eventId,
        buyerMemberId: args.member.id,
        buyerName: buyerName(args.member),
        buyerEmail: args.member.email,
        subtotalCents: args.subtotalCents,
        serviceFeeCents: 0,
        promoDiscountCents: args.subtotalCents,
        totalCents: 0,
        paymentStatus: "CAPTURED",
        promoCodeId: args.promoCodeId,
      },
      select: { id: true },
    });
    await tx.promoRedemption.create({
      data: {
        workspaceId: args.workspaceId,
        promoCodeId: args.promoCodeId,
        orderId: order.id,
        amountSavedCents: args.subtotalCents,
      },
    });
    const rsvpId = await upsertConfirmedRsvp(tx, {
      workspaceId: args.workspaceId,
      eventId: args.eventId,
      memberId: args.member.id,
      orderId: order.id,
      stripePaymentIntentId: null,
      paymentStatus: "COMP",
      amountCents: 0,
    });
    const ticket = await tx.ticket.create({
      data: {
        workspaceId: args.workspaceId,
        eventId: args.eventId,
        memberId: args.member.id,
        rsvpId,
        amount: 0,
        currency: "usd",
        status: "CAPTURED",
      },
      select: { id: true },
    });
    return {
      orderId: order.id,
      ticketId: ticket.id,
      rsvpId,
      alreadyRecorded: false,
    };
  });
}

/** A gate that opened with no PAY step (members-only, referred, applied)
 *  still needs the attendance row or the guest never reaches the door list.
 *  No Order, no Ticket - nothing was sold. */
export async function ensureOpenAdmission(
  db: PrismaClient,
  args: { workspaceId: string; eventId: string; memberId: string },
): Promise<void> {
  const existing = await db.rSVP.findFirst({
    where: {
      workspaceId: args.workspaceId,
      eventId: args.eventId,
      memberId: args.memberId,
    },
    select: { id: true, ticketStatus: true },
  });
  if (existing) {
    if (existing.ticketStatus !== "confirmed") {
      await db.rSVP.update({
        where: { id: existing.id },
        data: { status: "CONFIRMED", ticketStatus: "confirmed" },
      });
    }
    return;
  }
  await db.rSVP.create({
    data: {
      workspaceId: args.workspaceId,
      eventId: args.eventId,
      memberId: args.memberId,
      status: "CONFIRMED",
      ticketStatus: "confirmed",
      origin: "gate",
    },
  });
}

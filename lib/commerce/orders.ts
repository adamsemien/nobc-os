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
import { logEngagementEvent } from "@/lib/engagement";

export type AdmissionMember = Pick<
  Member,
  "id" | "email" | "firstName" | "lastName" | "personId"
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

/** Upsert the attendance record the door list reads. Capacity is enforced
 *  HERE, inside the caller's transaction (Phase F, ADD 3): a NEW seat is
 *  only created while the confirmed/held count is under the cap - two racing
 *  buyers of the last seat cannot both land, because the count and the
 *  create commit atomically. Updating an existing row never adds a seat. */
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
    capacity: number | null;
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
  if (args.capacity !== null) {
    const taken = await tx.rSVP.count({
      where: {
        workspaceId: args.workspaceId,
        eventId: args.eventId,
        ticketStatus: { in: ["confirmed", "held"] },
      },
    });
    if (taken >= args.capacity) throw new CapacityFullError();
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
 *
 *  Discounts (D6): when the verifier's proof carries the server stamp, the
 *  Order keeps the honest split - subtotal stays the base price, the
 *  discount is its own column, the fee is what the buyer paid over the
 *  discounted price. The maxUses claim is the same guarded increment comp
 *  codes use (D9), inside this transaction: a race loser throws
 *  PromoExhaustedError and every write rolls back - the bridge then refunds
 *  the charge, mirroring the Phase F capacity race.
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
    promo?: { promoCodeId: string; discountCents: number } | null;
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

  const discountCents = args.promo?.discountCents ?? 0;
  const serviceFeeCents = Math.max(
    0,
    args.amountReceivedCents - (args.subtotalCents - discountCents),
  );
  const capacity = await eventCapacity(db, args.workspaceId, args.eventId);

  const result = await db.$transaction(async (tx) => {
    if (args.promo) {
      // Fail-closed: the code must still exist in this workspace, honor its
      // per-customer cap, and win the guarded claim - all atomically with
      // the Order it justifies.
      const promoRow = await tx.promoCode.findFirst({
        where: { id: args.promo.promoCodeId, workspaceId: args.workspaceId },
        select: { maxUses: true, maxUsesPerCustomer: true },
      });
      if (!promoRow) throw new PromoExhaustedError();
      if (promoRow.maxUsesPerCustomer !== null) {
        const mine = await tx.promoRedemption.count({
          where: {
            workspaceId: args.workspaceId,
            promoCodeId: args.promo.promoCodeId,
            order: { buyerMemberId: args.member.id },
          },
        });
        if (mine >= promoRow.maxUsesPerCustomer) {
          throw new PromoExhaustedError();
        }
      }
      const claimed = await tx.promoCode.updateMany({
        where: {
          id: args.promo.promoCodeId,
          workspaceId: args.workspaceId,
          ...(promoRow.maxUses !== null
            ? { usedCount: { lt: promoRow.maxUses } }
            : {}),
        },
        data: { usedCount: { increment: 1 } },
      });
      if (claimed.count === 0) throw new PromoExhaustedError();
    }

    const order = await tx.order.create({
      data: {
        workspaceId: args.workspaceId,
        eventId: args.eventId,
        buyerMemberId: args.member.id,
        buyerName: buyerName(args.member),
        buyerEmail: args.member.email,
        subtotalCents: args.subtotalCents,
        serviceFeeCents,
        promoDiscountCents: discountCents,
        totalCents: args.amountReceivedCents,
        stripePaymentIntentId: args.paymentIntentId,
        paymentStatus: "CAPTURED",
        ...(args.promo ? { promoCodeId: args.promo.promoCodeId } : {}),
      },
      select: { id: true },
    });
    if (args.promo) {
      await tx.promoRedemption.create({
        data: {
          workspaceId: args.workspaceId,
          promoCodeId: args.promo.promoCodeId,
          orderId: order.id,
          amountSavedCents: discountCents,
        },
      });
    }
    const rsvpId = await upsertConfirmedRsvp(tx, {
      workspaceId: args.workspaceId,
      eventId: args.eventId,
      memberId: args.member.id,
      orderId: order.id,
      stripePaymentIntentId: args.paymentIntentId,
      paymentStatus: "CAPTURED",
      amountCents: args.amountReceivedCents,
      capacity,
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

  // Ways-In Phase A (spec §4): the money fact + the seat fact, exactly once
  // per admission - the Order's intent-id idempotency is the guard. Two
  // facts, two meanings: ticket_purchased is the purchase, rsvp_confirmed is
  // the confirmed seat the sponsor funnel counts. Fire-and-forget, after the
  // transaction commits - a lost fact must never unwind an admission.
  void logEngagementEvent({
    workspaceId: args.workspaceId,
    memberId: args.member.id,
    personId: args.member.personId,
    eventType: "ticket_purchased",
    eventId: args.eventId,
    metadata: {
      orderId: result.orderId,
      amountCents: args.amountReceivedCents,
      paymentIntentId: args.paymentIntentId,
    },
  });
  void logEngagementEvent({
    workspaceId: args.workspaceId,
    memberId: args.member.id,
    personId: args.member.personId,
    eventType: "rsvp_confirmed",
    eventId: args.eventId,
    metadata: { orderId: result.orderId, origin: "gate_paid" },
  });

  return result;
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

/** D6: a paid discount lost the guarded maxUses claim (or its code vanished)
 *  AFTER the charge succeeded. Thrown inside the admission transaction so
 *  nothing lands; the bridge refunds the charge and expires the proof. */
export class PromoExhaustedError extends Error {
  constructor() {
    super("promo_code_exhausted");
    this.name = "PromoExhaustedError";
  }
}

/** Phase F (ADD 3): the event is at capacity - no seat, no Order. Thrown
 *  inside the admission transaction so every partial write rolls back. */
export class CapacityFullError extends Error {
  constructor() {
    super("event_at_capacity");
    this.name = "CapacityFullError";
  }
}

/** The event's cap, read where the admission writes happen. */
async function eventCapacity(
  db: PrismaClient | Tx,
  workspaceId: string,
  eventId: string,
): Promise<number | null> {
  const event = await db.event.findFirst({
    where: { id: eventId, workspaceId },
    select: { capacity: true },
  });
  return event?.capacity ?? null;
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

  const capacity = await eventCapacity(db, args.workspaceId, args.eventId);

  const result = await db.$transaction(async (tx) => {
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
      capacity,
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

  // Ways-In Phase A (spec §4): a comp redemption seats the guest - the seat
  // fact fires; the money fact (ticket_purchased) deliberately does NOT
  // (nothing was purchased). comp_issued stays the operator comp route's
  // fact. Exactly once: the one-order-per-(member, event, promo) check above
  // is the guard.
  void logEngagementEvent({
    workspaceId: args.workspaceId,
    memberId: args.member.id,
    personId: args.member.personId,
    eventType: "rsvp_confirmed",
    eventId: args.eventId,
    metadata: { orderId: result.orderId, origin: "gate_comp", promoCodeId: args.promoCodeId },
  });

  return result;
}

/** A gate that opened with no PAY step (members-only, referred, applied)
 *  still needs the attendance row or the guest never reaches the door list.
 *  No Order, no Ticket - nothing was sold.
 *
 *  Ways-In Phase A: returns whether THIS call newly confirmed the seat (an
 *  already-confirmed row returns newlyConfirmed: false) so rsvp_confirmed
 *  fires exactly once per admission, never on the idempotent re-walk. */
export async function ensureOpenAdmission(
  db: PrismaClient,
  args: {
    workspaceId: string;
    eventId: string;
    memberId: string;
    personId?: string | null;
  },
): Promise<{ newlyConfirmed: boolean; rsvpId: string | null }> {
  const emitConfirmed = (rsvpId: string) => {
    void logEngagementEvent({
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      personId: args.personId ?? null,
      eventType: "rsvp_confirmed",
      eventId: args.eventId,
      metadata: { rsvpId, origin: "gate_open" },
    });
  };

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
      emitConfirmed(existing.id);
      return { newlyConfirmed: true, rsvpId: existing.id };
    }
    return { newlyConfirmed: false, rsvpId: existing.id };
  }
  const capacity = await eventCapacity(db, args.workspaceId, args.eventId);
  const created = await db.$transaction(async (tx) => {
    if (capacity !== null) {
      const taken = await tx.rSVP.count({
        where: {
          workspaceId: args.workspaceId,
          eventId: args.eventId,
          ticketStatus: { in: ["confirmed", "held"] },
        },
      });
      if (taken >= capacity) throw new CapacityFullError();
    }
    return tx.rSVP.create({
      data: {
        workspaceId: args.workspaceId,
        eventId: args.eventId,
        memberId: args.memberId,
        status: "CONFIRMED",
        ticketStatus: "confirmed",
        origin: "gate",
      },
      select: { id: true },
    });
  });
  emitConfirmed(created.id);
  return { newlyConfirmed: true, rsvpId: created.id };
}

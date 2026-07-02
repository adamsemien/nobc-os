/**
 * NBS -> v3 cutover converter (Event Builder Rebuild, Phase D).
 *
 * Converts one legacy-shaped event (default: the live No Bad Saturday row)
 * onto the v3 gate engine by synthesizing the equivalent Gate from its
 * eventAccess JSON. ADDITIVE AND REVERSIBLE by construction:
 *
 *   - No legacy field is written, ever - eventAccess, accessMode,
 *     priceInCents, approvalRequired, EventWorkflow.paths all stay exactly
 *     as they are. The public page flips to the gate walkthrough only
 *     because a Gate row now exists (lib/public-event-loader `gated`).
 *   - Rollback is one flag: --rollback deletes the event's gate and the
 *     page renders the legacy path again, byte-identical.
 *
 * Usage (ADAM RUNS THIS - it is never executed as a build side effect):
 *   npx tsx scripts/cutover/nbs-to-v3.ts                      # dry run
 *   CUTOVER_CONFIRM=NBS npx tsx scripts/cutover/nbs-to-v3.ts --execute
 *   CUTOVER_CONFIRM=NBS npx tsx scripts/cutover/nbs-to-v3.ts --rollback
 *   ... --event <id>   target a different event id
 *
 * The DATABASE_URL in .env.local decides the target. The script prints the
 * host and refuses to EXECUTE against the production branch unless
 * CUTOVER_CONFIRM=NBS is set - pointing it at prod is a deliberate,
 * two-step act. Dry run never writes anywhere.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import * as dotenv from "dotenv";
import { parseEventAccess } from "@/lib/event-access";
import type { GateNodeSpec } from "@/lib/gate-engine/types";

dotenv.config({ path: ".env.local" });

const NBS_EVENT_ID = "cmqr8wojk000004kzc90yxxy3";

export type ConversionPlan =
  | {
      ok: true;
      eventId: string;
      workspaceId: string;
      title: string;
      spec: GateNodeSpec;
      summary: string;
    }
  | { ok: false; eventId: string; reason: string };

/** Map a legacy eventAccess shape onto the equivalent v3 gate spec.
 *  Deliberately narrow: it converts the shapes the live platform actually
 *  holds (free-member + paid-guest, paid-only, apply-only, open) and refuses
 *  anything else rather than guessing (fail-closed - a refused shape is a
 *  report line, not a silent wrong gate). */
export function planConversion(args: {
  eventId: string;
  workspaceId: string;
  title: string;
  eventAccess: unknown;
}): ConversionPlan {
  const access = parseEventAccess(args.eventAccess);
  const lane = (l: { enabled: boolean; gates: { type: string; priceCents?: number; approvalRequired?: boolean }[] }) => ({
    enabled: l.enabled,
    tickets: l.gates.filter((g) => g.type === "ticket"),
    applications: l.gates.filter((g) => g.type === "application"),
    other: l.gates.filter((g) => g.type !== "ticket" && g.type !== "application"),
  });
  const member = lane(access.member);
  const guest = lane(access.guest);

  if (member.other.length > 0 || guest.other.length > 0) {
    return { ok: false, eventId: args.eventId, reason: "unrecognized gate types in eventAccess" };
  }

  const guestPrice =
    guest.tickets[0]?.priceCents && guest.tickets[0].priceCents > 0
      ? guest.tickets[0].priceCents
      : access.guest.priceCents;

  // The NBS shape: members free + auto-confirm, guests pay. As a gate:
  // any one of { be an active member, buy the ticket }.
  if (
    member.enabled &&
    member.tickets.length === 0 &&
    member.applications.length === 0 &&
    guest.enabled &&
    guest.tickets.length >= 1 &&
    guest.applications.length === 0 &&
    guestPrice > 0
  ) {
    return {
      ok: true,
      eventId: args.eventId,
      workspaceId: args.workspaceId,
      title: args.title,
      spec: {
        kind: "GROUP",
        rule: "ALL",
        children: [
          {
            kind: "GROUP",
            rule: "ANY_N",
            requiredCount: 1,
            children: [
              { kind: "CONDITION", conditionType: "HOLD_MEMBERSHIP", config: {} },
              { kind: "CONDITION", conditionType: "PAY", config: { priceCents: guestPrice } },
            ],
          },
        ],
      },
      summary: `members walk in free (live membership check), guests pay $${(guestPrice / 100).toFixed(2)} - comp codes cover comps`,
    };
  }

  // Paid for everyone.
  if (guest.enabled && guest.tickets.length >= 1 && guestPrice > 0 && !member.enabled) {
    return {
      ok: true,
      eventId: args.eventId,
      workspaceId: args.workspaceId,
      title: args.title,
      spec: {
        kind: "GROUP",
        rule: "ALL",
        children: [{ kind: "CONDITION", conditionType: "PAY", config: { priceCents: guestPrice } }],
      },
      summary: `everyone pays $${(guestPrice / 100).toFixed(2)}`,
    };
  }

  // Apply to attend (guest lane application).
  if (guest.enabled && guest.applications.length >= 1 && guest.tickets.length === 0) {
    return {
      ok: true,
      eventId: args.eventId,
      workspaceId: args.workspaceId,
      title: args.title,
      spec: {
        kind: "GROUP",
        rule: "ALL",
        children: [{ kind: "CONDITION", conditionType: "ANSWER_QUESTIONS", config: {} }],
      },
      summary: "everyone applies; your review decides",
    };
  }

  return {
    ok: false,
    eventId: args.eventId,
    reason: "eventAccess shape not covered by the converter - compose the gate in the builder instead",
  };
}

export async function convertEvent(
  db: PrismaClient,
  args: { eventId: string; execute: boolean },
): Promise<ConversionPlan & { executed?: boolean; gateId?: string }> {
  const event = await db.event.findUnique({
    where: { id: args.eventId },
    select: { id: true, workspaceId: true, title: true, eventAccess: true },
  });
  if (!event) {
    return { ok: false, eventId: args.eventId, reason: "event not found" };
  }
  const existing = await db.gate.findFirst({
    where: { workspaceId: event.workspaceId, resourceType: "EVENT", resourceId: event.id },
    select: { id: true },
  });
  if (existing) {
    return {
      ok: false,
      eventId: args.eventId,
      reason: `event already has a gate (${existing.id}) - nothing to convert`,
    };
  }

  const plan = planConversion({
    eventId: event.id,
    workspaceId: event.workspaceId,
    title: event.title,
    eventAccess: event.eventAccess,
  });
  if (!plan.ok || !args.execute) return plan;

  const { getGateEngine } = await import("@/lib/gate-engine");
  const created = await getGateEngine().createGate({
    workspaceId: plan.workspaceId,
    resource: { type: "EVENT", id: plan.eventId },
    name: `${plan.title} - cutover gate`,
    spec: plan.spec,
  });
  return { ...plan, executed: true, gateId: created.gateId };
}

export async function rollbackEvent(
  db: PrismaClient,
  eventId: string,
): Promise<{ removed: boolean }> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, workspaceId: true },
  });
  if (!event) return { removed: false };
  const gate = await db.gate.findFirst({
    where: { workspaceId: event.workspaceId, resourceType: "EVENT", resourceId: event.id },
    select: { id: true },
  });
  if (!gate) return { removed: false };
  const { getGateEngine } = await import("@/lib/gate-engine");
  await getGateEngine().deleteGate({ workspaceId: event.workspaceId, gateId: gate.id });
  return { removed: true };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const execute = argv.includes("--execute");
  const rollback = argv.includes("--rollback");
  const eventIdx = argv.indexOf("--event");
  const eventId = eventIdx >= 0 ? argv[eventIdx + 1] : NBS_EVENT_ID;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (expected in .env.local)");
  const host = url.match(/@([^/]+)\//)?.[1] ?? "unknown-host";
  const isProd = url.includes("ep-twilight-forest");
  console.log(`Target DB host: ${host}${isProd ? "  << PRODUCTION" : ""}`);
  console.log(`Event: ${eventId}`);
  console.log(`Mode: ${rollback ? "ROLLBACK" : execute ? "EXECUTE" : "dry run"}`);

  if ((execute || rollback) && process.env.CUTOVER_CONFIRM !== "NBS") {
    throw new Error(
      "Refusing to write: set CUTOVER_CONFIRM=NBS to confirm. Dry run needs no flag.",
    );
  }

  const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });
  try {
    if (rollback) {
      const result = await rollbackEvent(db, eventId);
      console.log(
        result.removed
          ? "Gate removed - the event renders the legacy path again."
          : "No gate found - nothing to roll back.",
      );
      return;
    }
    const result = await convertEvent(db, { eventId, execute });
    if (!result.ok) {
      console.log(`NOT CONVERTIBLE: ${result.reason}`);
      process.exitCode = 2;
      return;
    }
    console.log(`Plan: ${result.summary}`);
    console.log(JSON.stringify(result.spec, null, 2));
    if (result.executed) {
      console.log(`EXECUTED - gate ${result.gateId} created. Legacy fields untouched.`);
      console.log("Verify the page, then delete the gate with --rollback if anything is off.");
    } else {
      console.log("Dry run - nothing written. Re-run with --execute (and CUTOVER_CONFIRM=NBS) to apply.");
    }
  } finally {
    await db.$disconnect();
  }
}

// Only run as a CLI - tests import the functions above.
if (process.argv[1]?.endsWith("nbs-to-v3.ts")) {
  main().catch((err) => {
    console.error("[nbs-to-v3] failed:", err);
    process.exit(1);
  });
}

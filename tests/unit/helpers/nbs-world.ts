/** NBS baseline replica - a deterministic copy of the No Bad Saturday event
 *  SHAPE (never the prod row) on the confirmed dev branch, for the Event
 *  Builder Rebuild acceptance runs.
 *
 *  The replica mirrors the audit-documented live shape: a PUBLISHED event
 *  whose eventAccess JSON carries the ticket price in BOTH known locations
 *  (lane-level guest.priceCents, which priceForResolved actually charges,
 *  and guest.gates[0].priceCents, which the builder UI edits), plus a
 *  blanked EventWorkflow.paths row ('[]' - the hand-run prod fix that killed
 *  the ghost free-entry card). Phase 0 pins this render behavior; Phase D's
 *  converter rehearses against it.
 *
 *  Shared by tests/unit/nbs-render-baseline.db.test.ts and
 *  scripts/seed-event-builder.ts. Idempotent: cleanup deletes in FK-safe
 *  order, keyed by workspace slug.
 */
import type { Prisma, PrismaClient, Workspace } from "@prisma/client";

export const NBS_WORLD_SLUG = "event-builder-nbs-baseline";
export const NBS_REPLICA_EVENT_SLUG = "nbs-baseline-replica";
export const BUILDER_WORLD_SLUG = "event-builder-acceptance";

/** The audit-documented NBS eventAccess shape. $25 lives in both places. */
export const NBS_EVENT_ACCESS = {
  member: { enabled: true, gates: [], priceCents: 0 },
  guest: {
    enabled: true,
    gates: [
      { id: "g-ticket", type: "ticket", label: "Ticket", priceCents: 2500 },
    ],
    priceCents: 2500,
  },
  comp: { enabled: true, budgetCap: null },
  registrationStyle: "all_at_once",
} as const;

export type NbsWorld = {
  workspace: Workspace;
  eventId: string;
  eventSlug: string;
};

export async function cleanupWorld(
  db: PrismaClient,
  slug: string,
): Promise<void> {
  const ws = await db.workspace.findUnique({ where: { slug } });
  if (!ws) return;
  const scope = { workspaceId: ws.id };
  await db.growthEdge.deleteMany({ where: scope });
  await db.gateProof.deleteMany({
    where: { node: { gate: { workspaceId: ws.id } } },
  });
  await db.gateSession.deleteMany({ where: { gate: { workspaceId: ws.id } } });
  await db.gateNode.deleteMany({ where: { gate: { workspaceId: ws.id } } });
  await db.gate.deleteMany({ where: scope });
  await db.promoRedemption.deleteMany({ where: { order: { workspaceId: ws.id } } });
  await db.ticket.deleteMany({ where: scope });
  await db.rSVP.deleteMany({ where: scope });
  await db.order.deleteMany({ where: scope });
  await db.promoCode.deleteMany({ where: scope });
  await db.eventWorkflow.deleteMany({ where: scope });
  await db.application.deleteMany({ where: scope });
  await db.event.deleteMany({ where: scope });
  await db.member.deleteMany({ where: scope });
  await db.workspace.delete({ where: { id: ws.id } });
}

/** Seed the NBS-shape replica world. Returns ids the baseline test pins. */
export async function seedNbsWorld(
  db: PrismaClient,
  slug: string = NBS_WORLD_SLUG,
): Promise<NbsWorld> {
  await cleanupWorld(db, slug);

  const workspace = await db.workspace.create({
    data: {
      clerkOrgId: `org_${slug.replace(/-/g, "_")}`,
      name: `NBS baseline replica (${slug})`,
      slug,
    },
  });

  const event = await db.event.create({
    data: {
      workspaceId: workspace.id,
      slug: NBS_REPLICA_EVENT_SLUG,
      title: "No Bad Saturday (baseline replica)",
      description: "Baseline replica of the live event shape. Dev data only.",
      startAt: new Date("2026-07-12T02:00:00.000Z"),
      location: "The Back Room",
      status: "PUBLISHED",
      template: "split",
      eventAccess: NBS_EVENT_ACCESS as unknown as Prisma.InputJsonValue,
    },
    select: { id: true, slug: true },
  });

  // The blanked workflow row - prod's hand-run '[]' fix, replicated.
  await db.eventWorkflow.create({
    data: {
      workspaceId: workspace.id,
      eventId: event.id,
      paths: [] as unknown as Prisma.InputJsonValue,
    },
  });

  return { workspace, eventId: event.id, eventSlug: event.slug };
}

/** Seed the blank builder-acceptance workspace (Phase B/E runs build inside it). */
export async function seedBuilderWorld(
  db: PrismaClient,
  slug: string = BUILDER_WORLD_SLUG,
): Promise<Workspace> {
  await cleanupWorld(db, slug);
  return db.workspace.create({
    data: {
      clerkOrgId: `org_${slug.replace(/-/g, "_")}`,
      name: `Event Builder acceptance (${slug})`,
      slug,
    },
  });
}

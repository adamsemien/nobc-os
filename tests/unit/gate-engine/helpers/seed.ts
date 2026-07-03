/** Deterministic acceptance world for Gate Engine M1 (Stage 17).
 *
 *  Everything lives under one clearly-named workspace (slug
 *  "gate-m1-acceptance") on the CONFIRMED dev branch. Seeding is idempotent:
 *  cleanup runs first and deletes in FK-safe order. Shared between the
 *  acceptance suite and scripts/seed-gate-m1.ts.
 */
import type { Member, Prisma, PrismaClient, Workspace } from "@prisma/client";

export const ACCEPTANCE_SLUG = "gate-m1-acceptance";

export type AcceptanceWorld = {
  workspace: Workspace;
  referrer: Member;
  referredGuest: Member;
  paidOnlyGuest: Member;
  attendee: Member;
  applicant: Member;
  staleApplicant: Member;
  unclearApplicant: Member;
  revocable: Member;
  applicationId: string;
  unclearApplicationId: string;
  pastEventId: string;
};

export async function cleanupAcceptanceWorld(
  db: PrismaClient,
  slug: string = ACCEPTANCE_SLUG
): Promise<void> {
  const ws = await db.workspace.findUnique({ where: { slug } });
  if (!ws) return;
  const scope = { workspaceId: ws.id };
  await db.growthEdge.deleteMany({ where: scope });
  await db.gateProof.deleteMany({ where: scope });
  await db.gateSession.deleteMany({ where: scope });
  await db.gateNode.deleteMany({ where: scope });
  await db.gate.deleteMany({ where: scope });
  // Commerce rows (Phase A bridge) - FK order: redemption -> ticket -> rsvp
  // -> order -> promo (Ticket references RSVP; RSVP references Order).
  await db.promoRedemption.deleteMany({ where: scope });
  await db.ticket.deleteMany({ where: scope });
  await db.rSVP.deleteMany({ where: scope });
  await db.order.deleteMany({ where: scope });
  await db.promoCode.deleteMany({ where: scope });
  await db.application.deleteMany({ where: scope });
  // The commerce bridge + refund machine audit their writes (Phase A/C).
  await db.auditEvent.deleteMany({ where: scope });
  await db.event.deleteMany({ where: scope });
  // Series rows are referenced by events - delete after events (L7 tests).
  await db.eventSeries.deleteMany({ where: scope });
  await db.member.deleteMany({ where: scope });
  await db.workspace.delete({ where: { id: ws.id } });
}

async function makeMember(
  db: PrismaClient,
  workspaceId: string,
  key: string,
  overrides: Partial<Prisma.MemberUncheckedCreateInput> = {}
): Promise<Member> {
  const data: Prisma.MemberUncheckedCreateInput = {
    workspaceId,
    clerkUserId: `user_gm1_${key}`,
    email: `gate-m1-${key}@example.com`,
    firstName: "Gate",
    lastName: `M1 ${key}`,
    status: "GUEST",
    ...overrides,
  };
  return db.member.create({ data });
}

export async function makeEvent(
  db: PrismaClient,
  workspaceId: string,
  slug: string
): Promise<string> {
  const event = await db.event.create({
    data: {
      workspaceId,
      slug,
      title: `Gate M1 acceptance - ${slug}`,
      startAt: new Date("2026-08-01T01:00:00.000Z"),
      status: "PUBLISHED",
    },
    select: { id: true },
  });
  return event.id;
}

/** Each suite passes its own slug so parallel test files never collide on
 *  the workspace-level uniques (slug, clerkOrgId). Member uniques are
 *  workspace-scoped and need no suffix. */
export async function seedAcceptanceWorld(
  db: PrismaClient,
  slug: string = ACCEPTANCE_SLUG
): Promise<AcceptanceWorld> {
  await cleanupAcceptanceWorld(db, slug);

  const workspace = await db.workspace.create({
    data: {
      clerkOrgId: `org_${slug.replace(/-/g, "_")}`,
      name: `Gate acceptance (${slug})`,
      slug,
    },
  });

  const referrer = await makeMember(db, workspace.id, "referrer", {
    status: "APPROVED",
    approved: true,
    approvedAt: new Date("2026-01-15T00:00:00.000Z"),
  });
  const referredGuest = await makeMember(db, workspace.id, "referred-guest", {
    referredByMemberId: referrer.id,
  });
  const paidOnlyGuest = await makeMember(db, workspace.id, "paid-only-guest");
  const attendee = await makeMember(db, workspace.id, "attendee");
  const applicant = await makeMember(db, workspace.id, "applicant");
  const staleApplicant = await makeMember(db, workspace.id, "stale-applicant");
  const unclearApplicant = await makeMember(db, workspace.id, "unclear-applicant");
  const revocable = await makeMember(db, workspace.id, "revocable", {
    status: "APPROVED",
    approved: true,
    approvedAt: new Date("2026-02-01T00:00:00.000Z"),
  });

  // A past event with a REAL checked-in Access record for the attendee -
  // ATTENDED_PRIOR reads these rows.
  const pastEventId = await makeEvent(db, workspace.id, "gate-m1-past-event");
  await db.rSVP.create({
    data: {
      workspaceId: workspace.id,
      eventId: pastEventId,
      memberId: attendee.id,
      status: "CONFIRMED",
      checkedIn: true,
      checkedInAt: new Date("2026-05-01T03:00:00.000Z"),
    },
  });

  // Real Application rows - ANSWER_QUESTIONS wraps the application flow.
  const application = await db.application.create({
    data: {
      workspaceId: workspace.id,
      memberId: applicant.id,
      email: applicant.email,
      fullName: "Gate M1 Applicant",
      status: "PENDING",
    },
    select: { id: true },
  });
  const unclearApplication = await db.application.create({
    data: {
      workspaceId: workspace.id,
      memberId: unclearApplicant.id,
      email: unclearApplicant.email,
      fullName: "Gate M1 Unclear Applicant",
      status: "PENDING",
    },
    select: { id: true },
  });

  return {
    workspace,
    referrer,
    referredGuest,
    paidOnlyGuest,
    attendee,
    applicant,
    staleApplicant,
    unclearApplicant,
    revocable,
    applicationId: application.id,
    unclearApplicationId: unclearApplication.id,
    pastEventId,
  };
}

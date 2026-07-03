"use server";

/** THE builder action layer (Event Builder Rebuild, Phase B - Decision 6).
 *
 *  Every builder operation is a typed server action here. The Prism UI and
 *  the AI composer call these SAME functions - the AI has zero capabilities
 *  the UI lacks, and neither has a private write path. Laws enforced at this
 *  layer, not in callers:
 *
 *  - STAFF+ only, workspace-scoped on every read and write.
 *  - New events write ONLY the v3 shape: generic Event columns + the Gate
 *    tree + fee columns + promo codes. NEVER accessMode / priceInCents /
 *    approvalRequired / eventAccess / EventWorkflow.paths (acceptance 3 -
 *    tested in tests/unit/builder-actions.db.test.ts).
 *  - publishEvent demands a literal confirm flag the AI composer never sets;
 *    humans approve, AI operates.
 *
 *  Each action returns { ok: true, ... } | { ok: false, error } - guest-safe
 *  strings, brand law throughout.
 */
import { OperatorRole, type Prisma, type ServiceFeeMode } from "@prisma/client";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { getMemberWorkspaceId } from "@/lib/auth";
import { getEffectiveRole, roleAtLeast } from "@/lib/operator-role";
import { getGateEngine } from "@/lib/gate-engine";
import { GateAuthoringError } from "@/lib/gate-engine/authoring";
import { openGateSpec, type GateNodeSpec } from "@/lib/gate-engine/types";
import { validateGateSpec } from "@/lib/gate-engine/validate";
import { getDefaultRegistry } from "@/lib/gate-engine";
import { mintPreviewToken } from "@/lib/preview-token";

// ── Auth ────────────────────────────────────────────────────────────────────

type Operator = { userId: string; workspaceId: string };

async function requireStaff(): Promise<
  { ok: true; op: Operator } | { ok: false; error: string }
> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Sign in required." };
  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) return { ok: false, error: "No workspace." };
  const role = await getEffectiveRole(userId, workspaceId);
  if (!role || !roleAtLeast(role, OperatorRole.STAFF)) {
    return { ok: false, error: "You do not have access to the builder." };
  }
  return { ok: true, op: { userId, workspaceId } };
}

async function ownedEvent(
  op: Operator,
  eventId: string,
): Promise<{ id: string; slug: string; status: string } | null> {
  return db.event.findFirst({
    where: { id: eventId, workspaceId: op.workspaceId },
    select: { id: true, slug: true, status: true },
  });
}

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

// ── Create ──────────────────────────────────────────────────────────────────

const createSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  startAt: z.string().datetime().optional(),
  location: z.string().max(300).optional(),
});

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Next Saturday, 8pm local, as the smart default start. */
function defaultStartAt(now = new Date()): Date {
  const d = new Date(now);
  const day = d.getDay();
  const daysToSaturday = (6 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + daysToSaturday);
  d.setHours(20, 0, 0, 0);
  return d;
}

/** One interaction to a live draft: smart defaults everywhere, nothing
 *  required, publish never blocked on missing fields (Operating Doc 4.1). */
export async function createEventDraft(
  input: z.infer<typeof createSchema> = {},
): Promise<ActionResult<{ eventId: string; slug: string }>> {
  const gate = await requireStaff();
  if (!gate.ok) return gate;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That could not be read." };

  const title = parsed.data.title?.trim() || "Untitled evening";
  const base = slugify(title) || "untitled-evening";
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const taken = await db.event.findUnique({
      where: { workspaceId_slug: { workspaceId: gate.op.workspaceId, slug } },
      select: { id: true },
    });
    if (!taken) break;
    slug = `${base}-${i}`;
  }

  const event = await db.event.create({
    data: {
      workspaceId: gate.op.workspaceId,
      title,
      slug,
      status: "DRAFT",
      template: "split",
      startAt: parsed.data.startAt
        ? new Date(parsed.data.startAt)
        : defaultStartAt(),
      location: parsed.data.location ?? null,
    },
    select: { id: true, slug: true },
  });

  // Loose Ends L1 (Adam's decision: default gate on create): every fresh
  // draft mints the canonical open gate, so the rail sentence and the anon
  // render agree from the first second and the legacy access fallback never
  // decides a rebuild draft's door. Gate mint failing means the draft must
  // not exist - a gateless rebuild draft is exactly the seam this closes.
  try {
    await getGateEngine().createGate({
      workspaceId: gate.op.workspaceId,
      resource: { type: "EVENT", id: event.id },
      spec: openGateSpec(),
    });
  } catch (err) {
    console.error("[builder-actions] default open gate mint failed", {
      eventId: event.id,
      workspaceId: gate.op.workspaceId,
      error: err instanceof Error ? err.message : String(err),
    });
    await db.event
      .delete({ where: { id: event.id } })
      .catch(() => undefined);
    return { ok: false, error: "Something went wrong creating the draft." };
  }

  await db.auditEvent.create({
    data: {
      workspaceId: gate.op.workspaceId,
      actorId: gate.op.userId,
      action: "event.draft_created",
      entityType: "Event",
      entityId: event.id,
      metadata: { surface: "builder" },
    },
  });
  return { ok: true, eventId: event.id, slug: event.slug };
}

// ── Details ─────────────────────────────────────────────────────────────────

const detailsSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(10_000).nullable().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().nullable().optional(),
  location: z.string().max(300).nullable().optional(),
  mapsUrl: z.string().url().max(500).nullable().optional(),
  capacity: z.number().int().min(1).max(100_000).nullable().optional(),
  showCapacity: z.boolean().optional(),
  template: z.enum(["split", "editorial", "minimal"]).optional(),
  heroImageAssetId: z.string().max(500).nullable().optional(),
  /** Page theme (Phase 2) - merged into Event.pageStyle.theme; the palette
   *  register the guest page renders in. Orthogonal to template. */
  pageTheme: z.enum(["paper", "night"]).optional(),
  /** Hero fit (Loose Ends L6) - merged into Event.pageStyle.heroFit. Cover
   *  fills the frame (default); contain shows the whole poster. */
  heroFit: z.enum(["cover", "contain"]).optional(),
});

export async function updateEventDetails(
  eventId: string,
  patch: z.infer<typeof detailsSchema>,
): Promise<ActionResult> {
  const gate = await requireStaff();
  if (!gate.ok) return gate;
  const event = await ownedEvent(gate.op, eventId);
  if (!event) return { ok: false, error: "Event not found." };
  const parsed = detailsSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: "That could not be read." };
  const d = parsed.data;

  // Theme + hero fit ride Event.pageStyle (jsonb) - merge, never clobber the
  // other page-style knobs the operator may have set on the member editor.
  let pageStyleWrite: Prisma.InputJsonValue | undefined;
  if (d.pageTheme !== undefined || d.heroFit !== undefined) {
    const current = await db.event.findFirst({
      where: { id: event.id },
      select: { pageStyle: true },
    });
    const existing =
      current?.pageStyle && typeof current.pageStyle === "object"
        ? (current.pageStyle as Record<string, unknown>)
        : {};
    pageStyleWrite = {
      ...existing,
      ...(d.pageTheme !== undefined ? { theme: d.pageTheme } : {}),
      ...(d.heroFit !== undefined ? { heroFit: d.heroFit } : {}),
    } as Prisma.InputJsonValue;
  }

  await db.event.update({
    where: { id: event.id },
    data: {
      ...(d.title !== undefined ? { title: d.title.trim() } : {}),
      ...(d.description !== undefined ? { description: d.description } : {}),
      ...(d.startAt !== undefined ? { startAt: new Date(d.startAt) } : {}),
      ...(d.endAt !== undefined
        ? { endAt: d.endAt === null ? null : new Date(d.endAt) }
        : {}),
      ...(d.location !== undefined ? { location: d.location } : {}),
      ...(d.mapsUrl !== undefined ? { mapsUrl: d.mapsUrl } : {}),
      ...(d.capacity !== undefined ? { capacity: d.capacity } : {}),
      ...(d.showCapacity !== undefined ? { showCapacity: d.showCapacity } : {}),
      ...(d.template !== undefined ? { template: d.template } : {}),
      ...(d.heroImageAssetId !== undefined
        ? { heroImageAssetId: d.heroImageAssetId }
        : {}),
      ...(pageStyleWrite !== undefined ? { pageStyle: pageStyleWrite } : {}),
    },
  });
  return { ok: true };
}

// ── Access (the Gate is the door) ───────────────────────────────────────────

/** Set (create or replace) the event's gate from a spec; null removes the
 *  gate entirely - "Open - anyone can get in". All validation runs through
 *  the engine's own validateGateSpec + authoring surface. */
export async function setGateSpec(
  eventId: string,
  spec: GateNodeSpec | null,
): Promise<ActionResult> {
  const gate = await requireStaff();
  if (!gate.ok) return gate;
  const event = await ownedEvent(gate.op, eventId);
  if (!event) return { ok: false, error: "Event not found." };
  const engine = getGateEngine();
  const existing = await engine.getGateForResource({
    workspaceId: gate.op.workspaceId,
    resource: { type: "EVENT", id: event.id },
  });

  try {
    if (spec === null) {
      if (existing) {
        await engine.deleteGate({
          workspaceId: gate.op.workspaceId,
          gateId: existing.gateId,
        });
      }
      return { ok: true };
    }
    const valid = validateGateSpec(spec, getDefaultRegistry());
    if (!valid.valid) {
      return { ok: false, error: "That gate does not hold together yet." };
    }
    if (existing) {
      await engine.updateGate({
        workspaceId: gate.op.workspaceId,
        gateId: existing.gateId,
        spec,
      });
    } else {
      await engine.createGate({
        workspaceId: gate.op.workspaceId,
        resource: { type: "EVENT", id: event.id },
        spec,
      });
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof GateAuthoringError) {
      return { ok: false, error: "That gate does not hold together yet." };
    }
    console.error("[builder-actions] setGateSpec failed", {
      eventId,
      workspaceId: gate.op.workspaceId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: "Something went wrong saving the gate." };
  }
}

// ── Service fee (Decision 3) ────────────────────────────────────────────────

const feeSchema = z.object({
  mode: z.enum([
    "absorb",
    "pass_stripe_only",
    "pass_stripe_plus_markup",
    "flat_per_ticket",
  ]),
  percentBps: z.number().int().min(0).max(5000).nullable().optional(),
  flatCents: z.number().int().min(0).max(100_000).nullable().optional(),
});

export async function setServiceFee(
  eventId: string,
  fee: z.infer<typeof feeSchema>,
): Promise<ActionResult> {
  const gate = await requireStaff();
  if (!gate.ok) return gate;
  const event = await ownedEvent(gate.op, eventId);
  if (!event) return { ok: false, error: "Event not found." };
  const parsed = feeSchema.safeParse(fee);
  if (!parsed.success) return { ok: false, error: "That could not be read." };
  await db.event.update({
    where: { id: event.id },
    data: {
      serviceFeeMode: parsed.data.mode as ServiceFeeMode,
      serviceFeePercentBps: parsed.data.percentBps ?? null,
      serviceFeeFlatCents: parsed.data.flatCents ?? null,
    },
  });
  return { ok: true };
}

// ── Comp codes (Decision 5) ─────────────────────────────────────────────────

const compCodeSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, "letters, numbers, and hyphens"),
  maxUses: z.number().int().min(1).max(10_000).nullable().optional(),
});

export async function createCompCode(
  eventId: string,
  input: z.infer<typeof compCodeSchema>,
): Promise<ActionResult<{ promoCodeId: string }>> {
  const gate = await requireStaff();
  if (!gate.ok) return gate;
  const event = await ownedEvent(gate.op, eventId);
  if (!event) return { ok: false, error: "Event not found." };
  const parsed = compCodeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Codes are 3-40 letters, numbers, or hyphens." };
  }
  const code = parsed.data.code.toUpperCase();
  const existing = await db.promoCode.findFirst({
    where: { workspaceId: gate.op.workspaceId, eventId: event.id, code },
    select: { id: true },
  });
  if (existing) return { ok: false, error: "That code already exists." };
  const promo = await db.promoCode.create({
    data: {
      workspaceId: gate.op.workspaceId,
      eventId: event.id,
      code,
      discountType: "comp",
      discountValue: 100,
      maxUses: parsed.data.maxUses ?? null,
    },
    select: { id: true },
  });
  return { ok: true, promoCodeId: promo.id };
}

// ── Discount codes (D6) ─────────────────────────────────────────────────────

const discountCodeSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, "letters, numbers, and hyphens"),
  discountType: z.enum(["percent", "flat"]),
  /** percent: whole percent. flat: cents off. */
  discountValue: z.number().int().min(1),
  maxUses: z.number().int().min(1).max(10_000).nullable().optional(),
  maxUsesPerCustomer: z.number().int().min(1).max(100).nullable().optional(),
  validFrom: z.string().nullable().optional(),
  validUntil: z.string().nullable().optional(),
});

function parseWindowDate(
  value: string | null | undefined,
): Date | null | "invalid" {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "invalid" : date;
}

export async function createDiscountCode(
  eventId: string,
  input: z.infer<typeof discountCodeSchema>,
): Promise<ActionResult<{ promoCodeId: string }>> {
  const gate = await requireStaff();
  if (!gate.ok) return gate;
  const event = await ownedEvent(gate.op, eventId);
  if (!event) return { ok: false, error: "Event not found." };
  const parsed = discountCodeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Codes are 3-40 letters, numbers, or hyphens." };
  }
  // A 100% discount is a comp in disguise - the comp machinery owns full
  // comps (D6-2), so percent caps at 99 here.
  if (parsed.data.discountType === "percent" && parsed.data.discountValue > 99) {
    return {
      ok: false,
      error: "Percent discounts run 1-99. Use a comp code for full comps.",
    };
  }
  if (
    parsed.data.discountType === "flat" &&
    parsed.data.discountValue > 1_000_000
  ) {
    return { ok: false, error: "That discount is too large." };
  }
  const validFrom = parseWindowDate(parsed.data.validFrom);
  const validUntil = parseWindowDate(parsed.data.validUntil);
  if (validFrom === "invalid" || validUntil === "invalid") {
    return { ok: false, error: "That date could not be read." };
  }
  if (validFrom && validUntil && validUntil.getTime() <= validFrom.getTime()) {
    return { ok: false, error: "The window must end after it starts." };
  }
  const code = parsed.data.code.toUpperCase();
  const existing = await db.promoCode.findFirst({
    where: { workspaceId: gate.op.workspaceId, eventId: event.id, code },
    select: { id: true },
  });
  if (existing) return { ok: false, error: "That code already exists." };
  const promo = await db.promoCode.create({
    data: {
      workspaceId: gate.op.workspaceId,
      eventId: event.id,
      code,
      discountType: parsed.data.discountType,
      discountValue: parsed.data.discountValue,
      maxUses: parsed.data.maxUses ?? null,
      maxUsesPerCustomer: parsed.data.maxUsesPerCustomer ?? null,
      validFrom,
      validUntil,
    },
    select: { id: true },
  });
  return { ok: true, promoCodeId: promo.id };
}

export async function deactivateCompCode(
  eventId: string,
  promoCodeId: string,
): Promise<ActionResult> {
  const gate = await requireStaff();
  if (!gate.ok) return gate;
  const promo = await db.promoCode.findFirst({
    where: { id: promoCodeId, workspaceId: gate.op.workspaceId, eventId },
    select: { id: true },
  });
  if (!promo) return { ok: false, error: "Code not found." };
  await db.promoCode.update({
    where: { id: promo.id },
    data: { validUntil: new Date() },
  });
  return { ok: true };
}

// ── Publish (humans approve; the AI composer never sets confirm) ────────────

export async function publishEvent(
  eventId: string,
  opts: { confirm: boolean },
): Promise<ActionResult> {
  const gate = await requireStaff();
  if (!gate.ok) return gate;
  if (opts.confirm !== true) {
    return { ok: false, error: "Publishing needs explicit confirmation." };
  }
  const event = await ownedEvent(gate.op, eventId);
  if (!event) return { ok: false, error: "Event not found." };
  await db.event.update({
    where: { id: event.id },
    data: { status: "PUBLISHED" },
  });
  await db.auditEvent.create({
    data: {
      workspaceId: gate.op.workspaceId,
      actorId: gate.op.userId,
      action: "event.published",
      entityType: "Event",
      entityId: event.id,
      metadata: { surface: "builder" },
    },
  });
  return { ok: true };
}

export async function unpublishEvent(eventId: string): Promise<ActionResult> {
  const gate = await requireStaff();
  if (!gate.ok) return gate;
  const event = await ownedEvent(gate.op, eventId);
  if (!event) return { ok: false, error: "Event not found." };
  await db.event.update({
    where: { id: event.id },
    data: { status: "DRAFT" },
  });
  return { ok: true };
}

// ── Preview + read model ────────────────────────────────────────────────────

export async function getPreviewToken(
  eventId: string,
): Promise<ActionResult<{ token: string; url: string }>> {
  const gate = await requireStaff();
  if (!gate.ok) return gate;
  const event = await ownedEvent(gate.op, eventId);
  if (!event) return { ok: false, error: "Event not found." };
  const token = mintPreviewToken({
    workspaceId: gate.op.workspaceId,
    eventId: event.id,
  });
  // Fail-open to the operator-session path: the raw event id works for
  // signed-in STAFF when CHECKIN_SECRET is unset (dev).
  const value = token ?? event.id;
  return { ok: true, token: value, url: `/e/preview/${value}` };
}

export type BuilderState = {
  event: {
    id: string;
    slug: string;
    status: string;
    title: string;
    description: string | null;
    startAt: string | null;
    endAt: string | null;
    location: string | null;
    mapsUrl: string | null;
    capacity: number | null;
    showCapacity: boolean;
    template: string;
    pageTheme: "paper" | "night";
    heroFit: "cover" | "contain";
    heroImageAssetId: string | null;
    serviceFeeMode: string;
    serviceFeePercentBps: number | null;
    serviceFeeFlatCents: number | null;
  };
  gate: { gateId: string; tree: unknown } | null;
  compCodes: {
    id: string;
    code: string;
    maxUses: number | null;
    usedCount: number;
    active: boolean;
  }[];
  discountCodes: {
    id: string;
    code: string;
    discountType: string;
    discountValue: number;
    maxUses: number | null;
    maxUsesPerCustomer: number | null;
    usedCount: number;
    active: boolean;
  }[];
};

export async function getBuilderState(
  eventId: string,
): Promise<ActionResult<{ state: BuilderState }>> {
  const gate = await requireStaff();
  if (!gate.ok) return gate;
  const event = await db.event.findFirst({
    where: { id: eventId, workspaceId: gate.op.workspaceId },
    select: {
      id: true,
      slug: true,
      status: true,
      title: true,
      description: true,
      startAt: true,
      endAt: true,
      location: true,
      mapsUrl: true,
      capacity: true,
      showCapacity: true,
      template: true,
      pageStyle: true,
      heroImageAssetId: true,
      serviceFeeMode: true,
      serviceFeePercentBps: true,
      serviceFeeFlatCents: true,
    },
  });
  if (!event) return { ok: false, error: "Event not found." };

  const engine = getGateEngine();
  const loaded = await engine.getGateForResource({
    workspaceId: gate.op.workspaceId,
    resource: { type: "EVENT", id: event.id },
  });
  const codes = await db.promoCode.findMany({
    where: {
      workspaceId: gate.op.workspaceId,
      eventId: event.id,
      discountType: "comp",
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      maxUses: true,
      usedCount: true,
      validUntil: true,
    },
  });
  const partials = await db.promoCode.findMany({
    where: {
      workspaceId: gate.op.workspaceId,
      eventId: event.id,
      discountType: { in: ["percent", "flat"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      discountType: true,
      discountValue: true,
      maxUses: true,
      maxUsesPerCustomer: true,
      usedCount: true,
      validFrom: true,
      validUntil: true,
    },
  });

  return {
    ok: true,
    state: {
      event: {
        id: event.id,
        slug: event.slug,
        status: event.status,
        title: event.title,
        description: event.description,
        startAt: event.startAt ? event.startAt.toISOString() : null,
        endAt: event.endAt ? event.endAt.toISOString() : null,
        location: event.location,
        mapsUrl: event.mapsUrl,
        capacity: event.capacity,
        showCapacity: event.showCapacity,
        template: event.template ?? "split",
        pageTheme:
          event.pageStyle &&
          typeof event.pageStyle === "object" &&
          (event.pageStyle as { theme?: unknown }).theme === "night"
            ? "night"
            : "paper",
        heroFit:
          event.pageStyle &&
          typeof event.pageStyle === "object" &&
          (event.pageStyle as { heroFit?: unknown }).heroFit === "contain"
            ? "contain"
            : "cover",
        heroImageAssetId: event.heroImageAssetId ?? null,
        serviceFeeMode: event.serviceFeeMode,
        serviceFeePercentBps: event.serviceFeePercentBps,
        serviceFeeFlatCents: event.serviceFeeFlatCents,
      },
      gate: loaded ? { gateId: loaded.gateId, tree: loaded.tree } : null,
      compCodes: codes.map((c) => ({
        id: c.id,
        code: c.code,
        maxUses: c.maxUses,
        usedCount: c.usedCount,
        active: c.validUntil === null || c.validUntil.getTime() > Date.now(),
      })),
      discountCodes: partials.map((c) => ({
        id: c.id,
        code: c.code,
        discountType: c.discountType,
        discountValue: c.discountValue,
        maxUses: c.maxUses,
        maxUsesPerCustomer: c.maxUsesPerCustomer,
        usedCount: c.usedCount,
        active:
          (c.validFrom === null || c.validFrom.getTime() <= Date.now()) &&
          (c.validUntil === null || c.validUntil.getTime() > Date.now()),
      })),
    },
  };
}

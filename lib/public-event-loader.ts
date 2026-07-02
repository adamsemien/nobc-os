/**
 * Public event loader — the F4 enforcement point.
 *
 * Both public API routes (/api/e/[slug]/access/submit and
 * /api/e/[slug]/access/payment-intent) resolve the workspace through this
 * module and NEVER accept workspaceId from client input.
 *
 * Two-step resolve:
 *   Step 1: resolvePublishedEventBySlug — slug → { workspaceId, eventId } | null
 *            (db.event.findFirst by slug + status; workspaceId is server-derived)
 *   Step 2: all downstream queries are scoped to that workspaceId.
 *
 * assemblePublicEventDTO builds the same EventDetailDTO shape that
 * /app/m/events/[slug]/page.tsx assembles, but with viewer: "anon",
 * isOperator: false, and no member/RSVP data.
 */

import { db } from './db';
import { getEventBySlug, getCapacityUsedRsvpCount } from './events';
import { getEventHeroDisplayUrl } from './event-hero-url';
import {
  parseEventAccess,
  resolveViewer,
  resolveAccessForViewer,
  buildSteps,
} from './event-access';
import type { EventDetailDTO } from '@/app/m/events/[slug]/_components/EventDetail';
import type { WorkflowPath } from '@/lib/workflows/types';
import { parsePageStyle } from '@/lib/page-style';

function parseWorkflowPaths(value: unknown): WorkflowPath[] {
  if (!Array.isArray(value)) return [];
  return value as WorkflowPath[];
}

/**
 * Step 1 of F4. Returns { workspaceId, eventId } for a published event by
 * slug, or null if the event doesn't exist or isn't published.
 *
 * SECURITY: this is the only legitimate source of workspaceId for public
 * routes. Never substitute a client-supplied workspaceId.
 */
export async function resolvePublishedEventBySlug(
  slug: string,
): Promise<{ workspaceId: string; eventId: string } | null> {
  const evt = await db.event.findFirst({
    where: { slug, status: 'PUBLISHED' },
    select: { workspaceId: true, id: true },
  });
  if (!evt) return null;
  return { workspaceId: evt.workspaceId, eventId: evt.id };
}

/**
 * Full public DTO — same shape as the member portal page builds, but with
 * viewer forced to "anon" and isOperator: false. No member/RSVP/plus-one data.
 *
 * Returns null when the event is not found or not published.
 */
export async function assemblePublicEventDTO(
  slug: string,
): Promise<(EventDetailDTO & { workspaceId: string }) | null> {
  // Step 1: resolve workspace from slug.
  const resolved = await resolvePublishedEventBySlug(slug);
  if (!resolved) return null;

  // Step 2: the shared assembly, scoped to the server-derived workspaceId.
  return assembleAnonEventDTO(resolved.workspaceId, slug);
}

/**
 * Draft preview entry (Event Builder Rebuild, Phase B). The builder's WYSIWYG
 * pane and the token-gated /e/preview route resolve by (workspaceId, eventId)
 * — already authenticated by a signed preview token or an operator session —
 * then run the EXACT same assembly the live page runs. One code path, so the
 * preview and the published render can never drift (acceptance 2 by
 * construction). Status is deliberately not filtered here: previewing DRAFT
 * is the point. Callers own authorization.
 */
export async function assembleDraftPreviewDTO(
  workspaceId: string,
  eventId: string,
): Promise<(EventDetailDTO & { workspaceId: string }) | null> {
  const evt = await db.event.findFirst({
    where: { id: eventId, workspaceId },
    select: { slug: true },
  });
  if (!evt) return null;
  return assembleAnonEventDTO(workspaceId, evt.slug);
}

/** THE anon assembly - everything below runs identically for the live
 *  published page and the draft preview. Do not fork this. */
async function assembleAnonEventDTO(
  workspaceId: string,
  slug: string,
): Promise<(EventDetailDTO & { workspaceId: string }) | null> {
  // includeDraft is safe here: the live entry already enforced PUBLISHED via
  // resolvePublishedEventBySlug, and the preview entry is authorized by a
  // signed token or a STAFF+ session before it ever reaches this assembly.
  const event = await getEventBySlug(workspaceId, slug, { includeDraft: true });
  if (!event) return null;

  const heroImageUrl = getEventHeroDisplayUrl(event.heroImageAssetId ?? null);

  // Public page: no userId, no Member row.
  const viewer = resolveViewer(null, null); // → "anon"
  const eventAccess = parseEventAccess(event.eventAccess);
  const resolved2 = resolveAccessForViewer(eventAccess, viewer);

  const customQuestions = event.customQuestions.map((q) => ({
    id: q.id,
    type: q.fieldType.toLowerCase() as
      | 'text'
      | 'textarea'
      | 'select'
      | 'checkbox'
      | 'number'
      | 'date'
      | 'email'
      | 'phone',
    label: q.label,
    required: q.required,
    options: q.options.length > 0 ? q.options : undefined,
    showToMember: q.showToMember,
    showToGuest: q.showToGuest,
    whenInFlow: q.whenInFlow,
  }));

  const steps = buildSteps(
    resolved2,
    viewer,
    customQuestions.map((q) => ({
      whenInFlow: q.whenInFlow,
      showToMember: q.showToMember,
      showToGuest: q.showToGuest,
    })),
  );

  const [workflow, capacityUsedCount, gateRow] = await Promise.all([
    db.eventWorkflow.findUnique({
      where: { eventId: event.id },
      select: { paths: true },
    }),
    getCapacityUsedRsvpCount(event.id, workspaceId),
    // Stage 17 (M4): an Access Gate on the event switches the public door to
    // the gate walkthrough. Workspace-scoped like every other read here.
    db.gate.findFirst({
      where: { workspaceId, resourceType: 'EVENT', resourceId: event.id },
      select: { id: true },
    }),
  ]);

  const workflowPaths = parseWorkflowPaths(workflow?.paths);

  const dto: EventDetailDTO & { workspaceId: string } = {
    workspaceId,
    eventId: event.id,
    slug: event.slug,
    title: event.title,
    description: event.description,
    startAt: event.startAt,
    endAt: event.endAt,
    location: event.location,
    mapsUrl: event.mapsUrl,
    runOfShow: event.runOfShow,
    eventAccess,
    viewer,
    resolved: resolved2,
    steps,
    capacity: event.capacity,
    capacityUsedCount,
    showCapacity: event.showCapacity,
    plusOnesAllowed: event.plusOnesAllowed,
    heroImageUrl,
    memberApproved: false,
    memberId: null,
    memberQrCode: null,
    existingRsvp: null,
    customQuestions,
    tiers: (event.ticketTiers ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      memberPriceCents: t.memberPriceCents,
      nonMemberPriceCents: t.nonMemberPriceCents,
      quantity: t.quantity,
      soldCount: t.soldCount,
      heldCount: t.heldCount,
    })),
    plusOneRsvp: null,
    template: (event.template ?? 'editorial') as 'editorial' | 'split' | 'minimal',
    isOperator: false,
    workflowPaths,
    // Per-event styling overrides; null/invalid falls back to brand defaults.
    pageStyle: parsePageStyle(event.pageStyle),
    gated: gateRow != null,
  };

  return dto;
}

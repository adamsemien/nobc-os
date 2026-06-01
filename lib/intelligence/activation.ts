/**
 * Activation loop — sponsor booth capture (Sponsor Intelligence, Phase 2a).
 *
 * Booth interactions are recorded as SurveyResponse(phase = ACTIVATION) for an event + sponsor.
 * computeAcquisition returns the AcquisitionSummary the recap's Acquisition section renders —
 * interaction rate and CRM opt-in RATE only. Any captured contact (contact_email) stays in the
 * response row for the operator's sponsor hand-off and is NEVER surfaced in the sponsor recap.
 */
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { mintShareToken } from '@/lib/share/token';
import { MIN_CELL } from './metrics';
import type { AcquisitionSummary } from './recap-types';
import type { SurveyQuestion } from './survey';

/** Default booth form. {sponsor} is interpolated at render. contact_email is operator-internal. */
export const ACTIVATION_QUESTIONS: SurveyQuestion[] = [
  { key: 'interaction', prompt: 'What drew you to the {sponsor} table tonight?', type: 'text' },
  { key: 'crm_opt_in', prompt: 'May {sponsor} stay in touch with you?', type: 'yesno', required: true },
  { key: 'contact_email', prompt: 'If yes — the best email to reach you', type: 'text' },
];

function isYes(v: unknown): boolean {
  const s = typeof v === 'string' ? v.toLowerCase() : v;
  return s === 'yes' || s === true || s === 1 || s === '1';
}

export async function computeAcquisition(args: {
  workspaceId: string;
  eventId: string;
  sponsorBrandId: string;
}): Promise<AcquisitionSummary | null> {
  const { workspaceId, eventId, sponsorBrandId } = args;

  const rows = await db.surveyResponse.findMany({
    where: { workspaceId, eventId, sponsorBrandId, phase: 'ACTIVATION', submittedAt: { not: null } },
    select: { answers: true },
  });
  if (rows.length === 0) return null; // no booth data → recap keeps "available with the module"

  const attended = await db.rSVP.count({ where: { workspaceId, eventId, checkedIn: true } });
  const boothInteractions = rows.length;
  let crmOptIns = 0;
  for (const r of rows) {
    const a = r.answers && typeof r.answers === 'object' ? (r.answers as Record<string, unknown>) : {};
    if (isYes(a.crm_opt_in)) crmOptIns++;
  }

  const suppressed = boothInteractions < MIN_CELL;
  return {
    boothInteractions,
    interactionRatePct: attended ? Math.min(100, Math.round((boothInteractions / attended) * 100)) : null,
    crmOptIns,
    crmOptInRatePct: boothInteractions ? Math.round((crmOptIns / boothInteractions) * 100) : null,
    suppressed,
  };
}

export interface BoothContext {
  workspaceId: string;
  eventId: string;
  sponsorBrandId: string;
  eventTitle: string;
  sponsorName: string;
}

function activationUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');
  return base ? `${base}/activation/${token}` : `/activation/${token}`;
}

/** Mint a shared booth QR link for an event + sponsor (stored as a GeneratedAsset). */
export async function createBoothLink(args: {
  workspaceId: string;
  eventId: string;
  sponsorBrandId: string;
}): Promise<{ token: string; url: string }> {
  const { workspaceId, eventId, sponsorBrandId } = args;
  const [event, sponsor] = await Promise.all([
    db.event.findFirst({ where: { id: eventId, workspaceId }, select: { title: true } }),
    db.sponsorBrandProfile.findFirst({ where: { id: sponsorBrandId, workspaceId }, select: { name: true } }),
  ]);
  if (!event || !sponsor) throw new Error('Event or sponsor not found in this workspace');

  const token = mintShareToken();
  await db.generatedAsset.create({
    data: {
      workspaceId,
      sponsorBrandId,
      type: 'activation_booth',
      pdfUrl: '', // booth links carry no PDF
      magicLinkUrl: token,
      payload: { eventId, sponsorBrandId, eventTitle: event.title, sponsorName: sponsor.name } as unknown as Prisma.InputJsonValue,
    },
  });
  return { token, url: activationUrl(token) };
}

/** Resolve a booth token to its event/sponsor context (or null). */
export async function resolveBoothToken(token: string): Promise<BoothContext | null> {
  const ga = await db.generatedAsset.findUnique({
    where: { magicLinkUrl: token },
    select: { type: true, workspaceId: true, payload: true },
  });
  if (!ga || ga.type !== 'activation_booth') return null;
  const p = (ga.payload ?? {}) as unknown as { eventId?: string; sponsorBrandId?: string; eventTitle?: string; sponsorName?: string };
  if (!p.eventId || !p.sponsorBrandId) return null;
  return {
    workspaceId: ga.workspaceId,
    eventId: p.eventId,
    sponsorBrandId: p.sponsorBrandId,
    eventTitle: p.eventTitle ?? 'No Bad Company',
    sponsorName: p.sponsorName ?? 'our partner',
  };
}

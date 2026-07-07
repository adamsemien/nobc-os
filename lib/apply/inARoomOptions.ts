/**
 * Server-side loader for the six In-A-Room questions + their option point maps,
 * for the public apply form (Apply Scoring v2, Phase 4).
 *
 * The form must render the DB `QuestionOption` rows and submit their real ids, so
 * the Phase-3 scorer (`lib/scoring.ts`) can look them up. Template resolution here
 * MIRRORS `resolveTemplate` in `lib/scoring.ts` EXACTLY so the form and the scorer
 * see the same option ids. `lib/scoring.ts` is frozen this phase; when it unfreezes,
 * collapse the two resolvers into one shared function.
 *
 * Returns only public question content (labels + option ids/labels). No PII.
 */
import { db } from '@/lib/db';

export interface InARoomOption {
  id: string;
  label: string;
  order: number;
}

export interface InARoomQuestion {
  stableKey: string;
  type: string; // 'tap_grid' | 'most_least'
  label: string;
  options: InARoomOption[];
}

/** Resolve the governing template id — identical precedence to lib/scoring.ts. */
async function resolveTemplateId(
  workspaceId: string,
  templateId: string | null,
): Promise<string | null> {
  if (templateId) {
    const t = await db.applicationTemplate.findUnique({
      where: { id: templateId },
      select: { id: true },
    });
    if (t) return t.id;
  }
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { defaultTemplateId: true },
  });
  if (ws?.defaultTemplateId) {
    const t = await db.applicationTemplate.findUnique({
      where: { id: ws.defaultTemplateId },
      select: { id: true },
    });
    if (t) return t.id;
  }
  const byDefault = await db.applicationTemplate.findFirst({
    where: { workspaceId, isDefault: true },
    select: { id: true },
  });
  if (byDefault) return byDefault.id;
  const first = await db.applicationTemplate.findFirst({
    where: { workspaceId },
    select: { id: true },
  });
  return first?.id ?? null;
}

/** Load the In-A-Room questions + options for an application's resolved template. */
export async function loadInARoomForApplication(
  applicationId: string,
): Promise<InARoomQuestion[]> {
  const application = await db.application.findUnique({
    where: { id: applicationId },
    select: { workspaceId: true, templateId: true },
  });
  if (!application) return [];

  const templateId = await resolveTemplateId(application.workspaceId, application.templateId);
  if (!templateId) return [];

  const questions = await db.questionDefinition.findMany({
    where: { templateId, section: 'in-a-room', isActive: true },
    select: {
      stableKey: true,
      type: true,
      label: true,
      options: {
        select: { id: true, label: true, order: true },
        orderBy: { order: 'asc' },
      },
    },
    orderBy: { order: 'asc' },
  });

  return questions.map((q) => ({
    stableKey: q.stableKey,
    type: q.type,
    label: q.label,
    options: q.options.map((o) => ({ id: o.id, label: o.label, order: o.order })),
  }));
}

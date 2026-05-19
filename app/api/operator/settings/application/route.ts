import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

const FIELD_TYPES = ['text', 'textarea', 'select', 'url', 'checkbox'] as const;

const QuestionPatchSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1),
  type: z.enum(FIELD_TYPES),
  required: z.boolean().default(false),
  placeholder: z.string().nullable().optional(),
});

const BodySchema = z.object({
  templateId: z.string().optional(),
  questions: z.array(QuestionPatchSchema).min(0),
});

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50) || 'q';
}

async function ensureDefaultTemplate(workspaceId: string) {
  let template = await db.applicationTemplate.findFirst({
    where: { workspaceId, isDefault: true },
    select: { id: true, name: true, slug: true },
  });
  if (template) return template;

  template = await db.applicationTemplate.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, slug: true },
  });
  if (template) return template;

  const created = await db.applicationTemplate.create({
    data: {
      workspaceId,
      name: 'Default Application',
      slug: 'default',
      isDefault: true,
      isActive: true,
      scoringInstructions:
        'Score each answer based on its scoringLogic. Weight by scoringWeight. Aggregate to a 0–1 aiScore.',
    },
    select: { id: true, name: true, slug: true },
  });
  return created;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await requireWorkspaceId(userId);

  const template = await ensureDefaultTemplate(workspaceId);

  const questions = await db.questionDefinition.findMany({
    where: { workspaceId, templateId: template.id, isActive: true },
    orderBy: { order: 'asc' },
    select: {
      id: true,
      stableKey: true,
      label: true,
      type: true,
      required: true,
      order: true,
      insightDescription: true,
    },
  });

  // Surface placeholder out of insightDescription (we reuse it as a free-text helper for now).
  const mapped = questions.map((q) => ({
    id: q.id,
    stableKey: q.stableKey,
    label: q.label,
    type: q.type,
    required: q.required,
    placeholder: q.insightDescription || null,
  }));

  return NextResponse.json({ template, questions: mapped });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await requireWorkspaceId(userId);

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const template = parsed.data.templateId
    ? await db.applicationTemplate.findFirst({
        where: { id: parsed.data.templateId, workspaceId },
        select: { id: true },
      })
    : await ensureDefaultTemplate(workspaceId);
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

  const existing = await db.questionDefinition.findMany({
    where: { workspaceId, templateId: template.id },
    select: { id: true, stableKey: true },
  });
  const existingIds = new Set(existing.map((q) => q.id));
  const incomingIds = new Set(parsed.data.questions.map((q) => q.id).filter((x): x is string => !!x));

  await db.$transaction(async (tx) => {
    // Soft-delete (isActive=false) for removed questions to preserve answer history.
    const removed = existing.filter((q) => !incomingIds.has(q.id));
    if (removed.length > 0) {
      await tx.questionDefinition.updateMany({
        where: { id: { in: removed.map((q) => q.id) } },
        data: { isActive: false },
      });
    }

    for (let i = 0; i < parsed.data.questions.length; i++) {
      const q = parsed.data.questions[i];
      const stableKey =
        q.id && existing.find((e) => e.id === q.id)?.stableKey
          ? existing.find((e) => e.id === q.id)!.stableKey
          : `${slugify(q.label)}_${Date.now().toString(36)}_${i}`;
      const placeholder = q.placeholder?.trim() || '';

      if (q.id && existingIds.has(q.id)) {
        await tx.questionDefinition.update({
          where: { id: q.id },
          data: {
            label: q.label,
            type: q.type,
            required: q.required,
            order: i,
            isActive: true,
            insightDescription: placeholder,
          },
        });
      } else {
        await tx.questionDefinition.create({
          data: {
            workspaceId,
            templateId: template.id,
            stableKey,
            label: q.label,
            type: q.type,
            section: 'application',
            order: i,
            required: q.required,
            isActive: true,
            insightLabel: q.label,
            insightDescription: placeholder,
            scoringDimension: null,
            scoringWeight: 0.5,
            scoringLogic: 'Score based on specificity, authenticity, and fit with NoBC values.',
            archetypeSignals: [],
          },
        });
      }
    }
  });

  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId: userId,
      action: 'settings.application_form_updated',
      entityType: 'APPLICATION_TEMPLATE',
      entityId: template.id,
      metadata: { questionCount: parsed.data.questions.length },
    },
  });

  return NextResponse.json({ ok: true });
}

/**
 * Shared answer-resolution logic for the operator Application views (detail
 * page + list/triage queue). In-A-Room questions store QuestionOption ids,
 * not text: a `tap_grid` answer is a single QuestionOption id; a
 * `most_least` answer is JSON `{"mostId":"…","leastId":"…"}`. Both render as
 * raw UUID/JSON — and their stableKey renders as a raw CRM field name —
 * without this. Scoped to the application's template when it has one, else
 * workspace-wide (older rows). Display-only — storage is untouched.
 */
import { db } from '@/lib/db';
import { resolveAnswerLabel } from '@/lib/legacy-answer-labels';

export interface AnswerResolver {
  label(questionKey: string): string;
  value(questionKey: string, raw: string): string;
}

export async function buildAnswerResolver(
  workspaceId: string,
  templateId: string | null,
): Promise<AnswerResolver> {
  const questionDefs = await db.questionDefinition.findMany({
    where: {
      workspaceId,
      ...(templateId ? { templateId } : {}),
    },
    select: {
      stableKey: true,
      label: true,
      type: true,
      options: { select: { id: true, label: true } },
    },
  });

  const questionTextByKey = new Map<string, string>();
  const questionTypeByKey = new Map<string, string>();
  const optionBackedKeys = new Set<string>();
  const optionLabelById = new Map<string, string>();
  for (const q of questionDefs) {
    questionTextByKey.set(q.stableKey, q.label);
    questionTypeByKey.set(q.stableKey, q.type);
    if (q.options.length > 0) optionBackedKeys.add(q.stableKey);
    for (const o of q.options) optionLabelById.set(o.id, o.label);
  }

  return {
    label: (questionKey) => questionTextByKey.get(questionKey) ?? resolveAnswerLabel(questionKey),
    // Most/least → "Most: X · Least: Y" (labels only, no points). Single-select
    // tap → the option's label. Free-text and any unknown/missing id fall back
    // to the raw value — never blank, never throw.
    value: (questionKey, raw) => {
      if (questionTypeByKey.get(questionKey) === 'most_least') {
        try {
          const o = JSON.parse(raw) as { mostId?: unknown; leastId?: unknown };
          if (typeof o.mostId === 'string' && typeof o.leastId === 'string') {
            const most = optionLabelById.get(o.mostId) ?? o.mostId;
            const least = optionLabelById.get(o.leastId) ?? o.leastId;
            return `Most: ${most} · Least: ${least}`;
          }
        } catch {
          /* not JSON → fall through to the raw value */
        }
        return raw;
      }
      if (optionBackedKeys.has(questionKey)) return optionLabelById.get(raw) ?? raw;
      return raw;
    },
  };
}

/**
 * Per-field provenance badge (member-intelligence PR3, F3). Renders the source of a field
 * value — all five sources, including `producer` — with a token-driven tone. AI-inferred
 * reads as a dashed outline so operators can spot machine guesses at a glance.
 */
import { provenanceMeta, type ProvenanceTone } from '@/lib/provenance-display';

const TONE_CLS: Record<ProvenanceTone, string> = {
  neutral: 'bg-raised text-text-secondary',
  success: 'bg-success-soft text-success',
  accent: 'bg-primary-soft text-primary',
  ai: 'border border-dashed border-border-strong text-text-tertiary',
};

export function ProvenanceBadge({ source }: { source: string }) {
  const meta = provenanceMeta(source);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] ${TONE_CLS[meta.tone]}`}
      title={`Source: ${meta.label}`}
    >
      {meta.label}
    </span>
  );
}

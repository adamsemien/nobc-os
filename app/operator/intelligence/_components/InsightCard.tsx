export type InsightRecord = {
  id: string;
  metricId: string;
  narrative: string;
  generatedAt: string;
  acknowledged: boolean;
};

export function InsightCard({ insight }: { insight: InsightRecord }) {
  return (
    <div
      className="rounded-[10px] p-5"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-[0.12em]" style={{ color: 'var(--accent)' }}>
          {insight.metricId}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
          {new Date(insight.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>
      <p className="mt-2 text-[14px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>
        {insight.narrative}
      </p>
    </div>
  );
}

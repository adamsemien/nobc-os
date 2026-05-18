/** Lightweight dependency-free SVG/CSS charts for the Intelligence dashboard.
 *  All colors are passed in as CSS-variable strings — no hex literals. */

export function Donut({
  segments,
  size = 168,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - 16;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--raised)" strokeWidth={16} />
        {segments.map((s, i) => {
          const len = (s.value / total) * circ;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={16}
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
      </g>
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontSize: 26, fontWeight: 600, fill: 'var(--text-primary)' }}
      >
        {total}
      </text>
    </svg>
  );
}

export function HBar({
  items,
  labelWidth = 120,
}: {
  items: { label: string; value: number; color?: string }[];
  /** Label column width in px. Wide (200) for brand lists to avoid truncation. */
  labelWidth?: number;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex flex-col gap-[7px]">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-3 text-[12.5px]">
          <span
            className="shrink-0 truncate"
            style={{ width: labelWidth, maxWidth: 280, color: 'var(--text-secondary)' }}
            title={it.label}
          >
            {it.label}
          </span>
          <div className="h-[16px] flex-1 overflow-hidden rounded-[3px]" style={{ background: 'var(--raised)' }}>
            <div
              className="h-full rounded-[3px]"
              style={{ width: `${(it.value / max) * 100}%`, background: it.color ?? 'var(--primary)' }}
            />
          </div>
          <span className="w-7 shrink-0 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {it.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Line({
  points,
  height = 130,
  color = 'var(--primary)',
  suffix = '',
}: {
  points: { label: string; value: number }[];
  height?: number;
  color?: string;
  suffix?: string;
}) {
  const w = 480;
  const pad = 24;
  const max = Math.max(1, ...points.map((p) => p.value));
  const min = Math.min(0, ...points.map((p) => p.value));
  const x = (i: number) => pad + (i / Math.max(1, points.length - 1)) * (w - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / (max - min || 1)) * (height - pad * 2);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.value)}`).join(' ');
  const area = `${path} L ${x(points.length - 1)} ${height - pad} L ${x(0)} ${height - pad} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
      <path d={area} fill={color} opacity={0.1} />
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r={2.5} fill={color} />
          <text x={x(i)} y={height - 6} textAnchor="middle" style={{ fontSize: 9, fill: 'var(--text-tertiary)' }}>
            {p.label}
          </text>
        </g>
      ))}
      <text x={x(points.length - 1)} y={y(points[points.length - 1]?.value ?? 0) - 8} textAnchor="end"
        style={{ fontSize: 10, fontWeight: 600, fill: color }}>
        {points[points.length - 1]?.value}{suffix}
      </text>
    </svg>
  );
}

export function Funnel({ stages }: { stages: { label: string; value: number }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <div className="flex flex-col gap-2.5">
      {stages.map((s, i) => {
        const conv =
          i > 0 && stages[i - 1].value > 0 ? Math.round((s.value / stages[i - 1].value) * 100) : null;
        return (
          <div key={s.label}>
            <div className="mb-1 flex justify-between text-[12px]">
              <span style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                {s.value}
                {conv !== null && <span style={{ color: 'var(--text-tertiary)' }}> · {conv}%</span>}
              </span>
            </div>
            <div className="h-[20px] overflow-hidden rounded-[4px]" style={{ background: 'var(--raised)' }}>
              <div
                className="h-full rounded-[4px]"
                style={{ width: `${(s.value / max) * 100}%`, background: 'var(--accent)' }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Sparkline({
  points,
  color = 'var(--accent)',
}: {
  points: { label: string; value: number }[];
  color?: string;
}) {
  const w = 132;
  const h = 34;
  const pad = 3;
  if (points.length === 0) return null;
  const max = Math.max(...points.map((p) => p.value));
  const min = Math.min(...points.map((p) => p.value));
  const x = (i: number) => pad + (i / Math.max(1, points.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
  const d = points.map((p, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(p.value)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1].value)} r={2} fill={color} />
    </svg>
  );
}

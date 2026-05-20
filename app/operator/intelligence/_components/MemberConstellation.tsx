'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export type ConstellationMember = {
  id: string;
  name: string;
  archetype: string;
  scores: Record<string, number> | null;
  score: number;
};

const ARCHETYPE_KEYS = ['Connector', 'Host', 'Curator', 'Builder', 'Maker', 'Patron'] as const;

const ARCHETYPE_COLOR: Record<string, string> = {
  Connector: 'var(--archetype-connector, #4A9EFF)',
  Host: 'var(--archetype-host, #FF8C42)',
  Curator: 'var(--archetype-curator, #B47ED8)',
  Builder: 'var(--archetype-builder, #4EBA7A)',
  Maker: 'var(--archetype-maker, #E85B4E)',
  Patron: 'var(--archetype-patron, #E0B84A)',
};

function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
  return Math.abs(h);
}

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function MemberConstellation({ members }: { members: ConstellationMember[] }) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; m: ConstellationMember & { x: number; y: number; r: number; color: string } } | null>(null);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });

  const W = 1000;
  const H = 300;

  const dots = useMemo(() => {
    return members.map((m) => {
      const h = hashStr(m.id);
      const h2 = hashStr(m.id + ':y');
      const x = (h % 10000) / 10000 * (W - 40) + 20;
      const y = (h2 % 10000) / 10000 * (H - 40) + 20;
      const clamped = Math.max(0, Math.min(1, m.score));
      const r = 3 + clamped * 9;
      const color = ARCHETYPE_COLOR[m.archetype] || ARCHETYPE_COLOR.Connector;
      return { ...m, x, y, r, color };
    });
  }, [members]);

  const lines = useMemo(() => {
    const out: Array<{ x1: number; y1: number; x2: number; y2: number; sim: number }> = [];
    const vecs = dots.map((d) => {
      const s = d.scores;
      if (!s) return ARCHETYPE_KEYS.map(() => 0);
      return ARCHETYPE_KEYS.map((k) => Number(s[k]) || 0);
    });
    for (let i = 0; i < dots.length; i++) {
      for (let j = i + 1; j < dots.length; j++) {
        const sim = cosineSim(vecs[i], vecs[j]);
        if (sim > 0.7) {
          out.push({ x1: dots[i].x, y1: dots[i].y, x2: dots[j].x, y2: dots[j].y, sim });
        }
      }
    }
    return out;
  }, [dots]);

  if (!members.length) return null;

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    setParallax({ x: nx * 8, y: ny * 6 });
  }

  return (
    <div
      className="relative mb-5 overflow-hidden rounded-[10px]"
      style={{
        background: 'radial-gradient(ellipse at center, #14131F 0%, #0A0A14 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
      aria-label="Member constellation — each dot is an approved member, sized by score, colored by archetype"
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        className="block w-full"
        style={{ height: 300, display: 'block' }}
        onMouseMove={handleMove}
        onMouseLeave={() => {
          setTip(null);
          setParallax({ x: 0, y: 0 });
        }}
      >
        <defs>
          <radialGradient id="dot-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
            <stop offset="60%" stopColor="currentColor" stopOpacity="0.4" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g
          style={{
            transform: `translate(${parallax.x}px, ${parallax.y}px)`,
            transition: 'transform 80ms ease-out',
          }}
        >
          {lines.map((l, i) => (
            <line
              key={i}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke="#ffffff"
              strokeOpacity={Math.max(0.04, ((l.sim - 0.7) / 0.3) * 0.18)}
              strokeWidth={0.5}
            />
          ))}
          {dots.map((d) => (
            <g key={d.id} style={{ color: d.color, cursor: 'pointer' }}>
              <circle cx={d.x} cy={d.y} r={d.r * 2.5} fill="url(#dot-glow)" />
              <circle
                cx={d.x}
                cy={d.y}
                r={d.r}
                fill={d.color}
                opacity={tip && tip.m.id === d.id ? 1 : 0.85}
                onMouseEnter={() => setTip({ x: d.x, y: d.y, m: d })}
                onClick={() => router.push(`/operator/members/${d.id}`)}
              />
            </g>
          ))}
        </g>
      </svg>
      {tip && (
        <div
          className="pointer-events-none absolute z-10 px-2.5 py-1.5 rounded text-[11px] font-medium"
          style={{
            left: `${((tip.x + parallax.x) / W) * 100}%`,
            top: `${((tip.y + parallax.y) / H) * 100}%`,
            transform: 'translate(-50%, calc(-100% - 14px))',
            background: 'rgba(20,20,26,0.95)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.14)',
            whiteSpace: 'nowrap',
            letterSpacing: '0.02em',
          }}
        >
          <span style={{ color: tip.m.color }}>●</span> {tip.m.name}
          <span style={{ opacity: 0.6 }}> · {tip.m.archetype} · {Math.round(tip.m.score * 100)}</span>
        </div>
      )}
      <div
        className="absolute bottom-2 right-3 text-[10px] tracking-wide uppercase"
        style={{ color: 'rgba(255,255,255,0.35)' }}
      >
        {members.length} members · lines = shared archetype profile
      </div>
    </div>
  );
}

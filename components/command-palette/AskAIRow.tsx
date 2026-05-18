'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';

/** Bottom-of-results row that hands the typed query to the agent.
 *  Selected on Enter, or jumped to directly with ⌘Enter from the input. */
export function AskAIRow({
  query,
  rowId,
  active,
  onSelect,
}: {
  query: string;
  rowId: string;
  active: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const background = active ? 'var(--accent-soft)' : hovered ? 'var(--raised)' : 'transparent';

  return (
    <div
      id={rowId}
      role="option"
      aria-selected={active}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 24px',
        background,
        borderLeft: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
        cursor: 'pointer',
      }}
    >
      <Sparkles size={15} strokeWidth={2} style={{ color: 'var(--accent)', flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.3 }}>
          Ask AI: <span style={{ fontStyle: 'italic' }}>&lsquo;{query}&rsquo;</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.35, marginTop: 1 }}>
          Let the operator agent answer or act
        </div>
      </div>
      <span
        style={{
          fontSize: 11,
          letterSpacing: '0.04em',
          color: 'var(--text-muted)',
          flexShrink: 0,
        }}
      >
        ⌘↵
      </span>
    </div>
  );
}

'use client';

/** Inline chip for one agent tool call — running, then resolved. */
export function ToolCallChip({ label, summary }: { label: string; summary: string | null }) {
  const running = summary === null;
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '4px 10px',
        borderRadius: 7,
        background: 'var(--raised)',
        border: '1px solid var(--border)',
        fontSize: 12.5,
        color: 'var(--text-secondary)',
        width: 'fit-content',
        maxWidth: '100%',
      }}
    >
      <span
        style={{
          color: running ? 'var(--text-muted)' : 'var(--accent)',
          flexShrink: 0,
          fontWeight: 600,
        }}
      >
        {running ? '→' : '✓'}
      </span>
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontStyle: running ? 'italic' : 'normal',
        }}
      >
        {running ? label : summary}
      </span>
    </div>
  );
}

'use client';

export type ConfirmationState = 'pending' | 'confirmed' | 'cancelled';

/** Inline confirmation tile for a write tool the agent wants to run.
 *  Enter = confirm, Esc = cancel — keyboard handled by AgentMode. */
export function ConfirmationCard({
  prompt,
  toolName,
  state,
  onConfirm,
  onCancel,
}: {
  prompt: string;
  toolName: string;
  state: ConfirmationState;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const destructive = toolName === 'applications.reject';

  return (
    <div
      style={{
        border: '1px solid var(--accent)',
        borderRadius: 10,
        background: 'var(--accent-soft)',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          color: 'var(--text-primary)',
          whiteSpace: 'pre-wrap',
        }}
      >
        {prompt}
      </div>

      {state === 'pending' ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              background: destructive ? 'var(--danger)' : 'var(--accent)',
              color: 'var(--on-primary)',
              fontSize: 12.5,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Confirm ↵
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: 12.5,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Cancel esc
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>
          {state === 'confirmed' ? '✓ Confirmed' : '✕ Cancelled'}
        </div>
      )}
    </div>
  );
}

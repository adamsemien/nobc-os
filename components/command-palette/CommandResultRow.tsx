'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import type { Command } from '@/lib/commands/types';

/** One result row in the Cmd+K palette.
 *  - active  = keyboard-selected → accent-soft wash + accent left-border
 *  - hovered = mouse over        → raised wash
 *  Keyboard selection and mouse hover are independent states. */
export function CommandResultRow({
  command,
  rowId,
  active,
  checked,
  onSelect,
}: {
  command: Command;
  rowId: string;
  active: boolean;
  checked: boolean;
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
        gap: 12,
        padding: '9px 24px',
        background,
        borderLeft: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
        cursor: 'pointer',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--text-primary)',
            lineHeight: 1.3,
          }}
        >
          {command.name}
        </div>
        {command.description && (
          <div
            style={{
              fontSize: 13,
              fontWeight: 400,
              color: 'var(--text-muted)',
              lineHeight: 1.35,
              marginTop: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {command.description}
          </div>
        )}
      </div>
      {command.trailing ? (
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 400,
            color: 'var(--text-muted)',
            letterSpacing: '0.03em',
            flexShrink: 0,
          }}
        >
          {command.trailing}
        </span>
      ) : checked ? (
        <Check size={14} strokeWidth={2.4} style={{ color: 'var(--accent)', flexShrink: 0 }} />
      ) : null}
    </div>
  );
}

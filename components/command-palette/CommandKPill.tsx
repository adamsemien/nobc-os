'use client';

import { useState } from 'react';
import { useCommandPalette } from './CommandPaletteProvider';

/** The single piece of persistent chrome that signals the palette exists.
 *  Replaces the old operator theme dropdown — top-right, opens on click. */
export function CommandKPill() {
  const { openPalette } = useCommandPalette();
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={openPalette}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label="Open command palette"
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        padding: '5px 8px',
        borderRadius: 'min(var(--radius-base, 8px), 8px)',
        background: 'var(--bg)',
        border: `1px solid ${hovered ? 'var(--accent)' : 'var(--border)'}`,
        color: 'var(--text-muted)',
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.04em',
        cursor: 'pointer',
        transition: 'border-color 140ms ease',
      }}
    >
      ⌘K
    </button>
  );
}

'use client';

import { useEffect, useState } from 'react';

/**
 * Konami code (↑↑↓↓←→←→BA) → a 3-second white-out flash, but only while the
 * Void theme is active. Mounted globally in the operator layout so the sequence
 * is listenable on any operator page (it previously lived inside ApplicationsQueue
 * and only fired on /operator/applications).
 */
export function KonamiEasterEgg() {
  const [voidInverted, setVoidInverted] = useState(false);

  useEffect(() => {
    const sequence = [
      'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
      'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a',
    ];
    let pos = 0;
    const onKey = (e: KeyboardEvent) => {
      if (document.documentElement.dataset.theme !== 'void') { pos = 0; return; }
      if (e.key === sequence[pos]) {
        pos++;
        if (pos === sequence.length) {
          pos = 0;
          setVoidInverted(true);
          setTimeout(() => setVoidInverted(false), 3000);
        }
      } else {
        pos = e.key === sequence[0] ? 1 : 0;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!voidInverted) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#ffffff',
      pointerEvents: 'none',
    }} />
  );
}

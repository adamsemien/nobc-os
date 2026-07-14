'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from './ThemeToggle';

/** The whisper line, two ways in:
 *  - Idle: Obsidian theme + 60s of stillness, once per page load (original).
 *  - Typed: spell "curated" anywhere in the operator tool, outside a text
 *    field, on any theme, repeatable - the Back Room's knock pattern, so the
 *    line is actually reachable on demand. */
const WORD = 'curated';

export function ObsidianIdleEgg() {
  const { theme } = useTheme();
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  visibleRef.current = visible;
  const shownRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The typed way in. Same field/modifier guards as the Back Room knock so
  // normal typing in inputs never triggers it; letters only, rolling buffer.
  useEffect(() => {
    let buffer = '';
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      ) {
        buffer = '';
        return;
      }
      if (!/^[a-z]$/i.test(e.key)) {
        buffer = '';
        return;
      }
      buffer = (buffer + e.key.toLowerCase()).slice(-WORD.length);
      if (buffer === WORD && !visibleRef.current) {
        buffer = '';
        setVisible(true);
        setTimeout(() => setVisible(false), 4000);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (theme !== 'obsidian') return;
    if (shownRef.current) return;

    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (shownRef.current) return;
      timerRef.current = setTimeout(() => {
        shownRef.current = true;
        setVisible(true);
        setTimeout(() => setVisible(false), 4000);
      }, 60_000);
    };

    const events = ['mousemove', 'keydown', 'click', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [theme]);

  if (!visible) return null;

  return (
    <p className="obs-idle-whisper" aria-hidden="true">
      the room is always being curated.
    </p>
  );
}

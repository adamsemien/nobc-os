'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from './ThemeToggle';

export function ObsidianIdleEgg() {
  const { theme } = useTheme();
  const [visible, setVisible] = useState(false);
  const shownRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

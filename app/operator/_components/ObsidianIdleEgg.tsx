'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from './ThemeToggle';

/** The whisper line, three ways in:
 *  - Typed: spell "curated" anywhere in the operator tool, outside a text
 *    field, on any theme, repeatable. The listener rides the CAPTURE phase
 *    so no other handler can swallow the keys first, and non-letter keys
 *    (Shift, arrows, pauses) are ignored rather than resetting the word -
 *    only focusing a text field clears it.
 *  - Clicked: the DevToolbar's egg list dispatches WHISPER_PLAY_EVENT.
 *  - Idle: Obsidian theme + 60s of stillness, once per page load (original).
 *  Re-triggers restart the fade (keyed remount), never stack timers. */
export const WHISPER_PLAY_EVENT = 'nobc:play-whisper';
const WORD = 'curated';

export function ObsidianIdleEgg() {
  const { theme } = useTheme();
  const [showCount, setShowCount] = useState(0);
  const shownRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    setShowCount((n) => n + 1);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowCount(0), 4000);
  }, []);

  useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    },
    [],
  );

  // The typed way in.
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
      if (!/^[a-z]$/i.test(e.key)) return;
      buffer = (buffer + e.key.toLowerCase()).slice(-WORD.length);
      if (buffer === WORD) {
        buffer = '';
        show();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [show]);

  // The clicked way in (DevToolbar egg list).
  useEffect(() => {
    const onPlay = () => show();
    window.addEventListener(WHISPER_PLAY_EVENT, onPlay);
    return () => window.removeEventListener(WHISPER_PLAY_EVENT, onPlay);
  }, [show]);

  // The idle way in (original).
  useEffect(() => {
    if (theme !== 'obsidian') return;
    if (shownRef.current) return;

    const reset = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (shownRef.current) return;
      idleTimerRef.current = setTimeout(() => {
        shownRef.current = true;
        show();
      }, 60_000);
    };

    const events = ['mousemove', 'keydown', 'click', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [theme, show]);

  if (showCount === 0) return null;

  return (
    <p key={showCount} className="obs-idle-whisper" aria-hidden="true">
      the room is always being curated.
    </p>
  );
}

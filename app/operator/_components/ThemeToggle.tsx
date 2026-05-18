'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  THEME_STORAGE_KEY,
  type ThemeId,
  isThemeId,
  nextTheme,
} from '@/lib/theme';

/** Operator theme hook — reads the active theme from <html data-theme>,
 *  applies changes to the DOM, and persists to localStorage.
 *  Consumed by the Cmd+K theme commands and theme-aware operator components. */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeId>('nobc');

  useEffect(() => {
    const cur = document.documentElement.dataset.theme;
    if (isThemeId(cur)) setThemeState(cur as ThemeId);
  }, []);

  const apply = useCallback((t: ThemeId) => {
    setThemeState(t);
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, t);
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  const toggle = useCallback(() => {
    setThemeState((cur) => {
      const next = nextTheme(cur);
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { theme, setTheme: apply, toggle };
}

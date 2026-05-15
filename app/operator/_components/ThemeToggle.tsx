'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import {
  THEME_STORAGE_KEY,
  type ThemeId,
  isThemeId,
  nextTheme,
} from '@/lib/theme';

export function useTheme() {
  const [theme, setTheme] = useState<ThemeId>('nobc');

  useEffect(() => {
    const cur = document.documentElement.dataset.theme;
    if (isThemeId(cur)) setTheme(cur);
  }, []);

  const apply = useCallback((t: ThemeId) => {
    setTheme(t);
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, t);
    } catch {
      /* localStorage unavailable — theme still applies for the session */
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme((cur) => {
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

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const Icon = theme === 'midnight' ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Theme: ${theme === 'midnight' ? 'Midnight' : 'NoBC'} — switch`}
      title={`Theme: ${theme === 'midnight' ? 'Midnight' : 'NoBC'}`}
      className={`group flex h-9 w-9 items-center justify-center rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] transition-all duration-150 hover:border-[var(--border-strong)] hover:text-[var(--primary)] active:scale-95 ${className}`}
    >
      <Icon className="h-4 w-4 transition-transform duration-200 group-hover:rotate-[12deg]" />
    </button>
  );
}

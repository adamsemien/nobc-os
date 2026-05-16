'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import {
  THEME_STORAGE_KEY,
  THEMES,
  type ThemeId,
  isThemeId,
  nextTheme,
} from '@/lib/theme';

const THEME_SWATCHES: Record<ThemeId, { bg: string; accent: string }> = {
  nobc:     { bg: '#F9F6F1', accent: '#B22E21' },
  midnight: { bg: '#0D0A14', accent: '#A26DB8' },
  obsidian: { bg: '#0f0f0f', accent: '#C9A84C' },
  rose:     { bg: '#fdf6f0', accent: '#C45C3A' },
};

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
      /* localStorage unavailable — theme still applies for session */
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

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className={`flex gap-1 ${className}`}
      role="group"
      aria-label="Color theme"
    >
      {THEMES.map(({ id, label }) => {
        const isActive = theme === id;
        const swatch = THEME_SWATCHES[id];
        return (
          <button
            key={id}
            type="button"
            onClick={() => setTheme(id)}
            aria-label={`${label} theme`}
            aria-pressed={isActive}
            title={label}
            className={`relative flex h-8 w-8 items-center justify-center rounded border transition-colors ${
              isActive
                ? 'border-[var(--primary)]'
                : 'border-[var(--border)] hover:border-[var(--border-strong)]'
            }`}
            style={{ borderRadius: '6px' }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: swatch.bg,
                border: `1.5px solid ${swatch.accent}`,
                display: 'block',
                flexShrink: 0,
              }}
            />
            {isActive && (
              <Check
                style={{
                  position: 'absolute',
                  bottom: -4,
                  right: -4,
                  width: 10,
                  height: 10,
                  color: swatch.accent,
                  background: 'var(--surface)',
                  borderRadius: '50%',
                  padding: '1px',
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

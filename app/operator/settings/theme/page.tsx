'use client';

import { Check } from 'lucide-react';
import { useTheme } from '../../_components/ThemeToggle';
import { THEMES, type ThemeId } from '@/lib/theme';

const SHORT_LABELS: Record<ThemeId, string> = {
  nobc:     'Light',
  midnight: 'Midnight',
  obsidian: 'Obsidian',
  rose:     'Rosé',
  parchment:'Parchment',
  void:     'Void',
  ember:    'Ember',
  y2k:      'Y2K',
  aim:      'AIM',
  myspace:  'MySpace',
};

const EASTER_EGG = new Set<ThemeId>(['aim', 'myspace']);

export default function ThemePage() {
  const { theme: active, setTheme } = useTheme();

  return (
    <div className="px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <h1
          className="mb-1 text-3xl font-normal"
          style={{
            fontFamily: "'PP Editorial New', Georgia, serif",
            color: 'var(--text-primary)',
          }}
        >
          Appearance
        </h1>
        <p className="mb-8 text-sm" style={{ color: 'var(--text-muted)' }}>
          Choose a theme. Changes apply immediately.
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {THEMES.map((t) => {
            const isActive = active === t.id;
            const isEgg = EASTER_EGG.has(t.id);

            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme(t.id)}
                aria-pressed={isActive}
                aria-label={`${SHORT_LABELS[t.id]} theme${isActive ? ' (active)' : ''}`}
                className="group flex flex-col overflow-hidden rounded-[10px] text-left transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  border: isActive
                    ? '2px solid var(--primary)'
                    : '2px solid var(--border)',
                  outlineColor: 'var(--primary)',
                  boxShadow: isActive
                    ? '0 0 0 3px var(--primary-soft)'
                    : undefined,
                }}
              >
                {/* ── Swatch preview — scoped to each theme's CSS variables ── */}
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <div
                  data-theme={t.id}
                  aria-hidden
                  className="relative w-full overflow-hidden"
                  style={{ aspectRatio: '4/3', background: 'var(--bg)' }}
                >
                  {/* Sidebar strip */}
                  <div
                    className="absolute inset-y-0 left-0"
                    style={{ width: '22%', background: 'var(--sidebar)' }}
                  />

                  {/* Main surface panel */}
                  <div
                    className="absolute rounded-[3px]"
                    style={{
                      top: '12%',
                      left: '28%',
                      right: '8%',
                      bottom: '12%',
                      background: 'var(--surface)',
                    }}
                  >
                    {/* Fake heading bar */}
                    <div
                      className="absolute rounded-full"
                      style={{
                        top: '14%',
                        left: '10%',
                        width: '55%',
                        height: '10%',
                        background: 'var(--text-tertiary)',
                        opacity: 0.5,
                      }}
                    />
                    {/* Fake body line */}
                    <div
                      className="absolute rounded-full"
                      style={{
                        top: '34%',
                        left: '10%',
                        width: '70%',
                        height: '7%',
                        background: 'var(--text-tertiary)',
                        opacity: 0.25,
                      }}
                    />
                    {/* Fake second line */}
                    <div
                      className="absolute rounded-full"
                      style={{
                        top: '48%',
                        left: '10%',
                        width: '50%',
                        height: '7%',
                        background: 'var(--text-tertiary)',
                        opacity: 0.2,
                      }}
                    />
                    {/* Primary action button */}
                    <div
                      className="absolute rounded-[3px]"
                      style={{
                        bottom: '14%',
                        left: '10%',
                        width: '42%',
                        height: '16%',
                        background: 'var(--primary)',
                      }}
                    />
                  </div>

                  {/* Sidebar nav dots */}
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="absolute rounded-full"
                      style={{
                        top: `${28 + i * 18}%`,
                        left: '5%',
                        width: '12%',
                        height: '8%',
                        background: i === 0 ? 'var(--primary)' : 'var(--text-tertiary)',
                        opacity: i === 0 ? 0.9 : 0.3,
                      }}
                    />
                  ))}
                </div>

                {/* ── Label row ── */}
                <div
                  className="flex items-center gap-1.5 px-3 py-2.5"
                  style={{ background: 'var(--surface)' }}
                >
                  <span
                    className="flex-1 truncate text-[12px] font-medium leading-none"
                    style={{
                      fontFamily: 'var(--font-ui, system-ui)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {SHORT_LABELS[t.id]}
                  </span>

                  {isEgg && (
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-widest leading-none"
                      style={{
                        background: 'var(--accent-soft)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      Egg
                    </span>
                  )}

                  {isActive && (
                    <Check
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: 'var(--primary)' }}
                      aria-hidden
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <p className="mt-6 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          Theme preference is saved locally per browser.
        </p>
      </div>
    </div>
  );
}

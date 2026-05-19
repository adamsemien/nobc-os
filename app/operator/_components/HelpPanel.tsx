'use client';

import { useEffect, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { HELP_SECTIONS, type HelpSection } from '../_help/content';

const LS_KEY = 'nobc-help-last-section';

export function HelpPanel() {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<HelpSection>(HELP_SECTIONS[0]);

  useEffect(() => {
    try {
      const last = localStorage.getItem(LS_KEY);
      const found = last && HELP_SECTIONS.find((s) => s.id === last);
      if (found) setSection(found);
    } catch {}
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  function selectSection(s: HelpSection) {
    setSection(s);
    try { localStorage.setItem(LS_KEY, s.id); } catch {}
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Help (?)"
        className="fixed bottom-5 left-[80px] z-40 inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors hover:border-primary md:left-[260px]"
        style={{
          background: 'var(--card)',
          borderColor: 'var(--border)',
          color: 'var(--text-secondary)',
        }}
        aria-label="Open help"
      >
        <HelpCircle className="h-4 w-4" />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex"
          style={{ background: 'color-mix(in srgb, var(--foreground) 25%, transparent)' }}
          onClick={() => setOpen(false)}
        >
          <div className="ml-auto h-full w-full sm:w-[480px]" onClick={(e) => e.stopPropagation()}>
            <div
              className="flex h-full flex-col"
              style={{ background: 'var(--card)', borderLeft: '1px solid var(--border)' }}
            >
              <header
                className="flex items-center justify-between border-b border-border px-5 py-4"
              >
                <h2
                  className="text-base font-semibold tracking-tight text-text-primary"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Help
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded text-text-secondary hover:text-text-primary"
                  aria-label="Close help"
                >
                  <X className="h-4 w-4" />
                </button>
              </header>

              <div className="flex flex-1 min-h-0">
                <nav className="w-[160px] shrink-0 overflow-y-auto border-r border-border p-2">
                  <ul className="space-y-0.5">
                    {HELP_SECTIONS.map((s) => {
                      const active = s.id === section.id;
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => selectSection(s)}
                            className="block w-full rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition-colors"
                            style={{
                              background: active ? 'var(--primary-soft, var(--muted))' : 'transparent',
                              color: active ? 'var(--primary)' : 'var(--text-secondary)',
                            }}
                          >
                            {s.title}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </nav>

                <article className="flex-1 overflow-y-auto px-5 py-6">
                  <h3
                    className="mb-3 text-xl text-text-primary"
                    style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic' }}
                  >
                    {section.title}
                  </h3>
                  <div className="space-y-3 text-sm leading-relaxed text-text-primary">
                    {section.body.split('\n\n').map((para, i) => (
                      <p key={i} className="whitespace-pre-wrap">
                        {renderMarkdownLite(para)}
                      </p>
                    ))}
                  </div>
                </article>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Tiny inline-bold helper for **text**. Keeps content.ts readable. */
function renderMarkdownLite(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    /^\*\*[^*]+\*\*$/.test(p) ? (
      <strong key={i} className="font-semibold text-text-primary">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

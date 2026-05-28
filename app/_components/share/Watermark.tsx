/**
 * Diagonal repeating watermark overlay. Wraps any child (typically a
 * thumbnail) and shows the workspace name in low-opacity NoBC-red text
 * tiled over the image when `watermark` is true.
 *
 * CSS-only — no canvas. Intended as a deterrent + brand marker, not a real
 * anti-piracy measure (the original is still downloadable).
 */
import type { ReactNode } from 'react';

export function Watermark({
  enabled,
  label,
  children,
}: {
  enabled: boolean;
  label: string;
  children: ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  const text = label.toUpperCase().slice(0, 24) || 'NO BAD COMPANY';
  return (
    <div className="relative isolate overflow-hidden">
      {children}
      <div className="pointer-events-none absolute inset-0 select-none" aria-hidden>
        <div
          className="absolute -inset-1/4 flex flex-wrap content-around justify-around opacity-[0.18]"
          style={{ transform: 'rotate(-22deg)' }}
        >
          {Array.from({ length: 24 }).map((_, i) => (
            <span
              key={i}
              className="m-2 whitespace-nowrap text-[12px] uppercase tracking-[0.32em] text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]"
            >
              {text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

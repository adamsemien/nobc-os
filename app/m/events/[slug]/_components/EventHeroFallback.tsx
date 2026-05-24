/** Deep-red textured panel with the NoBC mark centered — shown in place of a
 *  hero image when an event has none. Used by all three event templates.
 *  Texture/vignette use rgba overlays (not flat color fills); surface colors
 *  are semantic tokens only. */
export function EventHeroFallback({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
      style={{
        backgroundColor: 'var(--nobc-red)',
        backgroundImage:
          'repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 16px)',
      }}
    >
      {/* soft vignette for depth */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 32%, transparent 42%, rgba(28,16,8,0.30))',
        }}
      />
      <div className="relative flex flex-col items-center px-10 text-center text-[var(--nobc-on-red)]">
        <span className="text-[clamp(2.25rem,4.5vw,3.5rem)] italic leading-[1.05] font-[family-name:var(--font-cormorant)]">
          No Bad Company
        </span>
        <span
          className="mt-5 h-px w-14"
          style={{ background: 'color-mix(in oklab, var(--nobc-on-red) 45%, transparent)' }}
        />
        <span className="mt-5 text-[10px] font-medium uppercase tracking-[0.34em] opacity-80 font-[family-name:var(--font-dm-sans)]">
          Austin · By application
        </span>
      </div>
    </div>
  );
}

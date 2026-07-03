/** Intentional fallback panel shown in place of a hero image when an event has
 *  none. Used by all three event templates. A dark, warm brand-ink ground with a
 *  soft top-light gradient + faint diagonal texture + vignette for depth, and just
 *  the NoBC wordmark centered — quiet and deliberate, not a flat red placeholder.
 *
 *  (The brand's "dark green" lives in the operator chrome, not the warm editorial
 *  events palette — so the ground is the events ink token. Surface colors are
 *  semantic tokens; only the texture/vignette use rgba light/shadow overlays.) */
export function EventHeroFallback({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
      style={{
        backgroundColor: 'var(--ev-depth)',
        backgroundImage:
          'radial-gradient(135% 100% at 50% 0%, rgba(255,255,255,0.07) 0%, transparent 55%), repeating-linear-gradient(135deg, rgba(255,255,255,0.022) 0 1px, transparent 1px 22px)',
      }}
    >
      {/* vignette for depth */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(115% 82% at 50% 40%, transparent 46%, rgba(0,0,0,0.42))',
        }}
      />
      <div className="relative flex flex-col items-center px-10 text-center">
        <span
          className="text-[clamp(2rem,4vw,3.25rem)] italic leading-[1.05] font-[family-name:var(--font-cormorant)]"
          style={{ color: 'color-mix(in oklab, var(--ev-on-depth) 82%, transparent)' }}
        >
          No Bad Company
        </span>
        <span
          className="mt-5 h-px w-12"
          style={{ background: 'color-mix(in oklab, var(--ev-on-depth) 30%, transparent)' }}
        />
      </div>
    </div>
  );
}

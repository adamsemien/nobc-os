"use client";

export const STEP_NAMES = ["Draft", "Details", "Access", "Review"];

export function Stepper({
  current,
  onJump,
}: {
  current: number;
  onJump: (i: number) => void;
}) {
  return (
    <div className="w-full">
      {/* compact dot row — fits any width, never scrolls sideways */}
      <div className="flex items-center">
        {STEP_NAMES.map((name, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <div key={name} className="flex flex-1 items-center last:flex-none">
              <button
                type="button"
                onClick={() => onJump(i)}
                aria-label={`Step ${i + 1}: ${name}`}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                  active
                    ? "bg-gold text-bg"
                    : done
                      ? "border border-gold/70 bg-gold/15 text-gold"
                      : "border border-border-strong text-muted"
                }`}
              >
                {done ? "✓" : i + 1}
              </button>
              {i < STEP_NAMES.length - 1 && (
                <div className={`mx-1.5 h-px flex-1 ${done ? "bg-gold/60" : "bg-border-strong"}`} />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <p className="text-xs uppercase tracking-widest text-muted">
          Step {current + 1} of {STEP_NAMES.length}
        </p>
        <p className="text-xs uppercase tracking-widest text-gold">{STEP_NAMES[current]}</p>
      </div>
    </div>
  );
}

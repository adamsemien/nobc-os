'use client';

export type TemplateKey = 'editorial' | 'split' | 'minimal';

type Props = {
  value: TemplateKey;
  onChange: (v: TemplateKey) => void;
  compact?: boolean;
};

function EditorialThumb() {
  return (
    <div className="flex h-[120px] w-full flex-col overflow-hidden rounded-sm border border-[var(--apply-rule)] bg-white">
      <div className="h-1/2 w-full bg-[var(--events-canvas)]" aria-hidden />
      <div className="flex flex-1 gap-2 p-2">
        <div className="flex flex-1 flex-col gap-1">
          <div className="h-1.5 w-3/4 rounded-sm bg-[var(--apply-rule)]" />
          <div className="h-1.5 w-full rounded-sm bg-[var(--apply-rule)]" />
          <div className="h-1.5 w-5/6 rounded-sm bg-[var(--apply-rule)]" />
        </div>
        <div className="w-1/3 rounded-sm border border-[var(--apply-rule)] bg-[#F9F7F2]" />
      </div>
    </div>
  );
}

function SplitThumb() {
  return (
    <div className="flex h-[120px] w-full overflow-hidden rounded-sm border border-[var(--apply-rule)] bg-white">
      <div className="h-full w-1/2 bg-[var(--events-canvas)]" aria-hidden />
      <div className="flex h-full flex-1 flex-col justify-center gap-1 px-3">
        <div className="h-2 w-3/4 rounded-sm bg-[var(--apply-ink)]" />
        <div className="h-1.5 w-full rounded-sm bg-[var(--apply-rule)]" />
        <div className="h-1.5 w-5/6 rounded-sm bg-[var(--apply-rule)]" />
        <div className="mt-1 h-3 w-16 rounded-sm bg-[var(--nobc-red)]" />
      </div>
    </div>
  );
}

function MinimalThumb() {
  return (
    <div className="flex h-[120px] w-full items-center justify-center rounded-sm border border-[var(--apply-rule)] bg-[#F9F7F2]">
      <div className="flex w-2/3 flex-col items-center gap-1.5">
        <div className="h-2 w-2/3 rounded-sm bg-[var(--apply-ink)]" />
        <div className="h-px w-full bg-[var(--apply-rule)]" />
        <div className="h-1.5 w-3/4 rounded-sm bg-[var(--apply-rule)]" />
        <div className="h-1.5 w-1/2 rounded-sm bg-[var(--apply-rule)]" />
        <div className="mt-1 h-3 w-12 rounded-sm bg-[var(--nobc-red)]" />
      </div>
    </div>
  );
}

const CARDS: Array<{
  key: TemplateKey;
  title: string;
  blurb: string;
  bestFor: string;
  Thumb: () => React.JSX.Element;
}> = [
  {
    key: 'editorial',
    title: 'Editorial',
    blurb: 'Full-bleed hero, magazine-style copy, sticky RSVP card.',
    bestFor: 'Best for: parties, cultural moments, food.',
    Thumb: EditorialThumb,
  },
  {
    key: 'split',
    title: 'Split',
    blurb: 'Half image, half copy. Formal and balanced.',
    bestFor: 'Best for: dinners, talks, panels.',
    Thumb: SplitThumb,
  },
  {
    key: 'minimal',
    title: 'Minimal',
    blurb: 'Centered, breathing room, almost no chrome.',
    bestFor: 'Best for: invite-only, intimate moments.',
    Thumb: MinimalThumb,
  },
];

export function TemplatePicker({ value, onChange, compact = false }: Props) {
  return (
    <div
      className={
        compact
          ? 'flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible'
          : 'grid gap-4 sm:grid-cols-3'
      }
    >
      {CARDS.map(({ key, title, blurb, bestFor, Thumb }) => {
        const selected = value === key;
        return (
          <button
            type="button"
            key={key}
            onClick={() => onChange(key)}
            aria-pressed={selected}
            className={`relative shrink-0 rounded-sm border bg-white p-4 text-left transition-colors ${
              selected
                ? 'border-[var(--nobc-red)]'
                : 'border-[var(--apply-rule)] hover:border-[var(--nobc-red)]'
            } ${compact ? 'w-56 sm:w-auto' : ''}`}
          >
            {selected ? (
              <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-sm bg-[var(--nobc-red)] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-widest text-[var(--nobc-on-red)] font-[family-name:var(--font-dm-sans)]">
                Selected
              </span>
            ) : null}
            <Thumb />
            <h4 className="mt-3 text-[18px] leading-tight text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
              {title}
            </h4>
            <p className="mt-1 text-[13px] leading-snug text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
              {blurb}
            </p>
            <p className="mt-2 text-[11px] uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
              {bestFor}
            </p>
          </button>
        );
      })}
    </div>
  );
}

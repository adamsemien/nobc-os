'use client';

import { Check } from 'lucide-react';

export type GateOption = {
  value: string;
  label: string;
  description: string;
  supported: boolean;
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  options: GateOption[];
  name: string;
};

export function GateRadio({ value, onChange, options, name }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((opt) => {
        const selected = value === opt.value;
        const disabled = !opt.supported;
        return (
          <label
            key={opt.value}
            className={`flex items-start gap-3 rounded-sm border px-4 py-3 transition-colors font-[family-name:var(--font-dm-sans)] ${
              disabled
                ? 'border-[var(--apply-rule)] bg-[#F9F7F2] cursor-not-allowed opacity-60'
                : selected
                ? 'border-[var(--nobc-red)] bg-[#F9F7F2] cursor-pointer'
                : 'border-[var(--apply-rule)] bg-white hover:border-[var(--nobc-red)] cursor-pointer'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={selected}
              disabled={disabled}
              onChange={() => !disabled && onChange(opt.value)}
              className="sr-only"
            />
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                selected
                  ? 'border-[var(--nobc-red)] bg-[var(--nobc-red)]'
                  : 'border-[var(--apply-rule)] bg-white'
              }`}
              aria-hidden
            >
              {selected ? <Check className="h-2.5 w-2.5 text-[var(--nobc-on-red)]" strokeWidth={3} /> : null}
            </span>
            <span className="flex-1">
              <span className="flex items-center gap-2">
                <span className="text-sm font-medium text-[var(--apply-ink)]">{opt.label}</span>
                {!opt.supported && (
                  <span className="rounded-sm bg-[#F1E8D6] px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-[#8A6A2E]">
                    Coming soon
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-xs text-[var(--apply-muted)]">{opt.description}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

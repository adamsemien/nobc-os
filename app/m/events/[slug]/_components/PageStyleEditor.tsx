'use client';

import { useState } from 'react';
import { type PageStyle, PAGE_STYLE_DEFAULTS } from '@/lib/page-style';

/**
 * Operator-only live editor for a single event's member-page style. It drives the
 * lifted pageStyle state in EventDetail (onChange) so every move repaints the page
 * behind the panel instantly, and persists via PATCH /api/operator/events/[id] on
 * Save. No color or font pickers — the brand system owns those; this only exposes
 * the per-event legibility/texture knobs that change with each hero photo.
 */
export function PageStyleEditor({
  eventId,
  template,
  value,
  saved,
  onChange,
  onSaved,
  onClose,
}: {
  eventId: string;
  template: 'editorial' | 'split' | 'minimal';
  value: PageStyle;
  saved: PageStyle;
  onChange: (next: PageStyle) => void;
  onSaved: (next: PageStyle) => void;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(value) !== JSON.stringify(saved);
  const set = <K extends keyof PageStyle>(key: K, v: PageStyle[K]) =>
    onChange({ ...value, [key]: v });

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/operator/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageStyle: value }),
      });
      if (!res.ok) {
        setError(res.status === 403 ? 'Not allowed' : 'Save failed');
        return;
      }
      onSaved(value);
    } catch {
      setError('Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed left-3 top-3 z-40 flex max-h-[calc(100vh-1.5rem)] w-[300px] flex-col overflow-hidden rounded-sm border border-[var(--apply-rule)] bg-events-paper-card/95 shadow-[0_4px_24px_rgba(28,16,8,0.18)] backdrop-blur font-[family-name:var(--font-dm-sans)]">
      <div className="flex items-center justify-between border-b border-[var(--apply-rule)] px-3 py-2.5">
        <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--apply-ink)]">
          Page design
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] uppercase tracking-widest text-[var(--apply-muted)] transition-colors hover:text-[var(--nobc-red)]"
        >
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {template === 'editorial' ? (
          <Section title="Hero">
            <RangeRow
              label="Top scrim"
              min={0.3}
              max={0.75}
              step={0.05}
              value={value.heroScrimTop}
              onChange={(v) => set('heroScrimTop', v)}
              format={pct}
            />
            <RangeRow
              label="Bottom scrim"
              min={0.45}
              max={0.85}
              step={0.05}
              value={value.heroScrimBottom}
              onChange={(v) => set('heroScrimBottom', v)}
              format={pct}
            />
            <SegRow
              label="Hero height"
              options={['compact', 'standard', 'tall'] as const}
              value={value.heroHeight}
              onChange={(v) => set('heroHeight', v)}
            />
            <SegRow
              label="Overlay text"
              options={['light', 'dark'] as const}
              value={value.heroTextMode}
              onChange={(v) => set('heroTextMode', v)}
            />
          </Section>
        ) : null}

        <Section title="Typography">
          <RangeRow
            label="Title size"
            min={0.8}
            max={1.2}
            step={0.05}
            value={value.titleScale}
            onChange={(v) => set('titleScale', v)}
            format={(v) => `${v.toFixed(2)}×`}
          />
        </Section>

        <Section title="Texture">
          <SegRow
            label="Paper grain"
            options={['off', 'on'] as const}
            value={value.textureOn ? 'on' : 'off'}
            onChange={(v) => set('textureOn', v === 'on')}
          />
          {value.textureOn ? (
            <RangeRow
              label="Intensity"
              min={0.01}
              max={0.06}
              step={0.01}
              value={value.textureOpacity}
              onChange={(v) => set('textureOpacity', v)}
              format={pct}
            />
          ) : null}
        </Section>

        <Section title="Access card">
          <SegRow
            label="Shadow"
            options={['flat', 'raised', 'lifted'] as const}
            value={value.cardShadow}
            onChange={(v) => set('cardShadow', v)}
          />
        </Section>

        <Section title="Footer">
          <SegRow
            label="Size"
            options={['sm', 'md', 'lg'] as const}
            value={value.footerScale}
            onChange={(v) => set('footerScale', v)}
          />
        </Section>
      </div>

      <div className="border-t border-[var(--apply-rule)] px-3 py-2.5">
        {error ? (
          <p className="mb-2 text-[10px] uppercase tracking-wide text-[var(--nobc-red)]">{error}</p>
        ) : null}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="flex-1 rounded-sm bg-[var(--nobc-red)] px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest text-[var(--nobc-on-red)] transition-opacity hover:bg-[var(--nobc-red-hover)] disabled:opacity-40"
          >
            {saving ? 'Saving' : dirty ? 'Save' : 'Saved'}
          </button>
          <button
            type="button"
            onClick={() => onChange(saved)}
            disabled={!dirty || saving}
            className="rounded-sm border border-[var(--apply-rule)] px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest text-[var(--apply-muted)] transition-colors hover:text-[var(--apply-ink)] disabled:opacity-40"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={() => onChange(PAGE_STYLE_DEFAULTS)}
            disabled={saving}
            className="rounded-sm border border-[var(--apply-rule)] px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest text-[var(--apply-muted)] transition-colors hover:text-[var(--apply-ink)] disabled:opacity-40"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <p className="mb-2 text-[9px] font-medium uppercase tracking-widest text-[var(--apply-muted)]">
        {title}
      </p>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function RangeRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] text-[var(--apply-ink)]">{label}</span>
        <span className="text-[10px] tabular-nums text-[var(--apply-muted)]">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer"
        style={{ accentColor: 'var(--nobc-red)' }}
      />
    </label>
  );
}

function SegRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] text-[var(--apply-ink)]">{label}</p>
      <div className="flex items-center rounded-sm bg-events-paper p-0.5">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`flex-1 rounded-sm px-2 py-1 text-[9px] font-medium uppercase tracking-widest transition-colors ${
              value === opt
                ? 'bg-[var(--nobc-red)] text-[var(--nobc-on-red)]'
                : 'text-[var(--apply-muted)] hover:text-[var(--apply-ink)]'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

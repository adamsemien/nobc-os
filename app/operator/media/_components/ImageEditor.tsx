'use client';
import { useState } from 'react';
import {
  RotateCcw,
  RotateCw,
  FlipHorizontal2,
  FlipVertical2,
  Wand2,
  Crop,
  Type,
  X,
  Loader2,
} from 'lucide-react';
import { CHANNEL_PRESETS } from '@/lib/dam/channel-presets';

/**
 * Phase B/C UI — lightweight, non-destructive image editor. Live preview is CSS
 * (filters + transform); on Save the same params are sent to POST .../[id]/edit,
 * which re-applies them with Sharp and writes a NEW asset (original untouched).
 *
 * Free-form drag-crop is intentionally deferred; crop here is aspect-aware
 * smart-crop (server picks the subject via Sharp attention). Auto-enhance has no
 * CSS preview (it's a server histogram normalize) — labelled as such.
 */
export function ImageEditor({
  assetId,
  filename,
  onClose,
  onSaved,
}: {
  assetId: string;
  filename: string;
  onClose: () => void;
  onSaved: (newAssetId: string) => void;
}) {
  const [rotate90, setRotate90] = useState(0); // 0 / 90 / 180 / 270
  const [straighten, setStraighten] = useState(0); // -15..15
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const [contrast, setContrast] = useState(1);
  const [saturation, setSaturation] = useState(1);
  const [autoEnhance, setAutoEnhance] = useState(false);
  const [cropPreset, setCropPreset] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [altText, setAltText] = useState<string | null>(null);
  const [altLoading, setAltLoading] = useState(false);

  const angle = rotate90 + straighten;
  const previewStyle: React.CSSProperties = {
    filter: `brightness(${brightness}) contrast(${contrast}) saturate(${saturation})`,
    transform: `rotate(${angle}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
    transition: 'transform 150ms ease, filter 100ms linear',
  };

  const isDirty =
    rotate90 !== 0 ||
    straighten !== 0 ||
    flipH ||
    flipV ||
    brightness !== 1 ||
    contrast !== 1 ||
    saturation !== 1 ||
    autoEnhance ||
    !!cropPreset;

  const reset = () => {
    setRotate90(0);
    setStraighten(0);
    setFlipH(false);
    setFlipV(false);
    setBrightness(1);
    setContrast(1);
    setSaturation(1);
    setAutoEnhance(false);
    setCropPreset(null);
  };

  const genAltText = async () => {
    setAltLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/media/dam/asset/${assetId}/alt-text`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setError(j.error || 'Alt-text failed');
      else setAltText(j.altText ?? '');
    } catch {
      setError('Network error');
    } finally {
      setAltLoading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/media/dam/asset/${assetId}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rotate: angle,
          flipH,
          flipV,
          smartCropPreset: cropPreset ?? undefined,
          adjust: { brightness, contrast, saturation },
          autoEnhance,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || `Save failed (${res.status})`);
        return;
      }
      onSaved(j.id);
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const ctlBtn = 'flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1.5 text-[13px]';
  const border = { borderColor: 'var(--border)', color: 'var(--text-secondary)' } as const;
  const activeBorder = {
    borderColor: 'var(--primary)',
    color: 'var(--primary)',
    background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
  } as const;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90 md:flex-row" role="dialog" aria-label="Edit image">
      {/* Preview */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-6">
        <button
          aria-label="Close editor"
          onClick={onClose}
          className="absolute left-4 top-4 z-10 rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white"
        >
          <X className="h-6 w-6" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/media/dam/asset/${assetId}/full`}
          alt={filename}
          className="max-h-full max-w-full object-contain select-none"
          style={previewStyle}
          draggable={false}
        />
        {autoEnhance && (
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-[12px] text-white/90">
            Auto-enhance applies on save
          </span>
        )}
      </div>

      {/* Controls */}
      <div
        className="w-full shrink-0 overflow-y-auto p-5 md:w-[320px]"
        style={{ background: 'var(--card)' }}
      >
        <div className="flex flex-col gap-4 font-[family-name:var(--font-dm-sans)]">
          <h2 className="font-[family-name:var(--font-display)] text-[18px]" style={{ color: 'var(--text-primary)' }}>
            Edit image
          </h2>

          {/* Rotate / flip */}
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Rotate &amp; flip</div>
            <div className="flex flex-wrap gap-1.5">
              <button className={ctlBtn} style={border} onClick={() => setRotate90((r) => (r + 270) % 360)}>
                <RotateCcw className="h-4 w-4" /> Left
              </button>
              <button className={ctlBtn} style={border} onClick={() => setRotate90((r) => (r + 90) % 360)}>
                <RotateCw className="h-4 w-4" /> Right
              </button>
              <button className={ctlBtn} style={flipH ? activeBorder : border} onClick={() => setFlipH((v) => !v)}>
                <FlipHorizontal2 className="h-4 w-4" /> Flip H
              </button>
              <button className={ctlBtn} style={flipV ? activeBorder : border} onClick={() => setFlipV((v) => !v)}>
                <FlipVertical2 className="h-4 w-4" /> Flip V
              </button>
            </div>
          </div>

          {/* Straighten */}
          <Slider label={`Straighten (${straighten}°)`} min={-15} max={15} step={1} value={straighten} onChange={setStraighten} />

          {/* Adjustments */}
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Adjust</div>
            <Slider label={`Brightness`} min={0.5} max={1.5} step={0.01} value={brightness} onChange={setBrightness} />
            <Slider label={`Contrast`} min={0.5} max={1.5} step={0.01} value={contrast} onChange={setContrast} />
            <Slider label={`Saturation`} min={0} max={2} step={0.01} value={saturation} onChange={setSaturation} />
            <button
              className={`${ctlBtn} mt-1`}
              style={autoEnhance ? activeBorder : border}
              onClick={() => setAutoEnhance((v) => !v)}
            >
              <Wand2 className="h-4 w-4" /> Auto-enhance
            </button>
          </div>

          {/* Smart crop to channel */}
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              <Crop className="h-3.5 w-3.5" /> Smart crop to
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                className="rounded-[6px] border px-2 py-1 text-[12px]"
                style={cropPreset === null ? activeBorder : border}
                onClick={() => setCropPreset(null)}
              >
                None
              </button>
              {CHANNEL_PRESETS.filter((p) => p.height).map((p) => (
                <button
                  key={p.key}
                  className="rounded-[6px] border px-2 py-1 text-[12px]"
                  style={cropPreset === p.key ? activeBorder : border}
                  onClick={() => setCropPreset(p.key)}
                  title={p.label}
                >
                  {p.label.replace(/\s*\(.*\)$/, '')}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Subject-aware crop — the server picks the focal point.
            </p>
          </div>

          {/* Alt text */}
          <div>
            <button className={ctlBtn} style={border} onClick={genAltText} disabled={altLoading}>
              {altLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Type className="h-4 w-4" />}
              {altLoading ? 'Generating…' : 'Suggest alt text'}
            </button>
            {altText != null && (
              <textarea
                readOnly
                value={altText}
                className="mt-1.5 w-full rounded-[6px] border p-2 text-[12px]"
                style={{ borderColor: 'var(--border)', background: 'var(--page-bg)', color: 'var(--text-primary)' }}
                rows={2}
              />
            )}
          </div>

          {error && <p className="text-[12px]" style={{ color: 'var(--primary)' }}>{error}</p>}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving || !isDirty}
              className="flex flex-1 items-center justify-center gap-2 rounded-[8px] px-3 py-2 text-[13px] font-medium disabled:opacity-50"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? 'Saving…' : 'Save as new'}
            </button>
            <button onClick={reset} disabled={!isDirty} className={ctlBtn} style={border}>
              Reset
            </button>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Saves a copy — your original is never changed.
          </p>
        </div>
      </div>
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mb-1.5 block">
      <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--primary)]"
      />
    </label>
  );
}

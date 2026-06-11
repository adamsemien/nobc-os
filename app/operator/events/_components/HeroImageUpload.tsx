'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Pencil, Sparkles, Upload, X } from 'lucide-react';
import { getEventHeroDisplayUrl } from '@/lib/event-hero-url';

type Props = {
  value: string;
  onChange: (url: string) => void;
  compact?: boolean;
};

export function HeroImageUpload({ value, onChange, compact = false }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function upload(file: File) {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Only image files allowed.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be 10MB or less.');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/media/upload', {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Upload failed (${res.status})`);
      }
      // Upload returns a private R2 object key (not a public URL); the proxy
      // resolves it for display, both here and on the member-facing event page.
      const data = (await res.json()) as { key: string };
      onChange(data.key);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void upload(file);
  }

  function handlePick() {
    fileRef.current?.click();
  }

  function handleRemove() {
    onChange('');
  }

  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = '';
        }}
      />

      {value ? (
        <div className={`group relative w-full overflow-hidden rounded-sm border border-[var(--apply-rule)] bg-card ${compact ? 'h-[180px]' : 'aspect-video'}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={getEventHeroDisplayUrl(value) ?? ''} alt="Hero preview" className="h-full w-full object-cover" />

          {/* Always-visible affordance so it's obvious the photo can be changed —
              the hover-only overlay below was too easy to miss. */}
          <button
            type="button"
            onClick={handlePick}
            disabled={uploading}
            aria-label="Replace photo"
            className="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-widest text-white shadow-sm transition-colors hover:bg-[var(--nobc-red)] disabled:opacity-60 font-[family-name:var(--font-dm-sans)]"
            style={{ backgroundColor: 'color-mix(in srgb, var(--apply-ink) 62%, transparent)' }}
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            {uploading ? 'Replacing…' : 'Replace photo'}
          </button>

          <div
            className="absolute inset-0 hidden items-center justify-center gap-3 group-hover:flex"
            style={{ backgroundColor: 'color-mix(in srgb, var(--apply-ink) 40%, transparent)' }}
          >
            <button
              type="button"
              onClick={handlePick}
              disabled={uploading}
              className="rounded-sm border border-white/80 bg-transparent px-4 py-2 text-[11px] font-medium uppercase tracking-widest text-white transition-colors hover:border-[var(--nobc-red)] hover:bg-[var(--nobc-red)] disabled:opacity-60 font-[family-name:var(--font-dm-sans)]"
            >
              {uploading ? 'Replacing…' : 'Replace photo'}
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="rounded-sm border border-white/80 bg-transparent px-4 py-2 text-[11px] font-medium uppercase tracking-widest text-white transition-colors hover:border-[var(--nobc-red)] hover:bg-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={handlePick}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handlePick();
            }
          }}
          onDragOver={e => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`flex w-full cursor-pointer flex-col items-center justify-center rounded-sm border-2 border-dashed bg-card px-4 text-center transition-colors ${
            compact ? 'h-[120px]' : 'aspect-video'
          } ${
            dragOver
              ? 'border-[var(--nobc-red)] bg-raised'
              : 'border-[var(--apply-rule)] hover:border-[var(--nobc-red)]'
          }`}
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-[var(--apply-muted)]" />
          ) : (
            <>
              <Upload className={`${compact ? 'mb-1.5 h-5 w-5' : 'mb-3 h-6 w-6'} text-[var(--apply-muted)]`} strokeWidth={1.25} />
              <p className="text-sm text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
                Drag &amp; drop or click to upload
              </p>
              <p className="mt-1 text-xs text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                JPG, PNG, or WebP · max 10MB
              </p>
            </>
          )}
        </div>
      )}

      {error ? (
        <p role="alert" className="text-xs text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setToast('AI image generation coming in V1.5')}
        className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] hover:text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]"
      >
        <Sparkles className="h-3.5 w-3.5" strokeWidth={1.25} />
        Generate with AI
      </button>

      {toast ? (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-sm border border-[var(--apply-rule)] bg-card px-4 py-2.5 text-xs text-[var(--apply-ink)] shadow-md font-[family-name:var(--font-dm-sans)]"
        >
          <span className="inline-flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-[var(--nobc-red)]" />
            {toast}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setToast(null)}
              className="ml-2 text-[var(--apply-muted)] hover:text-[var(--apply-ink)]"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        </div>
      ) : null}
    </div>
  );
}

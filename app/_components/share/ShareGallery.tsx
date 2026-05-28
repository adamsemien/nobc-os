/**
 * Server-rendered gallery grid for a share. Each tile shows the thumbnail with
 * an optional watermark overlay, the filename, and a Download link to the
 * public token-scoped download endpoint (which logs + enforces
 * `allowedDownloads` server-side and 302-redirects to a 24-hour signed R2 URL).
 *
 * Tiles whose thumbnail couldn't be presigned (storage unconfigured, missing
 * key) render a placeholder card rather than a broken image.
 */
import { Watermark } from './Watermark';
import type { SharedAsset } from '@/lib/share/assets';

export function ShareGallery({
  token,
  assets,
  watermark,
  watermarkLabel,
  downloadsExhausted,
}: {
  token: string;
  assets: SharedAsset[];
  watermark: boolean;
  watermarkLabel: string;
  /** When `allowedDownloads` is set and used up, render the download CTA as disabled. */
  downloadsExhausted: boolean;
}) {
  if (assets.length === 0) {
    return (
      <p className="mt-12 text-center text-[14px] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
        No media in this share yet.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
      {assets.map((asset: SharedAsset) => (
        <article
          key={asset.id}
          className="overflow-hidden rounded-[6px]"
          style={{ background: 'var(--events-paper-card)', border: '1px solid var(--apply-rule)' }}
        >
          <Watermark enabled={watermark} label={watermarkLabel}>
            <div className="aspect-[4/3] w-full overflow-hidden bg-[var(--apply-rule)]">
              {asset.thumbUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={asset.thumbUrl}
                  alt={asset.filename}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[11px] uppercase tracking-[0.24em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                  Preview unavailable
                </div>
              )}
            </div>
          </Watermark>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <p
              className="truncate text-[12px] text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]"
              title={asset.filename}
            >
              {asset.filename}
            </p>
            {downloadsExhausted ? (
              <span className="rounded-[4px] border px-2 py-1 text-[10px] uppercase tracking-[0.22em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]"
                style={{ borderColor: 'var(--apply-rule)' }}>
                Limit reached
              </span>
            ) : (
              <a
                href={`/api/share/token/${encodeURIComponent(token)}/download/${encodeURIComponent(asset.id)}`}
                className="rounded-[4px] border px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-[var(--apply-ink)] transition-colors hover:bg-[var(--nobc-red)] hover:text-white hover:border-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]"
                style={{ borderColor: 'var(--apply-rule)' }}
              >
                Download
              </a>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

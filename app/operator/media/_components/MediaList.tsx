'use client';
import { useState, type MouseEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, Play } from 'lucide-react';
import { ScoreBadge } from '@/app/operator/_components/ScoreBadge';
import { BlurhashCanvas } from './BlurhashCanvas';
import { formatBytes } from './MediaPreview';
import type { MediaAsset } from './types';

/** Desktop-only table view of the media library. Shares selection + open
 *  handlers with the parent (MediaWorkspace), so toggling between views
 *  preserves filter/sort/search/FTS state and selection. */
export function MediaList({
  assets,
  loading,
  selection,
  onToggle,
  onOpen,
}: {
  assets: MediaAsset[];
  loading: boolean;
  selection: Set<string>;
  onToggle: (id: string, range: boolean) => void;
  onOpen: (index: number) => void;
}) {
  const sp = useSearchParams();
  const isTrash = sp.get('view') === 'trash';

  if (!loading && assets.length === 0) {
    return (
      <div
        className="py-12 text-center text-[13px]"
        style={{ color: 'var(--text-muted)' }}
      >
        {isTrash ? 'Trash is empty.' : 'No media to display.'}
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-lg border"
      style={{ borderColor: 'var(--border)' }}
    >
      <table className="w-full text-sm">
        <thead>
          <tr
            className="border-b"
            style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}
          >
            <th className="w-10 px-3 py-3" />
            <th className="w-[64px] px-3 py-3" />
            <th
              className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Name
            </th>
            <th
              className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Folder
            </th>
            <th
              className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Dimensions
            </th>
            <th
              className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Size
            </th>
            <th
              className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Shoot date
            </th>
            <th
              className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Score
            </th>
            <th
              className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Tags
            </th>
          </tr>
        </thead>
        <tbody>
          {assets.map((a, i) => (
            <MediaListRow
              key={a.id}
              asset={a}
              index={i}
              selected={selection.has(a.id)}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MediaListRow({
  asset,
  index,
  selected,
  onToggle,
  onOpen,
}: {
  asset: MediaAsset;
  index: number;
  selected: boolean;
  onToggle: (id: string, range: boolean) => void;
  onOpen: (index: number) => void;
}) {
  const [loaded, setLoaded] = useState(false);

  const folder = asset.sponsorName ?? '—';
  const dims =
    asset.width != null && asset.height != null
      ? `${asset.width} × ${asset.height}`
      : '—';
  const shootSrc = asset.shootDate ?? asset.createdAt;
  const shootDate = new Date(shootSrc).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const visibleTags = asset.aiTags.slice(0, 2);
  const moreCount = Math.max(0, asset.aiTags.length - 2);

  const handleCheckboxClick = (e: MouseEvent) => {
    e.stopPropagation();
    onToggle(asset.id, e.shiftKey || e.metaKey || e.ctrlKey);
  };

  return (
    <tr
      onClick={() => onOpen(index)}
      data-selected={selected || undefined}
      className="group cursor-pointer border-b transition-colors hover:bg-[var(--muted)] data-[selected]:bg-[color-mix(in_srgb,var(--primary)_8%,transparent)]"
      style={{ height: '56px', borderColor: 'var(--border)' }}
    >
      <td
        className="w-10 px-3 align-middle"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleCheckboxClick}
          aria-label={selected ? 'Deselect' : 'Select'}
          aria-pressed={selected}
          className="flex h-4 w-4 items-center justify-center rounded-[3px] border transition-colors"
          style={{
            background: selected ? 'var(--primary)' : 'transparent',
            borderColor: selected ? 'var(--primary)' : 'var(--border)',
          }}
        >
          {selected && (
            <Check
              className="h-3 w-3"
              style={{ color: 'var(--primary-foreground)' }}
            />
          )}
        </button>
      </td>
      <td className="w-[64px] px-3 align-middle">
        <div
          className="relative h-12 w-12 overflow-hidden rounded-[4px]"
          style={{ background: 'var(--card)' }}
        >
          {asset.blurhash && (
            <BlurhashCanvas
              hash={asset.blurhash}
              className="absolute inset-0 transition-opacity duration-200"
              style={{ width: '100%', height: '100%', opacity: loaded ? 0 : 1 }}
            />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/media/dam/asset/${asset.id}/thumb`}
            alt={asset.filename}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            className="absolute inset-0 h-full w-full object-cover transition-opacity duration-200"
            style={{ opacity: loaded ? 1 : 0 }}
          />
          {asset.fileType === 'VIDEO' && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="flex items-center justify-center rounded-full bg-black/50 p-1">
                <Play className="h-3 w-3 fill-white text-white" />
              </span>
            </div>
          )}
        </div>
      </td>
      <td className="min-w-0 px-4 align-middle">
        <span
          className="block truncate font-medium"
          style={{ color: 'var(--text-primary)' }}
        >
          {asset.filename}
        </span>
      </td>
      <td
        className="px-4 align-middle"
        style={{ color: 'var(--text-secondary)' }}
      >
        {folder}
      </td>
      <td
        className="px-4 align-middle text-right tabular-nums"
        style={{ color: 'var(--text-secondary)' }}
      >
        {dims}
      </td>
      <td
        className="px-4 align-middle text-right tabular-nums"
        style={{ color: 'var(--text-secondary)' }}
      >
        {formatBytes(asset.size)}
      </td>
      <td
        className="px-4 align-middle text-right tabular-nums"
        style={{ color: 'var(--text-secondary)' }}
      >
        {shootDate}
      </td>
      <td className="px-4 align-middle text-right">
        <ScoreBadge value={asset.qualityScore} size="sm" showTier={false} />
      </td>
      <td className="px-4 align-middle">
        <div className="flex flex-wrap gap-1">
          {visibleTags.map((t) => (
            <span
              key={t}
              className="rounded-[4px] px-2 py-0.5 text-[11px]"
              style={{
                background: 'var(--muted)',
                color: 'var(--text-secondary)',
              }}
            >
              {t}
            </span>
          ))}
          {moreCount > 0 && (
            <span
              className="text-[11px]"
              style={{ color: 'var(--text-muted)' }}
            >
              +{moreCount} more
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

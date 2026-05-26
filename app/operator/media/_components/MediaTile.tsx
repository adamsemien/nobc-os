'use client';
import { useState, type MouseEvent } from 'react';
import { Check, Star, Film } from 'lucide-react';
import { BlurhashCanvas } from './BlurhashCanvas';

export interface TileAsset {
  id: string;
  filename: string;
  blurhash: string | null;
  width: number | null;
  height: number | null;
  fileType: 'PHOTO' | 'VIDEO';
  isSelect: boolean;
}

/**
 * Fills its (FLIP-positioned) wrapper. BlurHash → thumbnail fade, hover scale +
 * metadata overlay, top-left select checkbox. Position/FLIP live on the wrapper
 * in MediaGrid so the hover-scale transform never fights the FLIP translate.
 */
export function MediaTile({
  asset,
  selected,
  onToggleSelect,
  onOpen,
}: {
  asset: TileAsset;
  selected: boolean;
  onToggleSelect: (e: MouseEvent) => void;
  onOpen: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div
      className="group relative h-full w-full cursor-pointer overflow-hidden rounded-[6px] transition-transform duration-[180ms] ease-out hover:scale-[1.02]"
      style={{ background: 'var(--card)', boxShadow: selected ? '0 0 0 3px var(--primary)' : undefined }}
      onClick={onOpen}
    >
      {asset.blurhash && (
        <BlurhashCanvas
          hash={asset.blurhash}
          className="absolute inset-0 transition-opacity duration-300"
          style={{ width: '100%', height: '100%', opacity: loaded ? 0 : 1 }}
        />
      )}
      <img
        src={`/api/media/dam/asset/${asset.id}/thumb`}
        alt={asset.filename}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className="absolute inset-0 h-full w-full object-cover transition-[opacity,filter] duration-300 group-hover:brightness-105"
        style={{ opacity: loaded ? 1 : 0 }}
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(e);
        }}
        aria-label={selected ? 'Deselect' : 'Select'}
        className={`absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-[5px] border transition-opacity ${
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
        style={{
          background: selected ? 'var(--primary)' : 'rgba(255,255,255,0.85)',
          borderColor: 'var(--border)',
        }}
      >
        {selected && <Check className="h-3.5 w-3.5" style={{ color: '#fff' }} />}
      </button>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        {asset.isSelect && <Star className="h-3 w-3 shrink-0" style={{ color: '#fff', fill: '#fff' }} />}
        {asset.fileType === 'VIDEO' && <Film className="h-3 w-3 shrink-0" style={{ color: '#fff' }} />}
        <span className="truncate font-[family-name:var(--font-mono)] text-[11px] text-white">
          {asset.filename}
        </span>
      </div>
    </div>
  );
}

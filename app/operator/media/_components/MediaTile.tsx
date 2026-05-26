'use client';
import { useState } from 'react';
import type { JLBox } from 'justified-layout';
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

/** A single grid tile: BlurHash placeholder fading to the thumbnail on load. */
export function MediaTile({ asset, box }: { asset: TileAsset; box: JLBox }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div
      className="absolute overflow-hidden rounded-[6px]"
      style={{ width: box.width, height: box.height, top: box.top, left: box.left, background: 'var(--card)' }}
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
        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
        style={{ opacity: loaded ? 1 : 0 }}
      />
    </div>
  );
}

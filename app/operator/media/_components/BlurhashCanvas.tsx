'use client';
import { useEffect, useRef } from 'react';
import { decode } from 'blurhash';
import type { CSSProperties } from 'react';

/** Renders a BlurHash to a small canvas (stretched by CSS) as a placeholder. */
export function BlurhashCanvas({
  hash,
  punch = 1,
  className,
  style,
}: {
  hash: string;
  punch?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    try {
      const w = 32;
      const h = 32;
      const pixels = decode(hash, w, h, punch);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const imageData = ctx.createImageData(w, h);
      imageData.data.set(pixels);
      ctx.putImageData(imageData, 0, 0);
    } catch {
      // Invalid hash — leave the canvas blank; the tile background shows through.
    }
  }, [hash, punch]);
  return <canvas ref={ref} width={32} height={32} className={className} style={style} aria-hidden />;
}

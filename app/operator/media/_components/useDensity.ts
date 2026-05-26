'use client';
import { useEffect, useState } from 'react';

export type Density = 'small' | 'medium' | 'large';
export const ROW_HEIGHT: Record<Density, number> = { small: 140, medium: 200, large: 280 };
const KEY = 'dam:density';

/** Grid density (S/M/L thumbnail rows), persisted to localStorage. */
export function useDensity(): [Density, (d: Density) => void] {
  const [density, setDensity] = useState<Density>('medium');
  useEffect(() => {
    const saved = localStorage.getItem(KEY) as Density | null;
    if (saved && saved in ROW_HEIGHT) setDensity(saved);
  }, []);
  const set = (d: Density) => {
    setDensity(d);
    localStorage.setItem(KEY, d);
  };
  return [density, set];
}

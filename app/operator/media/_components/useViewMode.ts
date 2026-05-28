'use client';
import { useEffect, useState } from 'react';

export type ViewMode = 'grid' | 'list';
const KEY = 'nobc-media-view';

/** Media library view mode (grid | list), persisted to localStorage. */
export function useViewMode(): [ViewMode, (m: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>('grid');
  useEffect(() => {
    const saved = localStorage.getItem(KEY) as ViewMode | null;
    if (saved === 'grid' || saved === 'list') setMode(saved);
  }, []);
  const set = (m: ViewMode) => {
    setMode(m);
    localStorage.setItem(KEY, m);
  };
  return [mode, set];
}

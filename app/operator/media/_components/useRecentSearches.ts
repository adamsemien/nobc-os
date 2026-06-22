'use client';
import { useCallback, useEffect, useState } from 'react';

const KEY = 'dam_recent_searches';
const MAX = 5;

export function pushRecentSearch(q: string): string[] {
  if (!q.trim()) return getRecentSearches();
  const existing = getRecentSearches();
  const deduped = [q, ...existing.filter((s) => s !== q)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(deduped));
  } catch {}
  return deduped;
}

export function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

export function useRecentSearches() {
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    setRecents(getRecentSearches());
  }, []);

  const push = useCallback((q: string) => {
    setRecents(pushRecentSearch(q));
  }, []);

  const clear = useCallback(() => {
    clearRecentSearches();
    setRecents([]);
  }, []);

  return { recents, push, clear };
}

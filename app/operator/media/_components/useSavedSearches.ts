'use client';
import { useCallback, useEffect, useState } from 'react';

const KEY = 'dam_saved_searches';
const MAX = 20;

export interface SavedSearch {
  id: string;
  name: string;
  params: string; // URLSearchParams string snapshot
  createdAt: string;
}

export function serializeSavedSearches(searches: SavedSearch[]): string {
  return JSON.stringify(searches);
}

export function deserializeSavedSearches(raw: string | null): SavedSearch[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function useSavedSearches() {
  const [saved, setSaved] = useState<SavedSearch[]>([]);

  useEffect(() => {
    try {
      setSaved(deserializeSavedSearches(localStorage.getItem(KEY)));
    } catch (e) {
      console.error('[dam/saved-searches] load failed', e);
    }
  }, []);

  const persist = useCallback(
    (next: SavedSearch[]) => {
      setSaved(next);
      try {
        localStorage.setItem(KEY, serializeSavedSearches(next));
      } catch (e) {
        console.error('[dam/saved-searches] persist failed', e);
      }
    },
    // persist does NOT depend on `saved` — it receives the full list as an arg
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const save = useCallback(
    (name: string, params: string) => {
      const entry: SavedSearch = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        name,
        params,
        createdAt: new Date().toISOString(),
      };
      setSaved((prev) => {
        const next = [entry, ...prev].slice(0, MAX);
        try {
          localStorage.setItem(KEY, serializeSavedSearches(next));
        } catch (e) {
          console.error('[dam/saved-searches] persist failed', e);
        }
        return next;
      });
      return entry;
    },
    [],
  );

  const rename = useCallback(
    (id: string, name: string) => {
      setSaved((prev) => {
        const next = prev.map((s) => (s.id === id ? { ...s, name } : s));
        try {
          localStorage.setItem(KEY, serializeSavedSearches(next));
        } catch (e) {
          console.error('[dam/saved-searches] persist failed', e);
        }
        return next;
      });
    },
    [],
  );

  const remove = useCallback(
    (id: string) => {
      setSaved((prev) => {
        const next = prev.filter((s) => s.id !== id);
        try {
          localStorage.setItem(KEY, serializeSavedSearches(next));
        } catch (e) {
          console.error('[dam/saved-searches] persist failed', e);
        }
        return next;
      });
    },
    [],
  );

  return { saved, save, rename, remove };
}

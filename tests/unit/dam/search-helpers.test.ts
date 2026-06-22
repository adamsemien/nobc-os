/**
 * Unit tests for DAM search helper pure functions.
 *
 * serializeSavedSearches / deserializeSavedSearches — fully DOM-free; tested directly.
 *
 * pushRecentSearch / getRecentSearches / clearRecentSearches — call localStorage.
 * Vitest runs in `node` environment (no jsdom). We stub globalThis.localStorage
 * with a minimal Map-backed implementation in beforeEach. No extra deps required.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  serializeSavedSearches,
  deserializeSavedSearches,
} from '@/app/operator/media/_components/useSavedSearches';
import type { SavedSearch } from '@/app/operator/media/_components/useSavedSearches';
import {
  pushRecentSearch,
  getRecentSearches,
  clearRecentSearches,
} from '@/app/operator/media/_components/useRecentSearches';

// ---------------------------------------------------------------------------
// Minimal localStorage stub for the node environment
// ---------------------------------------------------------------------------
function makeLocalStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
}

// ---------------------------------------------------------------------------
// serializeSavedSearches / deserializeSavedSearches
// ---------------------------------------------------------------------------

const makeSavedSearch = (id: string): SavedSearch => ({
  id,
  name: `Search ${id}`,
  params: `q=${id}`,
  createdAt: new Date().toISOString(),
});

describe('serializeSavedSearches', () => {
  it('serializes an empty array to "[]"', () => {
    expect(serializeSavedSearches([])).toBe('[]');
  });

  it('produces valid JSON that round-trips', () => {
    const input = [makeSavedSearch('a'), makeSavedSearch('b')];
    const json = serializeSavedSearches(input);
    expect(JSON.parse(json)).toHaveLength(2);
    expect(JSON.parse(json)[0].id).toBe('a');
  });
});

describe('deserializeSavedSearches', () => {
  it('returns [] for null', () => {
    expect(deserializeSavedSearches(null)).toEqual([]);
  });

  it('returns [] for invalid JSON', () => {
    expect(deserializeSavedSearches('not json')).toEqual([]);
    expect(deserializeSavedSearches('{}')).toEqual([]); // object, not array
    expect(deserializeSavedSearches('42')).toEqual([]);
    expect(deserializeSavedSearches('null')).toEqual([]);
  });

  it('returns [] for a JSON non-array (object)', () => {
    expect(deserializeSavedSearches('{"id":"x"}')).toEqual([]);
  });

  it('round-trips a valid array', () => {
    const input = [makeSavedSearch('x'), makeSavedSearch('y')];
    const json = serializeSavedSearches(input);
    const result = deserializeSavedSearches(json);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('x');
    expect(result[1].name).toBe('Search y');
  });

  it('slices arrays longer than 20 entries to 20', () => {
    const twentyTwo = Array.from({ length: 22 }, (_, i) => makeSavedSearch(String(i)));
    const json = serializeSavedSearches(twentyTwo);
    const result = deserializeSavedSearches(json);
    expect(result).toHaveLength(20);
    // First 20 entries are preserved (slice from front)
    expect(result[0].id).toBe('0');
    expect(result[19].id).toBe('19');
  });

  it('preserves exactly 20 entries without slicing', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => makeSavedSearch(String(i)));
    expect(deserializeSavedSearches(serializeSavedSearches(twenty))).toHaveLength(20);
  });
});

// ---------------------------------------------------------------------------
// pushRecentSearch / getRecentSearches / clearRecentSearches
// localStorage is stubbed per-test so tests are fully isolated.
// ---------------------------------------------------------------------------

describe('pushRecentSearch / getRecentSearches / clearRecentSearches', () => {
  beforeEach(() => {
    // Install a fresh stub before every test so no state leaks between tests.
    (globalThis as unknown as Record<string, unknown>).localStorage = makeLocalStorageStub();
  });

  describe('getRecentSearches', () => {
    it('returns [] when storage is empty', () => {
      expect(getRecentSearches()).toEqual([]);
    });
  });

  describe('pushRecentSearch', () => {
    it('adds a search and returns the new list', () => {
      const result = pushRecentSearch('jazz');
      expect(result).toEqual(['jazz']);
      expect(getRecentSearches()).toEqual(['jazz']);
    });

    it('prepends newest to the front', () => {
      pushRecentSearch('first');
      const result = pushRecentSearch('second');
      expect(result[0]).toBe('second');
      expect(result[1]).toBe('first');
    });

    it('deduplicates — pushing an existing query moves it to front', () => {
      pushRecentSearch('alpha');
      pushRecentSearch('beta');
      const result = pushRecentSearch('alpha'); // re-push existing
      expect(result).toEqual(['alpha', 'beta']);
      expect(result).toHaveLength(2); // no duplicate
    });

    it('trims to 5 — 6th push drops oldest entry', () => {
      for (let i = 1; i <= 5; i++) pushRecentSearch(`q${i}`);
      const result = pushRecentSearch('q6');
      expect(result).toHaveLength(5);
      expect(result[0]).toBe('q6');
      expect(result.includes('q1')).toBe(false); // oldest dropped
    });

    it('ignores blank / whitespace-only queries', () => {
      pushRecentSearch('valid');
      const result = pushRecentSearch('   ');
      expect(result).toEqual(['valid']); // unchanged
    });

    it('returns newest-first order', () => {
      pushRecentSearch('a');
      pushRecentSearch('b');
      pushRecentSearch('c');
      expect(getRecentSearches()).toEqual(['c', 'b', 'a']);
    });
  });

  describe('clearRecentSearches', () => {
    it('empties the list', () => {
      pushRecentSearch('one');
      pushRecentSearch('two');
      clearRecentSearches();
      expect(getRecentSearches()).toEqual([]);
    });

    it('is idempotent — clearing an already empty list is safe', () => {
      clearRecentSearches();
      expect(getRecentSearches()).toEqual([]);
    });
  });
});

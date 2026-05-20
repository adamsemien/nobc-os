'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { OperatorCounts } from '@/app/api/operator/counts/route';

type CountsContextValue = {
  counts: OperatorCounts | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const CountsContext = createContext<CountsContextValue>({
  counts: null,
  loading: true,
  refresh: async () => {},
});

const REFRESH_EVENT = 'nobc:counts:refresh';

export function emitCountsRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
}

export function CountsProvider({ children }: { children: React.ReactNode }) {
  const [counts, setCounts] = useState<OperatorCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const inflight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (inflight.current) return inflight.current;
    const p = (async () => {
      try {
        const res = await fetch('/api/operator/counts', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as OperatorCounts;
        setCounts(data);
      } catch {
        // network errors keep last-known counts
      } finally {
        setLoading(false);
        inflight.current = null;
      }
    })();
    inflight.current = p;
    return p;
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(refresh, 60_000);
    const onEvt = () => void refresh();
    window.addEventListener(REFRESH_EVENT, onEvt);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(REFRESH_EVENT, onEvt);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ counts, loading, refresh }),
    [counts, loading, refresh],
  );

  return (
    <CountsContext.Provider value={value}>{children}</CountsContext.Provider>
  );
}

export function useCounts(): CountsContextValue {
  return useContext(CountsContext);
}

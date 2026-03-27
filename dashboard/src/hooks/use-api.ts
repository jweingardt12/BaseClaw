import { useCallback, useEffect, useState } from "react";
import { clearApiCache, getCachedData } from "@/lib/api";

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = [], cacheKey?: string): UseApiResult<T> {
  const cached = cacheKey ? getCachedData<T>(cacheKey) : undefined;

  const [data, setData] = useState<T | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetcher()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    load();
  }, [load]);

  const refetch = useCallback(() => {
    clearApiCache();
    load();
  }, [load]);

  return { data, loading, error, refetch };
}

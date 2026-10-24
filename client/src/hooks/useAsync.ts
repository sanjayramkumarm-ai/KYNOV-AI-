import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../services/api';

/** Tiny data-fetching hook with loading/error state and manual reload. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = [], options: { skip?: boolean } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!options.skip);
  const [error, setError] = useState<ApiError | null>(null);
  const alive = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fnRef.current();
      if (alive.current) setData(result);
      return result;
    } catch (err) {
      if (alive.current) setError(err instanceof ApiError ? err : new ApiError(0, String(err), 'NETWORK'));
      return null;
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    if (!options.skip) void run();
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload: run, setData };
}

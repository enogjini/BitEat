import { useCallback, useEffect, useState } from 'react';

// Runs `fn` on mount (and whenever `deps` change) and exposes
// { data, error, loading, refreshing, reload } for list/detail screens.
export function useApi(fn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const run = useCallback(async (isRefresh) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const result = await fn();
      setData(result);
    } catch (err) {
      setError(err.message || 'Gabim i papritur');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run(false);
  }, [run]);

  return {
    data,
    error,
    loading,
    refreshing,
    reload: () => run(false),
    refresh: () => run(true),
  };
}

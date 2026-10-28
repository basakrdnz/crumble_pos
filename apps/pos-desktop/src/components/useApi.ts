import { useCallback, useEffect, useState } from 'react';
import { useToast } from './Toast';

/** Loads data from the API and reloads on demand. */
export function useApiData<T>(load: () => Promise<T>, deps: unknown[] = []): [T | undefined, () => Promise<void>] {
  const [data, setData] = useState<T>();
  const toast = useToast();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(async () => {
    try {
      setData(await load());
    } catch (e) {
      toast.error(e);
    }
  }, deps);
  useEffect(() => {
    void reload();
  }, [reload]);
  return [data, reload];
}

/** Wraps an action so failures show a toast instead of being lost. */
export function useAction() {
  const toast = useToast();
  return useCallback(
    async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      try {
        const result = await fn();
        if (success) toast.info(success);
        return result;
      } catch (e) {
        toast.error(e);
        return undefined;
      }
    },
    [toast],
  );
}

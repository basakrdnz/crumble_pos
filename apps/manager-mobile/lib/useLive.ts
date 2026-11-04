// Loads data and keeps it fresh: Supabase Realtime pushes changes within
// seconds (plan Faz 6 kabul); a 15 s poll covers networks where the realtime
// socket cannot connect.
//
// Background reloads (poll, realtime) are silent: only a pull-to-refresh shows
// the spinner. They also never overlap: a reload asked for while one is
// running waits for it instead of starting another (2026-11-04: the spinner
// flashing on every poll made the screens jump and feel stuck).
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

const POLL_MS = Number(process.env.EXPO_PUBLIC_POLL_MS) || 15_000;
const LIVE_TABLES = ['tabs', 'tab_items', 'payments', 'refunds', 'shifts', 'device_status', 'tab_requests'];

export function useLive<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadRef = useRef(load);
  loadRef.current = load;
  const running = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const alive = useRef(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchNow = useCallback(async (): Promise<void> => {
    if (running.current) {
      again.current = true; // one more round after the current one, with the newest data
      return running.current;
    }
    const round = (async () => {
      do {
        again.current = false;
        try {
          const next = await loadRef.current();
          if (alive.current) {
            setData(next);
            setError(null);
          }
        } catch (e) {
          if (alive.current) setError(e instanceof Error ? e.message : String(e));
        }
      } while (again.current && alive.current);
    })();
    running.current = round;
    try {
      await round;
    } finally {
      running.current = null;
    }
  }, deps);

  /** Pull to refresh: shows the spinner until fresh data is in. */
  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchNow();
    } finally {
      if (alive.current) setRefreshing(false);
    }
  }, [fetchNow]);

  useEffect(() => {
    alive.current = true;
    void fetchNow();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void fetchNow(), 500);
    };
    const channel = supabase.channel(`live-${Math.random().toString(36).slice(2)}`);
    for (const table of LIVE_TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, soon);
    }
    channel.subscribe();
    const poll = setInterval(() => void fetchNow(), POLL_MS);
    return () => {
      alive.current = false;
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [fetchNow]);

  return { data, error, refreshing, reload };
}

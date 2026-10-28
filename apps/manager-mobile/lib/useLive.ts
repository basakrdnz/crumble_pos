// Loads data and keeps it fresh: Supabase Realtime pushes changes within
// seconds (plan Faz 6 kabul); a 15 s poll covers networks where the realtime
// socket cannot connect.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

const POLL_MS = Number(process.env.EXPO_PUBLIC_POLL_MS) || 15_000;
const LIVE_TABLES = ['tabs', 'payments', 'refunds', 'shifts', 'device_status'];

export function useLive<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadRef = useRef(load);
  loadRef.current = load;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }, deps);

  useEffect(() => {
    void reload();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void reload(), 500);
    };
    const channel = supabase.channel(`live-${Math.random().toString(36).slice(2)}`);
    for (const table of LIVE_TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, soon);
    }
    channel.subscribe();
    const poll = setInterval(() => void reload(), POLL_MS);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [reload]);

  return { data, error, refreshing, reload };
}

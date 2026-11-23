import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

// Set in .env (see .env.example) or the EAS build environment. The anon key
// is public by design; RLS limits partners to reading. Never put the
// service_role key here.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isConfigured = url.length > 0 && anonKey.length > 0;

export const supabase = createClient(url || 'http://localhost', anonKey || 'missing', {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// Token refresh only while the app is in front (Supabase's React Native
// guidance). A phone that slept with the app open (Android stops timers in the
// background) otherwise came back with an expired session; the reads then ran
// without a user and RLS answered with nothing: "kasa kapalı", 0 TL reports
// (2026-11-23, the partner's Android phone).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}

/**
 * A signed-in session that is valid now, refreshed if it ran out. Reads must
 * not go out without one: they would come back empty and look like real zeros.
 */
export async function requireSession(): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  let session = data.session;
  if (session?.expires_at && session.expires_at * 1000 < Date.now() + 30_000) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session;
  }
  if (error || !session) throw new Error('Bağlantı yenilenemedi. İnternet bağlantısını kontrol edip aşağı çekerek yenileyin.');
}

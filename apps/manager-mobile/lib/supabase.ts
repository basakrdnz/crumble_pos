import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

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

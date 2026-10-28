import type { Session } from '@supabase/supabase-js';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

interface AuthState {
  /** Set only after the user is confirmed to be a partner. */
  session: Session | null;
  loading: boolean;
  error: string | null;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Only partners may use this app (plan §2): RLS shows a partner their own row. */
async function isPartner(): Promise<boolean> {
  const { data, error } = await supabase.from('partners').select('id').limit(1);
  return !error && !!data && data.length > 0;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session && (await isPartner())) setSession(data.session);
      else if (data.session) await supabase.auth.signOut();
      setLoading(false);
    })();
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      // Sign-in is confirmed in signIn(); here only follow refreshes and sign-outs.
      if (event === 'SIGNED_OUT') setSession(null);
      else if (event === 'TOKEN_REFRESHED') setSession((current) => (current ? next : current));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    setError(null);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError || !data.session) {
      setError('E-posta veya şifre hatalı.');
      return;
    }
    if (!(await isPartner())) {
      await supabase.auth.signOut();
      setError('Bu hesap yönetim uygulamasına erişemez.');
      return;
    }
    setSession(data.session);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, loading, error, signIn, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider eksik');
  return value;
}

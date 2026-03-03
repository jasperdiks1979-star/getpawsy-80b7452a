/**
 * AuthContext — CRITICAL PATH OPTIMISED
 * ──────────────────────────────────────
 * @supabase/supabase-js is NOT imported at the top level.
 * It is dynamically imported inside the useEffect so the ~138 KB gzip
 * SDK chunk is excluded from the initial JS waterfall.
 *
 * Timeline:
 *   T+0ms   React renders App (no supabase on main thread)
 *   T+~50ms AuthProvider mounts, useEffect fires
 *   T+~50ms dynamic import('@supabase/client') begins in background
 *   T+~250ms supabase chunk downloaded+parsed, auth listeners active
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { traceEffect, traceStateSet, traceAuthEvent, traceMount } from '@/lib/lcp-render-trace';

// ── Types only — zero runtime cost, stripped at build ─────────────────────────
interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<Session | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Refresh token 5 minutes before expiration
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Lazy-load the supabase client — called only from async contexts */
const getSupabase = () => import('@/integrations/supabase/client').then(m => m.supabase);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  traceMount('AuthProvider');

  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  // Starts FALSE — children render immediately without waiting for getSession().
  // Auth state resolves asynchronously via onAuthStateChange.
  const [isLoading, setIsLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Stable action refs — recreated only when needed ───────────────────────
  const scheduleTokenRefreshRef = useRef<((expiresAt: number) => void) | null>(null);

  const checkAdminRole = useCallback(async (user: User | null) => {
    if (!user) { setIsAdmin(false); return false; }
    // Dynamic import keeps isAdmin.ts (and its supabase dep) out of critical path
    const { resolveIsAdmin } = await import('@/lib/auth/isAdmin');
    const result = await resolveIsAdmin(user);
    setIsAdmin(result);
    return result;
  }, []);

  const refreshSession = useCallback(async (): Promise<Session | null> => {
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase.auth.refreshSession();
      if (error) { console.error('[ProdSafe] Failed to refresh session:', error); return null; }
      return data.session;
    } catch (e) {
      console.error('[ProdSafe] refreshSession crashed (non-fatal):', e);
      return null;
    }
  }, []);

  const scheduleTokenRefresh = useCallback((expiresAt: number) => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    const expiresAtMs = expiresAt * 1000;
    const timeUntilRefresh = expiresAtMs - Date.now() - TOKEN_REFRESH_MARGIN_MS;

    if (timeUntilRefresh <= 0) {
      refreshSession();
      return;
    }
    console.log(`Scheduling token refresh in ${Math.round(timeUntilRefresh / 1000 / 60)} minutes`);
    refreshTimerRef.current = setTimeout(async () => {
      const newSession = await refreshSession();
      if (newSession?.expires_at) scheduleTokenRefreshRef.current?.(newSession.expires_at);
    }, timeUntilRefresh);
  }, [refreshSession]);

  // Keep ref in sync for use inside timer callbacks
  useEffect(() => { scheduleTokenRefreshRef.current = scheduleTokenRefresh; }, [scheduleTokenRefresh]);

  useEffect(() => {
    traceEffect('AuthProvider', 'auth-init (async — supabase not yet loaded)');

    let subscription: { unsubscribe: () => void } | null = null;
    let initialSessionResolved = false;

    // Safety timeout: if auth init hasn't completed in 10s, stop blocking the UI
    const authTimeout = setTimeout(() => {
      if (isLoading) {
        console.warn('[AuthProvider] Auth init timed out after 10s, unblocking UI');
        traceStateSet('AuthProvider', 'isLoading', false);
        setIsLoading(false);
      }
    }, 10_000);

    const applySession = (source: string, session: Session | null) => {
      traceStateSet('AuthProvider', `session+user [${source}]`, !!session);
      setSession(prev => prev === session ? prev : session);
      setUser(prev => {
        const next = session?.user ?? null;
        return prev?.id === next?.id ? prev : next;
      });
      if (session?.expires_at) scheduleTokenRefresh(session.expires_at);
      if (session?.user) {
        setTimeout(() => checkAdminRole(session.user), 0);
      } else {
        setIsAdmin(false);
      }
      traceStateSet('AuthProvider', 'isLoading', false);
      setIsLoading(false);
    };

    // ── Dynamic import — supabase SDK downloads AFTER React is mounted ────────
    const initAuth = async () => {
      const supabase = await getSupabase();

      // Set up auth state listener FIRST
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        console.log('Auth state changed:', event);
        traceAuthEvent(`onAuthStateChange → ${event}`);
        // Skip if getSession already resolved with the same data
        if (event === 'INITIAL_SESSION' && initialSessionResolved) return;
        applySession(`onAuthStateChange:${event}`, session);
      });
      subscription = data.subscription;

      // THEN check for existing session
      supabase.auth.getSession().then(({ data: { session } }) => {
        traceAuthEvent(`getSession resolved (hasSession=${!!session})`);
        initialSessionResolved = true;
        applySession('getSession', session);
      }).catch((e) => {
        console.error('[AuthProvider] getSession failed:', e);
        traceStateSet('AuthProvider', 'isLoading [getSession catch]', false);
        setIsLoading(false);
      });
    };

    initAuth().catch(e => {
      console.error('[AuthProvider] initAuth failed:', e);
      setIsLoading(false);
    });

    return () => {
      clearTimeout(authTimeout);
      subscription?.unsubscribe();
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = async (email: string, password: string) => {
    const supabase = await getSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    const supabase = await getSupabase();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: fullName },
      },
    });
    return { error };
  };

  const signOut = async () => {
    const supabase = await getSupabase();
    await supabase.auth.signOut();
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, isAdmin, signIn, signUp, signOut, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

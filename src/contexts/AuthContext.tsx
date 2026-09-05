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
import type { AdminResolution } from '@/lib/auth/isAdmin';
import { isTransportError, withTimeout, AUTH_REQUEST_TIMEOUT_MS } from '@/lib/auth/transportError';

// ── Types only — zero runtime cost, stripped at build ─────────────────────────
interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAdmin: boolean;
  /** False until the server-side role check for the current user has settled. */
  isAdminResolved: boolean;
  /** Tri-state role answer: true | false | 'unknown' (backend unreachable). */
  adminStatus: AdminResolution;
  /** Re-run the server-side role check (manual Retry). */
  retryAdminCheck: () => Promise<void>;
  /** False until the initial getSession()/onAuthStateChange has settled. */
  isSessionResolved: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; kind?: 'transport' | 'credentials' }>;
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
  const [adminStatus, setAdminStatus] = useState<AdminResolution>(false);
  const [isAdminResolved, setIsAdminResolved] = useState(false);
  const [isSessionResolved, setIsSessionResolved] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Guards against overlapping role checks. */
  const adminCheckInFlightRef = useRef(false);
  const currentUserRef = useRef<User | null>(null);

  // ── Stable action refs — recreated only when needed ───────────────────────
  const scheduleTokenRefreshRef = useRef<((expiresAt: number) => void) | null>(null);

  const checkAdminRole = useCallback(async (user: User | null): Promise<AdminResolution> => {
    if (!user) {
      setIsAdmin(false); setAdminStatus(false); setIsAdminResolved(true);
      return false;
    }
    if (adminCheckInFlightRef.current) return 'unknown';
    adminCheckInFlightRef.current = true;
    try {
      // Dynamic import keeps isAdmin.ts (and its supabase dep) out of critical path
      const { resolveIsAdminTriState } = await import('@/lib/auth/isAdmin');
      let result = await resolveIsAdminTriState(user);
      // Exactly one bounded retry, only when the answer was never delivered.
      if (result === 'unknown') {
        console.warn('[auth] admin_role_unknown', { attempt: 1, willRetry: true });
        await new Promise(r => setTimeout(r, 800));
        result = await resolveIsAdminTriState(user);
        if (result === 'unknown') {
          console.warn('[auth] admin_role_unknown', { attempt: 2, willRetry: false });
        }
      }
      setAdminStatus(result);
      setIsAdmin(result === true);
      // 'unknown' is NOT a settled answer — the guard must keep waiting.
      setIsAdminResolved(result !== 'unknown');
      return result;
    } catch (e) {
      console.warn('[auth] admin_role_check_failed', { name: (e as Error)?.name ?? 'Error' });
      setIsAdmin(false);
      setAdminStatus('unknown');
      setIsAdminResolved(false);
      return 'unknown';
    } finally {
      adminCheckInFlightRef.current = false;
    }
  }, []);

  const retryAdminCheck = useCallback(async () => {
    await checkAdminRole(currentUserRef.current);
  }, [checkAdminRole]);

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
      currentUserRef.current = session?.user ?? null;
      setUser(prev => {
        const next = session?.user ?? null;
        return prev?.id === next?.id ? prev : next;
      });
      if (session?.expires_at) scheduleTokenRefresh(session.expires_at);
      if (session?.user) {
        setIsAdminResolved(false);
        setTimeout(() => checkAdminRole(session.user), 0);
      } else {
        setIsAdmin(false);
        setIsAdminResolved(true);
      }
      traceStateSet('AuthProvider', 'isLoading', false);
      setIsLoading(false);
      setIsSessionResolved(true);
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
        setIsSessionResolved(true);
      });
    };

    initAuth().catch(e => {
      console.error('[AuthProvider] initAuth failed:', e);
      setIsLoading(false);
      setIsSessionResolved(true);
    });

    return () => {
      clearTimeout(authTimeout);
      subscription?.unsubscribe();
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = async (
    email: string,
    password: string,
  ): Promise<{ error: Error | null; kind?: 'transport' | 'credentials' }> => {
    const supabase = await getSupabase();

    const attempt = async () => {
      try {
        const { error } = await withTimeout(
          supabase.auth.signInWithPassword({ email, password }),
          AUTH_REQUEST_TIMEOUT_MS,
        );
        if (error) {
          return {
            error: error as unknown as Error,
            kind: (isTransportError(error) ? 'transport' : 'credentials') as 'transport' | 'credentials',
          };
        }
        return { error: null as Error | null };
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        return {
          error: err,
          kind: (isTransportError(err) ? 'transport' : 'credentials') as 'transport' | 'credentials',
        };
      }
    };

    let result = await attempt();
    // Exactly one bounded retry, and only when the request never reached auth.
    if (result.error && result.kind === 'transport') {
      console.warn('[auth] signin_transport_failure', {
        name: result.error.name, attempt: 1, willRetry: true,
      });
      await new Promise(r => setTimeout(r, 800));
      result = await attempt();
      if (result.error && result.kind === 'transport') {
        console.warn('[auth] signin_transport_failure', {
          name: result.error.name, attempt: 2, willRetry: false,
        });
      }
    }
    return result;
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
    currentUserRef.current = null;
    setIsAdmin(false);
    setAdminStatus(false);
    setIsAdminResolved(true);
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, isAdmin, adminStatus, retryAdminCheck, isAdminResolved, isSessionResolved, signIn, signUp, signOut, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

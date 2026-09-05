import type { User } from '@supabase/supabase-js';
// ⚡ Dynamic import — keeps supabase SDK out of the critical path
const getSupabase = () => import('@/integrations/supabase/client').then(m => m.supabase);
import { isAdminEmail } from './admin';
import { isTransportError, withTimeout, AUTH_REQUEST_TIMEOUT_MS } from './transportError';

/**
 * Tri-state admin resolution:
 *  - true      → confirmed admin
 *  - false     → confirmed NOT admin (deny)
 *  - 'unknown' → backend/transport failure, the question was never answered
 *
 * 'unknown' must never be treated as a denial by callers.
 */
export type AdminResolution = true | false | 'unknown';

export async function resolveIsAdminTriState(user: User | null): Promise<AdminResolution> {
  if (!user) return false;

  try {
    const supabase = await getSupabase();
    const { data, error } = await withTimeout(
      supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle()
        .then(r => r),
      AUTH_REQUEST_TIMEOUT_MS,
    );

    if (error) {
      // PostgREST reached us and answered with an error → treat transport-class
      // codes as unknown, everything else as a real (non-admin) answer.
      if (isTransportError(error) || !error.code) {
        console.warn('[isAdmin] role check unavailable', { code: error.code ?? null });
        return 'unknown';
      }
      console.warn('[isAdmin] role check errored', { code: error.code });
      return 'unknown';
    }

    if (data) return true;
  } catch (e) {
    if (isTransportError(e)) {
      console.warn('[isAdmin] role check transport failure', {
        name: (e as Error)?.name ?? 'Error',
      });
      return 'unknown';
    }
    console.warn('[isAdmin] role check threw', { name: (e as Error)?.name ?? 'Error' });
    return 'unknown';
  }

  // Confirmed answer from the server: no admin row. Email fallback preserves the
  // existing allowed-admin semantics (allowlist is empty by default).
  if (isAdminEmail(user.email)) return true;
  return false;
}

/**
 * Back-compat boolean wrapper. 'unknown' collapses to false — only use where a
 * definite boolean is required and denial-on-unknown is acceptable.
 */
export async function resolveIsAdmin(user: User | null): Promise<boolean> {
  return (await resolveIsAdminTriState(user)) === true;
}

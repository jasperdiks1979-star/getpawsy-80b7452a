import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { isAdminEmail } from './admin';

/**
 * Async admin resolution — checks DB first, then email fallback.
 * Used by AuthContext during auth state changes.
 */
export async function resolveIsAdmin(user: User | null): Promise<boolean> {
  if (!user) return false;

  // 1. DB role check (primary)
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!error && data) {
      console.log('[isAdmin] ✅ Admin via DB role');
      return true;
    }
    if (error) {
      console.error('[isAdmin] DB role check failed:', error.message);
    }
  } catch (e) {
    console.error('[isAdmin] DB role check threw:', e);
  }

  // 2. Email fallback (prevents lockout)
  if (isAdminEmail(user.email)) {
    console.log('[isAdmin] ✅ Admin via email fallback');
    return true;
  }

  return false;
}

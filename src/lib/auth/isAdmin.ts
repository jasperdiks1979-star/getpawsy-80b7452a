import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hard-coded fallback admin emails — prevents lockout if DB role check fails.
 * Case-insensitive matching. This is a LAST RESORT; DB roles are the primary source.
 */
const FALLBACK_ADMIN_EMAILS: string[] = [
  'jasperdiks@hotmail.com',
];

/**
 * Check if a user has the admin role in the database.
 * Returns true if user_roles table contains an 'admin' row for the given userId.
 */
async function checkAdminRoleInDb(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (error) {
      console.error('[isAdmin] DB role check failed:', error.message);
      return false;
    }
    return !!data;
  } catch (e) {
    console.error('[isAdmin] DB role check threw:', e);
    return false;
  }
}

/**
 * Check if user email matches the hardcoded fallback allowlist.
 */
function isEmailInFallbackList(email: string | undefined): boolean {
  if (!email) return false;
  return FALLBACK_ADMIN_EMAILS.some(
    (allowed) => allowed.toLowerCase() === email.toLowerCase()
  );
}

/**
 * Single source of truth for admin detection.
 *
 * 1. Check DB role (primary) — fast, authoritative
 * 2. If DB check fails/returns false, check email fallback — prevents lockout
 *
 * Always resolves (never throws).
 */
export async function resolveIsAdmin(user: User | null): Promise<boolean> {
  if (!user) return false;

  // Primary: DB role
  const dbAdmin = await checkAdminRoleInDb(user.id);
  if (dbAdmin) {
    console.log('[isAdmin] ✅ Admin via DB role');
    return true;
  }

  // Fallback: email allowlist
  if (isEmailInFallbackList(user.email)) {
    console.log('[isAdmin] ✅ Admin via email fallback');
    return true;
  }

  return false;
}

/**
 * Synchronous check — use only when you already have the isAdmin boolean from context.
 * For initial evaluation, always use resolveIsAdmin().
 */
export function isAdminEmail(email: string | undefined): boolean {
  return isEmailInFallbackList(email);
}

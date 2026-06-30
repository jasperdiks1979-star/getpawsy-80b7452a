/**
 * src/lib/auth/admin.ts
 * 
 * SINGLE SOURCE OF TRUTH for admin detection.
 * No other file may contain admin-check logic.
 */

// SECURITY: No hardcoded admin emails in the client bundle.
// Admin status is resolved server-side via the `user_roles` table
// and the `has_role()` security-definer function. See resolveIsAdmin().
const HARD_FALLBACK_EMAILS: string[] = [];

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getAdminAllowlist(): string[] {
  const envRaw = typeof import.meta !== 'undefined'
    ? (import.meta as any).env?.VITE_ADMIN_EMAILS
    : undefined;

  const envEmails: string[] = envRaw
    ? String(envRaw).split(',').map(e => normalizeEmail(e)).filter(Boolean)
    : [];

  const combined = [...envEmails, ...HARD_FALLBACK_EMAILS.map(normalizeEmail)];
  return [...new Set(combined)];
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  return getAdminAllowlist().includes(normalized);
}

export function isAdminUser(
  user?: { email?: string | null; role?: string | null } | null
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return isAdminEmail(user.email);
}

export type AdminRequireResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_LOGGED_IN' | 'NOT_ADMIN' };

export function requireAdmin(
  user?: { email?: string | null; role?: string | null } | null
): AdminRequireResult {
  if (!user) return { ok: false, reason: 'NOT_LOGGED_IN' };
  if (!isAdminUser(user)) return { ok: false, reason: 'NOT_ADMIN' };
  return { ok: true };
}

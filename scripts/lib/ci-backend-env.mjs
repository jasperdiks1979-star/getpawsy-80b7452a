/**
 * Reads SUPABASE_URL / SUPABASE_ANON_KEY for CI smoke scripts.
 * No hardcoded fallbacks: missing or malformed config fails loudly.
 * Never prints key material; only the URL host is ever logged.
 */
export function readCiBackendEnv(env = process.env) {
  const rawUrl = (env.SUPABASE_URL || '').trim();
  const key = (env.SUPABASE_ANON_KEY || '').trim();
  const problems = [];
  let url = null;
  if (!rawUrl) problems.push('SUPABASE_URL is missing');
  else {
    try {
      const u = new URL(rawUrl);
      if (u.protocol !== 'https:') problems.push(`SUPABASE_URL must use https (host: ${u.host || 'none'})`);
      else url = `${u.protocol}//${u.host}`;
    } catch {
      problems.push('SUPABASE_URL is not a valid URL');
    }
  }
  if (!key) problems.push('SUPABASE_ANON_KEY is missing');
  return { url, key, host: url ? new URL(url).host : null, problems };
}

export function requireCiBackendEnv(env = process.env) {
  const cfg = readCiBackendEnv(env);
  if (cfg.problems.length) {
    console.error(`CI CONFIG ERROR: ${cfg.problems.join('; ')}. Set the repository Actions secrets.`);
    process.exit(2);
  }
  return cfg;
}

/** Describe a fetch error without leaking request headers. */
export function describeFetchError(e) {
  const cause = e && e.cause ? ` (${e.cause.code || e.cause.message || 'unknown cause'})` : '';
  return `${e && e.message ? e.message : String(e)}${cause}`;
}

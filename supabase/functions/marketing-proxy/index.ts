import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type Provider = 'pinterest' | 'google' | 'meta';

// Allowlist of Pinterest API paths admins may proxy. Keep tight.
const PINTEREST_ACTION_ALLOWLIST: RegExp[] = [
  /^user_account$/,
  /^boards(\?.*)?$/,
  /^boards\/[A-Za-z0-9_-]+(\?.*)?$/,
  /^boards\/[A-Za-z0-9_-]+\/pins(\?.*)?$/,
  /^pins(\?.*)?$/,
  /^pins\/[A-Za-z0-9_-]+(\?.*)?$/,
  /^pins\/[A-Za-z0-9_-]+\/analytics(\?.*)?$/,
  /^user_account\/analytics(\?.*)?$/,
  /^ad_accounts(\?.*)?$/,
];

function isAllowedPinterestAction(action: string): boolean {
  return PINTEREST_ACTION_ALLOWLIST.some((re) => re.test(action));
}

interface ProxyResult {
  ok: boolean;
  data?: unknown;
  reason?: string;
  details?: string;
}

// Provider handlers — map upstream errors to safe results
async function handlePinterest(action: string, payload: unknown, headers: Record<string, string>): Promise<ProxyResult> {
  const token = Deno.env.get('PINTEREST_ACCESS_TOKEN');
  if (!token) return { ok: false, reason: 'NOT_CONFIGURED' };

  try {
    const res = await fetch(`https://api.pinterest.com/v5/${action}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
    });

    if (res.status === 401) return { ok: false, reason: 'TOKEN_EXPIRED' };
    if (res.status === 429) return { ok: false, reason: 'RATE_LIMIT' };
    if (res.status >= 500) return { ok: false, reason: 'UPSTREAM_DOWN' };

    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    console.error('[marketing-proxy:pinterest]', err);
    return { ok: false, reason: 'UPSTREAM_DOWN', details: String(err) };
  }
}

async function handleGoogle(_action: string, _payload: unknown): Promise<ProxyResult> {
  // Google uses client-side gtag — server proxy reserved for future API calls
  return { ok: true, data: { message: 'Google tracking is client-side' } };
}

async function handleMeta(_action: string, _payload: unknown): Promise<ProxyResult> {
  // Meta/Facebook — reserved for Conversions API
  return { ok: false, reason: 'NOT_CONFIGURED' };
}

const PROVIDERS: Record<Provider, (action: string, payload: unknown, headers: Record<string, string>) => Promise<ProxyResult>> = {
  pinterest: handlePinterest,
  google: handleGoogle,
  meta: handleMeta,
};

async function logEvent(provider: string, eventType: string, severity: string, message: string, context: unknown) {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    await supabase.from('marketing_events').insert({
      provider, event_type: eventType, severity, message, context: context || {},
    });
  } catch (err) {
    console.error('[marketing-proxy] Failed to log event:', err);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ---- AuthN/AuthZ: admins only ----
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';
    if (!jwt) {
      return new Response(
        JSON.stringify({ ok: false, reason: 'UNAUTHORIZED' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } },
    );
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(
        JSON.stringify({ ok: false, reason: 'UNAUTHORIZED' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (!roleRow) {
      return new Response(
        JSON.stringify({ ok: false, reason: 'FORBIDDEN' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const { provider, action, payload } = body as { provider?: Provider; action?: string; payload?: unknown };

    if (!provider || !PROVIDERS[provider]) {
      return new Response(
        JSON.stringify({ ok: false, reason: 'INVALID_PROVIDER' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (provider === 'pinterest' && !isAllowedPinterestAction(action || '')) {
      return new Response(
        JSON.stringify({ ok: false, reason: 'ACTION_NOT_ALLOWED' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const result = await PROVIDERS[provider](action || '', payload, {});

    // Log failures for observability
    if (!result.ok) {
      console.error(`[marketing-proxy] ${provider}/${action} failed:`, result.reason);
      await logEvent(provider, action || 'unknown', 'error', result.reason || 'unknown', { payload, details: result.details });
    }

    // ALWAYS return 200 — marketing is optional
    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[marketing-proxy] Fatal:', err);
    return new Response(
      JSON.stringify({ ok: false, reason: 'INTERNAL_ERROR' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

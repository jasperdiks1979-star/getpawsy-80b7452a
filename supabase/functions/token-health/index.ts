import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ProviderHealth {
  ok: boolean;
  reason?: string;
  checkedAt: string;
}

async function checkPinterest(): Promise<ProviderHealth> {
  const token = Deno.env.get('PINTEREST_ACCESS_TOKEN');
  if (!token) return { ok: false, reason: 'NOT_CONFIGURED', checkedAt: new Date().toISOString() };

  try {
    const res = await fetch('https://api.pinterest.com/v5/user_account', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const body = await res.text();

    if (res.status === 401) return { ok: false, reason: 'TOKEN_EXPIRED', checkedAt: new Date().toISOString() };
    if (res.status === 429) return { ok: false, reason: 'RATE_LIMITED', checkedAt: new Date().toISOString() };
    if (!res.ok) return { ok: false, reason: `HTTP_${res.status}`, checkedAt: new Date().toISOString() };

    return { ok: true, checkedAt: new Date().toISOString() };
  } catch (err) {
    return { ok: false, reason: 'UNREACHABLE', checkedAt: new Date().toISOString() };
  }
}

async function checkGoogle(): Promise<ProviderHealth> {
  // Google uses client-side gtag — token health is N/A unless using server APIs
  const saJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!saJson) return { ok: false, reason: 'NOT_CONFIGURED', checkedAt: new Date().toISOString() };
  return { ok: true, checkedAt: new Date().toISOString() };
}

async function checkMeta(): Promise<ProviderHealth> {
  return { ok: false, reason: 'NOT_CONFIGURED', checkedAt: new Date().toISOString() };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const [pinterest, google, meta] = await Promise.all([
      checkPinterest(),
      checkGoogle(),
      checkMeta(),
    ]);

    const result = { pinterest, google, meta };

    // Log degraded providers
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    for (const [provider, health] of Object.entries(result)) {
      if (!health.ok) {
        await supabase.from('marketing_events').insert({
          provider,
          event_type: 'health_check',
          severity: 'warn',
          message: health.reason || 'unhealthy',
          context: { checkedAt: health.checkedAt },
        });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, providers: result }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[token-health] Error:', err);
    return new Response(
      JSON.stringify({ ok: false, reason: 'INTERNAL_ERROR' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  const { data: conn } = await supabase
    .from('pinterest_connection')
    .select('access_token')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const token = conn?.access_token ?? Deno.env.get('PINTEREST_ACCESS_TOKEN');
  const pins = ['1117103882602521593', '1117103882602521618'];
  const results: any[] = [];
  for (const p of pins) {
    const r = await fetch(`https://api.pinterest.com/v5/pins/${p}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const body = await r.text();
    let parsed: any = null;
    try { parsed = JSON.parse(body); } catch {}
    results.push({ pin_id: p, http_status: r.status, body: parsed ?? body });
  }
  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ADMIN_TOKEN = Deno.env.get('WAVE1_ADMIN_TOKEN') ?? '';

function svc() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const adminHeader = req.headers.get('x-admin-token') ?? '';
    if (!ADMIN_TOKEN || adminHeader !== ADMIN_TOKEN) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type':'application/json' } });
    }
    const body = await req.json().catch(() => ({}));
    const action = body.action as string;
    const sb = svc();

    if (action === 'set_gates') {
      const stop = String(body.global_stop);
      const enabled = String(body.pcie2_enabled);
      await sb.from('app_config').update({ value: stop }).eq('key', 'pinterest_publishing_global_stop');
      await sb.from('app_config').update({ value: enabled }).eq('key', 'pcie2_publish_enabled');
      const { data } = await sb.from('app_config').select('key,value').in('key', ['pinterest_publishing_global_stop','pcie2_publish_enabled']);
      return new Response(JSON.stringify({ ok:true, gates: data }), { headers: { ...corsHeaders, 'Content-Type':'application/json' } });
    }

    if (action === 'list_queued') {
      const { data, error } = await sb.from('pinterest_pin_queue')
        .select('id,product_id,board_id,pin_title,pin_description,pin_image_url,destination_link,scheduled_at,created_at')
        .eq('status','queued')
        .order('scheduled_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return new Response(JSON.stringify({ ok:true, rows: data }), { headers: { ...corsHeaders, 'Content-Type':'application/json' } });
    }

    if (action === 'skip_duplicate') {
      const { id, reason } = body;
      await sb.from('pinterest_pin_queue').update({ status:'skipped', rejection_reason: reason || 'duplicate_in_wave1' , updated_at: new Date().toISOString() }).eq('id', id);
      return new Response(JSON.stringify({ ok:true }), { headers: { ...corsHeaders, 'Content-Type':'application/json' } });
    }

    if (action === 'publish_one') {
      const { id } = body;
      // claim
      const { data: claimed, error: claimErr } = await sb.from('pinterest_pin_queue')
        .update({ status:'publishing', updated_at: new Date().toISOString() })
        .eq('id', id).eq('status','queued').select('*').maybeSingle();
      if (claimErr) throw claimErr;
      if (!claimed) return new Response(JSON.stringify({ ok:false, error:'not_queued' }), { status:409, headers:{...corsHeaders,'Content-Type':'application/json'} });

      const { data: conn } = await sb.from('pinterest_connection').select('access_token').order('updated_at',{ascending:false,nullsFirst:false}).limit(1).maybeSingle();
      const token = conn?.access_token;
      if (!token) throw new Error('no_token');

      const payload = {
        board_id: claimed.board_id,
        title: String(claimed.pin_title || '').slice(0,100),
        description: String(claimed.pin_description || '').slice(0,500),
        link: claimed.destination_link,
        media_source: { source_type:'image_url', url: claimed.pin_image_url },
      };
      const t0 = Date.now();
      const resp = await fetch('https://api.pinterest.com/v5/pins', {
        method:'POST',
        headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
        body: JSON.stringify(payload),
      });
      const latency_ms = Date.now() - t0;
      const text = await resp.text();
      let data: any = null; try { data = JSON.parse(text); } catch {}

      if (resp.status === 200 || resp.status === 201) {
        const pin_id = data?.id;
        const ext_url = pin_id ? `https://www.pinterest.com/pin/${pin_id}/` : null;
        await sb.from('pinterest_pin_queue').update({
          status:'posted', pinterest_pin_id: pin_id, external_url: ext_url,
          http_status: resp.status, posted_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq('id', id);
        await sb.from('pinterest_post_logs').insert({ action:'wave1_publish', status:'success', details:{ queue_id:id, pin_id, latency_ms, board_returned: data?.board_id }});
        // dup check
        const { count: dupCount } = await sb.from('pinterest_pin_queue').select('id',{count:'exact',head:true}).eq('pinterest_pin_id', pin_id);
        return new Response(JSON.stringify({ ok:true, pin_id, status:resp.status, latency_ms, board_match: data?.board_id === claimed.board_id, dup_rows: dupCount, response: data }), { headers:{...corsHeaders,'Content-Type':'application/json'} });
      } else {
        await sb.from('pinterest_pin_queue').update({
          status:'failed', http_status: resp.status,
          rejection_reason:'wave1_publish_failed', last_error: text.slice(0,500),
          updated_at: new Date().toISOString(),
        }).eq('id', id);
        await sb.from('pinterest_post_logs').insert({ action:'wave1_publish', status:'failed', details:{ queue_id:id, status:resp.status, error:text.slice(0,500), latency_ms }});
        return new Response(JSON.stringify({ ok:false, status:resp.status, latency_ms, error:text.slice(0,500) }), { status:200, headers:{...corsHeaders,'Content-Type':'application/json'} });
      }
    }

    if (action === 'remaining') {
      const { count } = await sb.from('pinterest_pin_queue').select('id',{count:'exact',head:true}).eq('status','queued');
      return new Response(JSON.stringify({ ok:true, remaining: count }), { headers:{...corsHeaders,'Content-Type':'application/json'} });
    }

    return new Response(JSON.stringify({ error:'unknown_action' }), { status:400, headers:{...corsHeaders,'Content-Type':'application/json'} });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message) }), { status:500, headers:{...corsHeaders,'Content-Type':'application/json'} });
  }
});
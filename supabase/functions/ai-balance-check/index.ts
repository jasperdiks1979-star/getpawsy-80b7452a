import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) {
    return new Response(
      JSON.stringify({ ok: false, state: 'no_key', message: 'LOVABLE_API_KEY missing' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  }

  try {
    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [{ role: 'user', content: 'ok' }],
        max_tokens: 1,
      }),
    });
    const text = await r.text();
    let state: 'ok' | 'low' | 'rate_limited' | 'error' = 'ok';
    if (r.status === 402) state = 'low';
    else if (r.status === 429) state = 'rate_limited';
    else if (!r.ok) state = 'error';
    return new Response(
      JSON.stringify({
        ok: r.ok,
        state,
        status: r.status,
        message: r.ok ? 'AI gateway reachable, credits available' : text.slice(0, 240),
        checkedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, state: 'error', message: String(e) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  }
});
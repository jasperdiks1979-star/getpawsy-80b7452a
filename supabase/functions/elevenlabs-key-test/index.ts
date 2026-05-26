import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const started = new Date().toISOString();
  const rawKey = Deno.env.get('ELEVENLABS_API_KEY') ?? '';
  const key = rawKey.trim().replace(/^["']|["']$/g, '');

  const meta = {
    present: !!rawKey,
    length: key.length,
    prefix: key.slice(0, 4),
    suffix: key.slice(-4),
    hadWhitespace: rawKey !== rawKey.trim(),
    hadQuotes: /^["']|["']$/.test(rawKey.trim()),
  };

  if (!key) {
    return new Response(
      JSON.stringify({ ok: false, status: 'missing_key', message: 'ELEVENLABS_API_KEY is not set in runtime env', meta, timestamp: started }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const res = await fetch('https://api.elevenlabs.io/v1/user', {
      method: 'GET',
      headers: { 'xi-api-key': key, 'Accept': 'application/json' },
    });
    const bodyText = await res.text();
    let body: unknown = bodyText;
    try { body = JSON.parse(bodyText); } catch { /* keep text */ }

    const ok = res.ok;
    return new Response(
      JSON.stringify({
        ok,
        status: ok ? 'valid' : `invalid_${res.status}`,
        message: ok ? 'ElevenLabs key accepted by /v1/user' : `ElevenLabs rejected key (HTTP ${res.status})`,
        meta,
        httpStatus: res.status,
        elevenlabs: body,
        timestamp: started,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, status: 'network_error', message: (e as Error).message, meta, timestamp: started }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
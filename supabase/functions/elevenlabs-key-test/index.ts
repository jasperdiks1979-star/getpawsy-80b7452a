import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DEFAULT_VOICE = 'cgSgspJ2msm6clMCkdW9';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) throw new Error('unauthorized');
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) throw new Error('unauthorized');
  const { data: isAdmin } = await admin.rpc('has_role', { _user_id: userRes.user.id, _role: 'admin' });
  if (!isAdmin) throw new Error('admin required');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const started = new Date().toISOString();
  try {
    await requireAdmin(req);
  } catch (e) {
    const message = (e as Error).message;
    return json({ ok: false, status: message === 'admin required' ? 'forbidden' : 'unauthorized', message, timestamp: started }, message === 'admin required' ? 403 : 401);
  }

  const rawKey = Deno.env.get('ELEVENLABS_API_KEY') ?? '';
  const key = rawKey.trim().replace(/^["']|["']$/g, '');

  const meta = {
    envVar: 'ELEVENLABS_API_KEY',
    usedBy: ['cinematic-v3-start', 'cinematic-v3-retry-voiceover'],
    connectorName: 'jasperdiks@hotmail.com',
    present: !!rawKey,
    length: key.length,
    masked: key ? `${'*'.repeat(Math.max(0, key.length - 6))}${key.slice(-6)}` : '',
    suffix6: key.slice(-6),
    hadWhitespace: rawKey !== rawKey.trim(),
    hadQuotes: /^["']|["']$/.test(rawKey.trim()),
  };

  if (!key) {
    return json({ ok: false, status: 'missing_key', message: 'ELEVENLABS_API_KEY is not set in runtime env', meta, timestamp: started });
  }

  try {
    const userRes = await fetch('https://api.elevenlabs.io/v1/user', {
      method: 'GET',
      headers: { 'xi-api-key': key, 'Accept': 'application/json' },
    });
    const userText = await userRes.text();
    let userBody: any = {};
    try { userBody = JSON.parse(userText); } catch { userBody = {}; }

    const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${DEFAULT_VOICE}?output_format=mp3_22050_32`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      body: JSON.stringify({
        text: 'Getpawsy voiceover test.',
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true, speed: 1.0 },
      }),
    });
    const ttsBytes = ttsRes.ok ? (await ttsRes.arrayBuffer()).byteLength : 0;
    const ttsError = ttsRes.ok ? null : (await ttsRes.text()).slice(0, 240);

    const ok = userRes.ok && ttsRes.ok && ttsBytes > 0;
    return json({
        ok,
        status: ok ? 'tts_verified' : `failed_user_${userRes.status}_tts_${ttsRes.status}`,
        message: ok ? 'ElevenLabs key accepted and text_to_speech synthesis succeeded' : 'ElevenLabs credential or text_to_speech permission check failed',
        meta,
        userCheck: {
          ok: userRes.ok,
          httpStatus: userRes.status,
          subscriptionTier: userBody?.subscription?.tier ?? null,
          characterLimit: userBody?.subscription?.character_limit ?? null,
          characterCount: userBody?.subscription?.character_count ?? null,
        },
        textToSpeech: {
          ok: ttsRes.ok,
          httpStatus: ttsRes.status,
          bytes: ttsBytes,
          voiceId: DEFAULT_VOICE,
          permissionAvailable: ttsRes.ok && ttsBytes > 0,
          error: ttsError,
        },
        timestamp: started,
      });
  } catch (e) {
    return json({ ok: false, status: 'network_error', message: (e as Error).message, meta, timestamp: started });
  }
});
/**
 * ai-content-generator — additive AI copy generator for marketing.
 *
 * Generates short-form marketing copy (TikTok hooks, Pinterest captions,
 * SEO FAQ blocks, comparison sections, email ideas, urgency copy, trust
 * badges, before/after framing, UGC scripts) and stores them as DRAFTS
 * only. Nothing auto-publishes.
 *
 * Auth: requires a valid Supabase JWT belonging to an admin user.
 */
import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

const KIND_PROMPTS: Record<string, string> = {
  tiktok_hook: 'Generate 5 high-retention TikTok video hooks (first 2 seconds). Punchy, native, no hashtags. Plain numbered list.',
  pinterest_caption: 'Generate 5 Pinterest pin captions optimized for US pet parents. 80-120 chars each, descriptive keywords first, soft CTA, no hashtags. Numbered list.',
  seo_faq: 'Generate 6 FAQ Q&A pairs (Question + 2-3 sentence Answer) optimized for Google Featured Snippets. No fluff, no marketing speak.',
  comparison: 'Generate a short comparison section (markdown table, 3 rows) contrasting this product vs typical alternatives on the 3 things buyers actually care about.',
  email: 'Generate 3 short email campaign ideas: subject line, preview text, and a 60-word body. Friendly US tone.',
  urgency: 'Generate 5 ethical urgency lines (no fake scarcity). Real triggers like stock, shipping cutoff, or seasonal use. One sentence each.',
  trust_badge: 'Generate 5 trust-badge micro-copy lines a US pet parent would actually believe. Under 6 words each.',
  before_after: 'Generate a 4-line before/after framing for this product. Lines: "Before:", "Without it:", "After:", "Why it works:".',
  ugc_script: 'Generate a 30-second UGC video script (8-12 lines). Native US tone, real-pet scenario, soft pitch at the end.',
};

async function callLovableAi(prompt: string, system: string): Promise<string | null> {
  if (!LOVABLE_API_KEY) return null;
  const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (r.status === 429) throw new Error('rate_limited');
  if (r.status === 402) throw new Error('credits_exhausted');
  if (!r.ok) throw new Error('ai_error_' + r.status);
  const j = await r.json();
  return j?.choices?.[0]?.message?.content ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ ok: false, traceId, message: 'missing auth' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ ok: false, traceId, message: 'unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: roleRow } = await admin
      .from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ ok: false, traceId, message: 'forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const kind = String(body.kind || '');
    const productId = body.product_id ? String(body.product_id) : null;
    const extra = body.context ? String(body.context).slice(0, 2000) : '';
    if (!KIND_PROMPTS[kind]) {
      return new Response(JSON.stringify({ ok: false, traceId, message: 'unknown kind' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let productName: string | null = null;
    let productCtx = '';
    if (productId) {
      const { data: p } = await admin
        .from('products_public')
        .select('name,description,category,price')
        .eq('id', productId).maybeSingle();
      if (p) {
        productName = p.name;
        productCtx = `Product: ${p.name}\nCategory: ${p.category}\nPrice: $${p.price}\nDescription: ${(p.description || '').slice(0, 600)}`;
      }
    }

    const system = `You are a senior US-native ecommerce copywriter for GetPawsy (premium pet brand).
Strict rules: never use vet-approved, eco-friendly, dropshipping wording, fake reviews, fake scarcity, price anchors, or medical claims.
Tone: warm, confident, US-native, conversion-focused.
Output: ONLY the requested content, no preamble.`;

    const userPrompt = `${KIND_PROMPTS[kind]}\n\n${productCtx}\n${extra ? '\nExtra context: ' + extra : ''}`.trim();

    const output = await callLovableAi(userPrompt, system);
    if (!output) {
      return new Response(JSON.stringify({ ok: false, traceId, message: 'no_output' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: draft, error: insErr } = await admin.from('ai_content_drafts').insert({
      kind,
      product_id: productId,
      product_name: productName,
      prompt: userPrompt,
      output,
      model: 'google/gemini-3-flash-preview',
      created_by: userId,
    }).select('id,kind,output,created_at').single();
    if (insErr) throw insErr;

    return new Response(JSON.stringify({ ok: true, traceId, draft }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = String(e?.message || e);
    const status = msg === 'rate_limited' ? 429 : msg === 'credits_exhausted' ? 402 : 500;
    return new Response(JSON.stringify({ ok: false, traceId, message: msg }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
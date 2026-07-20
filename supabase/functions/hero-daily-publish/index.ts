// Hero Daily Publish — orchestrates 6 PAIP v1 + 6 PQIF v4 hero pins per day.
//
// Rate-limited by design:
//   * Idempotent per UTC day via app_config['hero_daily_publish_state']
//   * Cron secret (HERO_PUBLISH_CRON_SECRET) required in `x-cron-secret`
//   * 60s cooldown between the PAIP and PQIF sub-calls
//   * Both sub-calls capped at limit=6 so the pipeline never exceeds the
//     6+6 daily budget, even if invoked repeatedly.
//
// Runs entirely through the existing PCIE2 pipeline — no new publishers.

import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET_ENV = Deno.env.get('HERO_PUBLISH_CRON_SECRET') ?? '';

const HERO_PRODUCT_ID = '128e0207-8a94-4d71-b428-5b7f5002528f';
const DAILY_BUDGET = 6;
const STATE_KEY = 'hero_daily_publish_state';

type StepResult = { name: string; status: number; body: unknown };

async function invokeFn(name: string, body: Record<string, unknown>): Promise<StepResult> {
  const url = `${SUPABASE_URL}/functions/v1/${name}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
    },
    body: JSON.stringify(body),
  });
  let parsed: unknown = null;
  try { parsed = await res.json(); } catch { parsed = await res.text().catch(() => null); }
  return { name, status: res.status, body: parsed };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Cron secret gate — accepts either the env-managed secret (for manual
  // invocation from an operator machine) or the app_config-managed secret
  // (used by pg_cron so the value never leaves the database).
  const provided = req.headers.get('x-cron-secret') ?? '';
  const { data: cfgSecret } = await sb.from('app_config')
    .select('value').eq('key', 'hero_publish_cron_secret').maybeSingle();
  const dbSecret = typeof cfgSecret?.value === 'string' ? cfgSecret.value : '';
  const ok = !!provided && (provided === CRON_SECRET_ENV || provided === dbSecret);
  if (!ok) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const today = new Date().toISOString().slice(0, 10); // UTC yyyy-mm-dd

  // Load prior state to enforce per-day idempotency.
  const { data: cfg } = await sb.from('app_config').select('value').eq('key', STATE_KEY).maybeSingle();
  const state = (cfg?.value as Record<string, unknown> | null) ?? {};
  if (state.date === today && state.completed === true) {
    return new Response(JSON.stringify({ ok: true, skipped: 'already_ran_today', state }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const started_at = new Date().toISOString();
  const steps: StepResult[] = [];

  // 1) PAIP v1 — assemble up to 6 hero drafts into the publish queue.
  steps.push(await invokeFn('pcie2-publish-assembler', {
    product_id: HERO_PRODUCT_ID,
    audience: 'us_buyers',
    target: DAILY_BUDGET,
    limit: DAILY_BUDGET * 4, // scan window; assembler self-caps at target
    verify_images: true,
    // Explicit UTM campaign for every generated pin destination.
    campaign: 'hero_daily',
  }));

  // 60s spacer so we never burst the underlying Pinterest API.
  await new Promise((r) => setTimeout(r, 60_000));

  // 2) PQIF v4 — reinstate up to 6 previously-rejected hero drafts that
  //    now pass the Pinterest Quality Firewall v2.
  steps.push(await invokeFn('pqif-v4-reinstate-hero', {
    productId: HERO_PRODUCT_ID,
    dryRun: false,
    limit: DAILY_BUDGET,
    rewriteDestination: true,
    campaign: 'hero_daily',
  }));

  const finished_at = new Date().toISOString();
  const next_state = {
    date: today,
    completed: true,
    started_at,
    finished_at,
    steps: steps.map((s) => ({ name: s.name, status: s.status })),
  };
  await sb.from('app_config').upsert({ key: STATE_KEY, value: next_state });

  return new Response(JSON.stringify({ ok: true, state: next_state, steps }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
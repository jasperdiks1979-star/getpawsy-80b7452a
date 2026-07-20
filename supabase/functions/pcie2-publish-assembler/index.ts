import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const SITE = 'https://getpawsy.pet';
const CI_VERSION = 'ci-v1.1-zero-bypass';
const CI_MIN_SCORE = 75;
const BANNED = [
  'eco-friendly','vet-approved','vet approved','life-changing','life changing',
  'stop scooping','game-changer','game changer','must-have','must have',
  'you won\u2019t believe','you wont believe','shocking','miracle','revolutionary',
];
const ALLOWED_BOARDS = new Set([
  '1117103951261719234','1117103951261719235','1117103951261719219',
  '1117103951261719230','1117103951261719222','1117103951261719228',
  '1117103951261719231','1117103951261719232','1117103951261719227',
  '1117103951261719226',
]);

function mapBoard(slug: string, category: string | null, species: string | null): { board_id: string; reason: string } {
  const s = (slug || '').toLowerCase();
  const c = (category || '').toLowerCase();
  const sp = (species || '').toLowerCase();
  if (s.includes('litter') || c.includes('litter')) return { board_id: '1117103951261719235', reason: 'litter_match' };
  if (s.includes('cat-tree') || s.includes('cat-climb') || c.includes('cat trees')) return { board_id: '1117103951261719219', reason: 'cat_tree_match' };
  if (s.includes('dog-travel') || s.includes('dog-car') || s.includes('car-seat-dog')) return { board_id: '1117103951261719226', reason: 'dog_travel_match' };
  if (s.includes('dog-leash') || s.includes('dog-harness') || s.includes('dog-walk') || c.includes('collars & leashes')) return { board_id: '1117103951261719227', reason: 'dog_walk_match' };
  if (c.includes('bed')) return { board_id: '1117103951261719231', reason: 'bed_match' };
  if (s.includes('cat-furniture') || s.includes('enclosure') || c.includes('cat furniture') || c.includes('cat houses')) return { board_id: '1117103951261719222', reason: 'cat_furniture_match' };
  if (s.includes('smart') || s.includes('auto') || s.includes('gadget') || s.includes('app-control')) return { board_id: '1117103951261719234', reason: 'smart_gadget_match' };
  if (sp === 'cat' || c.toLowerCase().startsWith('cat ')) return { board_id: '1117103951261719230', reason: 'cat_fallback' };
  return { board_id: '1117103951261719232', reason: 'default_pet_parent_hacks' };
}

async function fingerprint(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkImage(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok || res.status === 405;
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit ?? 100), 1), 200);
  const targetQueued = Math.min(Math.max(Number(body.target ?? 100), 1), 200);
  const verifyImages = body.verify_images !== false;
  // Optional hero/product targeting. When set, only drafts for this
  // product_id are considered and UTMs are tagged for US-buyer attribution.
  const productFilter: string | null = typeof body.product_id === 'string' && body.product_id.length > 0
    ? body.product_id
    : null;
  const audienceTag: string = typeof body.audience === 'string' && body.audience.length > 0
    ? String(body.audience)
    : (productFilter ? 'us_buyers' : '');

  const { data: run } = await sb.from('pcie2_assembly_runs').insert({ status: 'running' }).select().single();
  const runId = run!.id;

  const counts: Record<string, number> = {};
  const bump = (k: string) => { counts[k] = (counts[k] || 0) + 1; };
  let scanned = 0, passed = 0, repaired = 0, rejected = 0, skipped = 0, queued = 0;
  const results: any[] = [];

  // Fetch existing publish_queue keys to skip already-queued combos
  const { data: existing } = await sb.from('pcie2_publish_queue')
    .select('product_id,board_id,image_url')
    .in('status', ['ready','queued','pending','publishing']);
  const existingKeys = new Set((existing || []).map(r => `${r.product_id}|${r.board_id}|${r.image_url}`));

  const draftsQuery = sb.from('pcie2_creatives')
    .select('id,product_id,headline,hook,body_text,cta,image_url,board_id,quality_score')
    .eq('status', 'draft')
    .not('headline', 'is', null);
  if (productFilter) draftsQuery.eq('product_id', productFilter);
  const { data: drafts } = await draftsQuery.limit(limit);

  for (const d of drafts || []) {
    scanned++;
    if (queued >= targetQueued) { skipped++; bump('target_reached'); results.push({ run_id: runId, creative_id: d.id, product_id: d.product_id, verdict: 'SKIPPED', reason: 'target_reached' }); continue; }

    const { data: p, error: perr } = await sb.from('products')
      .select('id,slug,category,primary_species,is_active,image_url,name')
      .eq('id', d.product_id).maybeSingle();
    if (perr) { rejected++; bump('product_lookup_error'); results.push({ run_id: runId, creative_id: d.id, product_id: d.product_id, verdict: 'REJECT', reason: 'product_lookup_error', detail: perr.message }); continue; }

    if (!p || !p.is_active) { rejected++; bump('product_inactive'); results.push({ run_id: runId, creative_id: d.id, product_id: d.product_id, verdict: 'REJECT', reason: 'product_inactive' }); continue; }
    if (!p.slug) { rejected++; bump('product_url_invalid'); results.push({ run_id: runId, creative_id: d.id, product_id: p.id, verdict: 'REJECT', reason: 'product_url_invalid' }); continue; }

    let imageUrl = d.image_url || p.image_url;
    let didRepair = false;
    if (!d.image_url && p.image_url) didRepair = true;
    if (!imageUrl) { rejected++; bump('missing_image_url'); results.push({ run_id: runId, creative_id: d.id, product_id: p.id, verdict: 'REJECT', reason: 'missing_image_url' }); continue; }
    if (verifyImages) {
      const ok = await checkImage(imageUrl);
      if (!ok) { rejected++; bump('image_unreachable'); results.push({ run_id: runId, creative_id: d.id, product_id: p.id, verdict: 'REJECT', reason: 'image_unreachable', image_url: imageUrl }); continue; }
    }

    let boardId = d.board_id;
    let boardReason = 'creative_provided';
    if (!boardId || !ALLOWED_BOARDS.has(boardId)) {
      const m = mapBoard(p.slug, p.category, p.primary_species);
      boardId = m.board_id; boardReason = m.reason; didRepair = true;
    }

    const title = (d.headline || '').trim();
    if (!title) { rejected++; bump('missing_headline'); results.push({ run_id: runId, creative_id: d.id, product_id: p.id, verdict: 'REJECT', reason: 'missing_headline' }); continue; }
    const titleLower = title.toLowerCase();
    const banned = BANNED.find(b => titleLower.includes(b));
    if (banned) { rejected++; bump('banned_phrase'); results.push({ run_id: runId, creative_id: d.id, product_id: p.id, verdict: 'REJECT', reason: 'banned_phrase', detail: banned }); continue; }

    if (d.quality_score != null && Number(d.quality_score) < 0.6) {
      rejected++; bump('low_quality'); results.push({ run_id: runId, creative_id: d.id, product_id: p.id, verdict: 'REJECT', reason: 'low_quality', detail: String(d.quality_score) }); continue;
    }

    // Genesis V3.6 — embed full persona/creative attribution into UTMs so canonical_events
    // can stitch every purchase back to a creative/persona/hook/style combo. Falls back
    // gracefully when ids are missing — never blocks publishing.
    const { data: cMeta } = await sb.from('pcie2_creatives')
      .select('persona_id, emotion_id, hook_id, style_id, campaign_id')
      .eq('id', d.id).maybeSingle();
    // Caller may pass an explicit `campaign` (e.g. hero-daily-publish sends
    // `hero_daily`) so downstream attribution can group every hero-daily
    // click into one bucket regardless of which creative fired.
    const campaign =
      (typeof (body as any)?.campaign === 'string' && (body as any).campaign) ||
      cMeta?.campaign_id ||
      (productFilter ? 'hero_us_wave' : 'pcie2');
    const utmContent = cMeta?.persona_id
      ? `persona_${cMeta.persona_id}`
      : `creative_${d.id.slice(0,8)}`;
    const attrParams = [
      `creative_id=${d.id}`,
      `product_id=${p.id}`,
      cMeta?.persona_id  ? `persona_id=${cMeta.persona_id}`   : '',
      cMeta?.emotion_id  ? `emotion_id=${encodeURIComponent(cMeta.emotion_id)}` : '',
      cMeta?.hook_id     ? `hook_id=${cMeta.hook_id}`         : '',
      cMeta?.style_id    ? `style_id=${encodeURIComponent(cMeta.style_id)}`     : '',
      boardId            ? `board_id=${boardId}`              : '',
      `campaign_id=${encodeURIComponent(campaign)}`,
    ].filter(Boolean).join('&');
    const audienceParam = audienceTag ? `&audience=${encodeURIComponent(audienceTag)}` : '';
    const destination = `${SITE}/products/${p.slug}?utm_source=pinterest&utm_medium=organic&utm_campaign=${encodeURIComponent(campaign)}&utm_content=${utmContent}${audienceParam}&${attrParams}`;
    const description = (d.body_text || d.hook || p.name || '').slice(0, 480);
    const key = `${p.id}|${boardId}|${imageUrl}`;
    if (existingKeys.has(key)) { skipped++; bump('duplicate'); results.push({ run_id: runId, creative_id: d.id, product_id: p.id, verdict: 'SKIPPED', reason: 'duplicate' }); continue; }

    const fp = await fingerprint(key);
    const hfp = await fingerprint(title);
    const ifp = await fingerprint(imageUrl);
    const sfp = await fingerprint(`${title}::${description}`);

    // === Inline Creative Intelligence pre-flight gate ===
    // Hard checks already passed (banned phrase, quality_score >= 0.6).
    // Compute composite CI score from available signals.
    const wordCount = title.trim().split(/\s+/).length;
    const lenScore = wordCount >= 5 && wordCount <= 12 ? 100 : wordCount >= 3 && wordCount <= 15 ? 80 : 55;
    const qsScore = Math.round(Number(d.quality_score ?? 0.75) * 100);
    const trustScore = banned ? 0 : 95;
    const seoScore = /\b(cat|dog|pet|puppy|kitten)\b/i.test(title) ? 90 : 70;
    const ciScore = Math.round(0.35 * qsScore + 0.20 * lenScore + 0.20 * trustScore + 0.15 * seoScore + 0.10 * 85);
    if (ciScore < CI_MIN_SCORE) {
      rejected++; bump('ci_below_threshold');
      results.push({ run_id: runId, creative_id: d.id, product_id: p.id, verdict: 'REJECT', reason: 'ci_below_threshold', detail: `score=${ciScore}` });
      continue;
    }
    const ciPassedAt = new Date().toISOString();

    const { data: ins, error: insErr } = await sb.from('pcie2_publish_queue').insert({
      product_id: p.id,
      product_slug: p.slug,
      headline: title,
      hook: description,
      image_url: imageUrl,
      board_id: boardId,
      destination_url: destination,
      status: 'ready',
      quality_score: d.quality_score ?? 0.75,
      ci_version: CI_VERSION,
      ci_passed_at: ciPassedAt,
      ci_score: ciScore,
      quality_fingerprint: fp,
      semantic_fingerprint: sfp,
      rewrite_fingerprint: fp,
      image_fingerprint: ifp,
      headline_fingerprint: hfp,
      meta: { source: 'pcie2-publish-assembler', creative_id: d.id, board_mapping_reason: boardReason, fingerprint: fp, repaired: didRepair, ci_version: CI_VERSION, ci_score: ciScore, ci_passed_at: ciPassedAt },
    }).select('id').single();

    if (insErr) {
      if (insErr.code === '23505') { skipped++; bump('duplicate'); results.push({ run_id: runId, creative_id: d.id, product_id: p.id, verdict: 'SKIPPED', reason: 'duplicate' }); }
      else { rejected++; bump('insert_error'); results.push({ run_id: runId, creative_id: d.id, product_id: p.id, verdict: 'REJECT', reason: 'insert_error', detail: insErr.message }); }
      continue;
    }

    existingKeys.add(key);
    queued++;
    if (didRepair) repaired++;
    passed++;
    bump('queued_successfully');
    results.push({ run_id: runId, creative_id: d.id, product_id: p.id, verdict: didRepair ? 'REPAIRED' : 'PASS', reason: 'queued_successfully', queue_id: ins!.id, board_id: boardId, image_url: imageUrl, destination_url: destination });
  }

  // batch insert results (chunked)
  for (let i = 0; i < results.length; i += 200) {
    await sb.from('pcie2_assembly_results').insert(results.slice(i, i + 200));
  }

  await sb.from('pcie2_assembly_runs').update({
    finished_at: new Date().toISOString(),
    drafts_scanned: scanned, passed, repaired, rejected, skipped, queued,
    reason_counts: counts,
    status: 'completed',
  }).eq('id', runId);

  return new Response(JSON.stringify({
    ok: true, run_id: runId, scanned, passed, repaired, rejected, skipped, queued, reason_counts: counts,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64url } from "https://deno.land/std@0.168.0/encoding/base64url.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ── Google JWT Auth ──────────────────────────────────────────────
async function getGoogleAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/content',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const enc = new TextEncoder();
  const headerB64 = base64url(enc.encode(JSON.stringify(header)).buffer as ArrayBuffer);
  const payloadB64 = base64url(enc.encode(JSON.stringify(payload)).buffer as ArrayBuffer);
  const signingInput = `${headerB64}.${payloadB64}`;

  // Import the private key
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');
  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    enc.encode(signingInput),
  );
  const sigB64 = base64url(signature);
  const jwt = `${signingInput}.${sigB64}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`Google auth failed: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

// ── Weight Normalization ─────────────────────────────────────────
const LARGE_ITEM_PATTERNS = /xl|large|60"|69"|77"|84"|90"|cat tree|dog bed|stroller|cage|aviary/i;

function normalizeWeight(rawGrams: number | null | undefined, title: string): { kg: number; rawGrams: number | null } {
  let grams = rawGrams ?? 0;
  if (!grams || isNaN(grams)) grams = 0;

  let kg: number;
  if (grams === 0) {
    kg = 0.2;
  } else if (grams >= 100 && grams <= 200000) {
    kg = grams / 1000;
  } else if (grams > 0 && grams < 100) {
    // Likely already in kg
    kg = grams;
  } else {
    kg = 0.2;
  }

  // Floor/cap
  if (kg < 0.05) kg = 0.2;
  if (kg > 30) kg = 25; // skip > 30 is handled upstream, cap at 25

  // Large item minimum
  if (LARGE_ITEM_PATTERNS.test(title) && kg < 5) {
    kg = 5;
  }

  kg = Math.round(kg * 100) / 100;
  return { kg, rawGrams: rawGrams ?? null };
}

// ── Image Validation (fast — URL-only, no HEAD) ─────────────────
function validateImageUrl(url: string | null): { valid: boolean; url: string; reason?: string } {
  const PLACEHOLDER = 'https://getpawsy.pet/images/merchant-placeholder.jpg';

  if (!url || url.trim() === '') {
    return { valid: false, url: PLACEHOLDER, reason: 'empty_url' };
  }

  // Must be absolute https
  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    return { valid: false, url: PLACEHOLDER, reason: 'not_absolute' };
  }

  // Force https
  let cleaned = url.startsWith('http://') ? url.replace('http://', 'https://') : url;

  // Reject known bad patterns
  if (cleaned.includes(' ') || cleaned.length < 15) {
    return { valid: false, url: PLACEHOLDER, reason: 'malformed_url' };
  }

  return { valid: true, url: cleaned };
}

// ── Google Content API Insert ────────────────────────────────────
async function upsertGoogleProduct(
  accessToken: string,
  merchantId: string,
  product: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const url = `https://shoppingcontent.googleapis.com/content/v2.1/${merchantId}/products`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(product),
  });

  if (res.ok) return { ok: true };

  const body = await res.text();
  return { ok: false, error: `${res.status}: ${body.substring(0, 500)}` };
}

// ── Main Handler ─────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  const merchantId = Deno.env.get('GOOGLE_MERCHANT_ID');

  if (!serviceAccountJson || !merchantId) {
    return new Response(JSON.stringify({ ok: false, reason: 'Missing GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_MERCHANT_ID' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Optional admin auth check (skip for cron)
  const authHeader = req.headers.get('Authorization');
  const isCron = !authHeader;

  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ ok: false, reason: 'Unauthorized' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claims.claims.sub as string;
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ ok: false, reason: 'Admin access required' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // Create log entry
  const logId = crypto.randomUUID();
  await supabase.from('cron_job_logs').insert({
    id: logId,
    job_name: 'cj-google-merchant-sync',
    started_at: new Date().toISOString(),
    status: 'running',
  });

  const logs: Array<Record<string, unknown>> = [];
  let synced = 0;
  let failed = 0;
  let skipped = 0;

  try {
    // Parse batch params
    const body = await req.json().catch(() => ({}));
    const BATCH_SIZE = body.batchSize || 75;
    const offset = body.offset || 0;

    // 1. Get Google access token
    const googleToken = await getGoogleAccessToken(serviceAccountJson);
    console.log('[CJ-GOOGLE-SYNC] Google auth OK');

    // 2. Fetch batch of active products from DB
    const { data: products, error: dbErr, count } = await supabase
      .from('products')
      .select('id, name, slug, description, price, image_url, stock, weight, cj_product_id, is_active, images', { count: 'exact' })
      .eq('is_active', true)
      .gt('price', 0)
      .order('id')
      .range(offset, offset + BATCH_SIZE - 1);

    if (dbErr) throw new Error(`DB fetch error: ${dbErr.message}`);
    const totalProducts = count || 0;

    if (!products || products.length === 0) {
      await supabase.from('cron_job_logs').update({
        status: 'completed',
        success: true,
        completed_at: new Date().toISOString(),
        items_processed: 0,
        details: { message: offset > 0 ? 'Batch complete — all products synced' : 'No active products found', offset, totalProducts },
      }).eq('id', logId);

      return new Response(JSON.stringify({ ok: true, synced: 0, failed: 0, skipped: 0, done: true, totalProducts }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const hasMore = (offset + products.length) < totalProducts;
    console.log(`[CJ-GOOGLE-SYNC] Batch offset=${offset}, size=${products.length}, total=${totalProducts}, hasMore=${hasMore}`);

    // 3. Process each product in this batch
    for (const product of products) {
      const logEntry: Record<string, unknown> = {
        productId: product.id,
        slug: product.slug,
      };

      try {
        // Safety checks
        if (!product.price || product.price <= 0) {
          logEntry.status = 'skipped';
          logEntry.reason = 'missing_price';
          skipped++;
          logs.push(logEntry);
          continue;
        }

        // Weight normalization
        const weight = normalizeWeight(product.weight, product.name || '');
        logEntry.weightBefore = weight.rawGrams;
        logEntry.weightAfter = weight.kg;

        if (weight.kg > 30) {
          logEntry.status = 'skipped';
          logEntry.reason = 'weight_over_30kg';
          skipped++;
          logs.push(logEntry);
          continue;
        }

        // Image validation (fast — URL-only)
        const imageResult = validateImageUrl(product.image_url);
        logEntry.imageValid = imageResult.valid;
        logEntry.imageReason = imageResult.reason;

        if (!imageResult.valid && !imageResult.url) {
          logEntry.status = 'skipped';
          logEntry.reason = 'no_image';
          skipped++;
          logs.push(logEntry);
          continue;
        }

        // Validate additional images (fast)
        const additionalImages: string[] = [];
        if (product.images && Array.isArray(product.images)) {
          for (const img of product.images.slice(0, 9)) {
            const addResult = validateImageUrl(img as string);
            if (addResult.valid) {
              additionalImages.push(addResult.url);
            }
          }
        }

        // Build Google product payload
        const googleProduct: Record<string, unknown> = {
          offerId: product.id,
          title: (product.name || '').substring(0, 150),
          description: ((product.description || product.name || '')).substring(0, 5000),
          link: `https://getpawsy.pet/product/${product.slug}`,
          imageLink: imageResult.url,
          contentLanguage: 'en',
          targetCountry: 'US',
          channel: 'online',
          availability: (product.stock && product.stock > 0) ? 'in stock' : 'out of stock',
          condition: 'new',
          price: {
            value: product.price.toFixed(2),
            currency: 'USD',
          },
          brand: 'GetPawsy',
          shippingWeight: {
            value: weight.kg.toString(),
            unit: 'kg',
          },
        };

        if (additionalImages.length > 0) {
          googleProduct.additionalImageLinks = additionalImages;
        }

        // Push to Google
        const result = await upsertGoogleProduct(googleToken, merchantId, googleProduct);
        logEntry.googleResult = result.ok ? 'success' : result.error;

        if (result.ok) {
          synced++;
          logEntry.status = 'synced';
        } else {
          failed++;
          logEntry.status = 'failed';
          logEntry.error = result.error;
        }
      } catch (e) {
        failed++;
        logEntry.status = 'error';
        logEntry.error = (e as Error).message;
      }

      logs.push(logEntry);

      // No delay needed — Google handles rate limits via 429
    }

    // Update log entry
    await supabase.from('cron_job_logs').update({
      status: 'completed',
      success: failed === 0,
      completed_at: new Date().toISOString(),
      items_processed: synced + skipped,
      items_failed: failed,
      details: {
        synced,
        failed,
        skipped,
        batchSize: products.length,
        offset,
        totalProducts,
        hasMore,
        nextOffset: hasMore ? offset + products.length : null,
        sampleLogs: logs.slice(0, 20),
      },
    }).eq('id', logId);

    console.log(`[CJ-GOOGLE-SYNC] Done: synced=${synced}, failed=${failed}, skipped=${skipped}, hasMore=${hasMore}`);

    // If cron and there are more products, self-invoke next batch
    if (hasMore && isCron) {
      const nextUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/cj-google-sync`;
      fetch(nextUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offset: offset + products.length, source: 'cron-chain' }),
      }).catch(() => {}); // fire-and-forget
    }

    return new Response(JSON.stringify({
      ok: true,
      synced,
      failed,
      skipped,
      batchSize: products.length,
      totalProducts,
      hasMore,
      nextOffset: hasMore ? offset + products.length : null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[CJ-GOOGLE-SYNC] Fatal error:', err);

    await supabase.from('cron_job_logs').update({
      status: 'completed',
      success: false,
      completed_at: new Date().toISOString(),
      error_message: (err as Error).message,
      details: { synced, failed, skipped, logs: logs.slice(0, 10) },
    }).eq('id', logId);

    return new Response(JSON.stringify({
      ok: false,
      reason: (err as Error).message,
      synced,
      failed,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

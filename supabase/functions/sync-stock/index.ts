import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CJ_API_BASE = 'https://developers.cjdropshipping.com/api2.0/v1';
const BATCH_SIZE = 1;
const API_DELAY_MS = 15000;
const RATE_LIMIT_DELAY_MS = 60000;

interface SyncProgress {
  id: string;
  last_offset: number;
  total_products: number;
  synced_count: number;
  error_count: number;
  status: string;
  started_at: string | null;
  last_sync_at: string | null;
  completed_at: string | null;
  error_messages: string[];
}

interface Product {
  id: string;
  cj_product_id: string;
  sku: string | null;
  name: string;
  stock: number | null;
  cj_variant_id?: string | null;
}

// Stock result type to distinguish confirmed vs error
interface StockResult {
  stock: number | null; // null = unknown/error, number = confirmed value
  confirmed: boolean;   // true = CJ confirmed this value
  warehouse: string;
  status: 'ok' | 'discontinued' | 'no_data' | 'error';
  message: string;
  rawResponse?: unknown;
  /** First variant id seen in CJ inventory payload (used to backfill cj_variant_id). */
  vid?: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function calculateBackoffDelay(attempt: number, baseDelayMs = 1000, maxDelayMs = 10000): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 0.2 * exponentialDelay;
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  shouldRetry = (_e: Error) => true
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries && shouldRetry(lastError)) {
        const delayMs = calculateBackoffDelay(attempt);
        console.log(`Retry ${attempt + 1}/${maxRetries} after ${Math.round(delayMs)}ms`);
        await sleep(delayMs);
      } else {
        throw lastError;
      }
    }
  }
  throw lastError || new Error('Unknown error');
}

function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('429') ||
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('fetch failed')
  );
}

// deno-lint-ignore no-explicit-any
async function getAccessToken(supabase: any): Promise<string> {
  const { data: cachedData } = await supabase
    .from('cj_token_cache')
    .select('access_token, token_expiry')
    .eq('id', 'singleton')
    .maybeSingle();

  if (cachedData) {
    const tokenExpiry = new Date(cachedData.token_expiry).getTime();
    if (Date.now() < tokenExpiry) {
      return cachedData.access_token;
    }
  }

  const apiKey = Deno.env.get('CJ_API_KEY');
  if (!apiKey) throw new Error('CJ_API_KEY not configured');

  console.log('Requesting new CJ access token...');
  const response = await withRetry(async () => {
    const res = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    if (!res.ok) throw new Error(`CJ Auth failed: ${res.status}`);
    return res;
  }, 2, isRetryableError);

  const data = await response.json();
  if (!data.result) {
    throw new Error(`CJ Auth failed: ${data.message || 'Unknown error'}`);
  }

  const expiryDate = new Date(data.data.accessTokenExpiryDate);
  const safeExpiry = new Date(expiryDate.getTime() - 5 * 60 * 1000);

  await supabase.from('cj_token_cache').upsert({
    id: 'singleton',
    access_token: data.data.accessToken,
    token_expiry: safeExpiry.toISOString(),
    updated_at: new Date().toISOString()
  });

  return data.data.accessToken;
}

async function getProductInventory(accessToken: string, productId: string): Promise<StockResult> {
  try {
    const jsonData = await withRetry(async () => {
      const response = await fetch(
        `${CJ_API_BASE}/product/stock/getInventoryByPid?pid=${productId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'CJ-Access-Token': accessToken,
          },
        }
      );

      const responseText = await response.text();
      let parsed;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        throw new Error(`Invalid JSON: ${responseText.substring(0, 100)}`);
      }

      if (response.status === 429) {
        console.log(`Rate limited on ${productId}, waiting ${RATE_LIMIT_DELAY_MS / 1000}s...`);
        await sleep(RATE_LIMIT_DELAY_MS);
        throw new Error('Rate limited (429)');
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${parsed.message || 'Unknown'}`);
      }

      return parsed;
    }, 2, isRetryableError);

    // CJ API uses both `result` and `success` fields depending on endpoint
    const isSuccess = jsonData.result === true || jsonData.success === true;
    
    if (!isSuccess) {
      const message = jsonData.message || '';

      if (message.includes('removed from shelves') || message.includes('discontinued')) {
        return {
          stock: 0,
          confirmed: true,
          warehouse: 'none',
          status: 'discontinued',
          message: 'Product discontinued by CJ',
        };
      }

      if (jsonData.code === 200 || jsonData.code === '200') {
        return {
          stock: null,
          confirmed: false,
          warehouse: 'unknown',
          status: 'no_data',
          message: 'CJ returned no inventory data (code 200, not success)',
        };
      }

      return {
        stock: null,
        confirmed: false,
        warehouse: 'unknown',
        status: 'error',
        message: `CJ API error: code=${jsonData.code}, message=${message}`,
        rawResponse: jsonData,
      };
    }

    // Parse inventory data — CJ nests it in data.inventories[]
    const responseData = jsonData.data;
    const inventoryList = responseData?.inventories || (Array.isArray(responseData) ? responseData : []);
    
    let totalStock = 0;
    let warehouse = 'unknown';
    let firstVid: string | null = null;

    if (inventoryList.length > 0) {
      let usStock = 0;
      let cnStock = 0;
      let hasUs = false;

      for (const inv of inventoryList) {
        if (!firstVid && (inv.vid || inv.variantId)) firstVid = String(inv.vid || inv.variantId);
        if (inv.countryCode === 'US') {
          usStock += inv.totalInventoryNum || inv.cjInventoryNum || 0;
          hasUs = true;
        } else if (inv.countryCode === 'CN') {
          cnStock += inv.totalInventoryNum || inv.cjInventoryNum || 0;
        }
      }

      if (hasUs) {
        totalStock = usStock;
        warehouse = 'US';
      } else if (cnStock > 0) {
        totalStock = cnStock;
        warehouse = 'CN';
      } else {
        for (const inv of inventoryList) {
          totalStock += inv.totalInventoryNum || inv.cjInventoryNum || 0;
        }
        warehouse = inventoryList[0]?.countryCode || 'unknown';
      }
    } else {
      // success=true but no inventory entries
      return {
        stock: null,
        confirmed: false,
        warehouse: 'unknown',
        status: 'no_data',
        message: 'CJ success but empty inventory list',
      };
    }

    return {
      stock: totalStock,
      confirmed: true,
      warehouse,
      status: 'ok',
      message: `Stock confirmed: ${totalStock} (${warehouse})`,
      vid: firstVid,
    };
  } catch (err) {
    return {
      stock: null,
      confirmed: false,
      warehouse: 'unknown',
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

// deno-lint-ignore no-explicit-any
async function getOrCreateSyncProgress(supabase: any): Promise<SyncProgress> {
  const { data } = await supabase
    .from('sync_progress')
    .select('*')
    .eq('id', 'stock-sync')
    .maybeSingle();

  if (data) return data as SyncProgress;

  const newProgress: Partial<SyncProgress> = {
    id: 'stock-sync',
    last_offset: 0,
    total_products: 0,
    synced_count: 0,
    error_count: 0,
    status: 'idle',
    error_messages: [],
  };

  await supabase.from('sync_progress').upsert(newProgress);
  return newProgress as SyncProgress;
}

// deno-lint-ignore no-explicit-any
async function updateSyncProgress(supabase: any, updates: Partial<SyncProgress>): Promise<void> {
  await supabase
    .from('sync_progress')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', 'stock-sync');
}

// deno-lint-ignore no-explicit-any
async function syncBatch(
  supabase: any,
  accessToken: string,
  offset: number,
  isCronJob: boolean
): Promise<Record<string, unknown>> {
  const progress = await getOrCreateSyncProgress(supabase);

  const { data: allProducts, error: fetchError } = await supabase
    .from('products')
    .select('id, cj_product_id, cj_variant_id, sku, name, stock')
    .not('cj_product_id', 'is', null)
    .order('id', { ascending: true });

  if (fetchError) throw new Error(`Failed to fetch products: ${fetchError.message}`);

  const products: Product[] = allProducts || [];
  const totalProducts = products.length;

  if (totalProducts === 0) {
    await updateSyncProgress(supabase, { status: 'completed', completed_at: new Date().toISOString() });
    return { success: true, synced: 0, errors: 0, message: 'No products to sync', timestamp: new Date().toISOString() };
  }

  if (offset === 0) {
    await updateSyncProgress(supabase, {
      last_offset: 0, total_products: totalProducts, synced_count: 0, error_count: 0,
      status: 'running', started_at: new Date().toISOString(), completed_at: null, error_messages: [],
    });
  }

  const batch = products.slice(offset, offset + BATCH_SIZE);

  if (batch.length === 0) {
    await updateSyncProgress(supabase, { status: 'completed', completed_at: new Date().toISOString() });
    const finalProgress = await getOrCreateSyncProgress(supabase);

    if (isCronJob) {
      await supabase.from('cron_job_logs').insert({
        job_name: 'nightly-stock-sync', status: 'completed',
        success: finalProgress.error_count === 0,
        items_processed: finalProgress.synced_count, items_failed: finalProgress.error_count,
        started_at: finalProgress.started_at, completed_at: new Date().toISOString(),
        details: { totalProducts, errorMessages: finalProgress.error_messages?.slice(0, 10) },
      });
    }

    return {
      success: finalProgress.error_count === 0,
      synced: finalProgress.synced_count, errors: finalProgress.error_count,
      errorMessages: finalProgress.error_messages || [],
      message: `Sync completed. ${finalProgress.synced_count} updated, ${finalProgress.error_count} errors.`,
      timestamp: new Date().toISOString(),
      progress: { current: totalProducts, total: totalProducts, status: 'completed', hasMore: false },
    };
  }

  console.log(`Processing batch: offset ${offset}, size ${batch.length}, total ${totalProducts}`);

  let batchSynced = 0;
  let batchErrors = 0;
  const batchErrorMessages: string[] = [];

  for (let i = 0; i < batch.length; i++) {
    const product = batch[i];

    const result = await getProductInventory(accessToken, product.cj_product_id);

    // Build update based on result
    // deno-lint-ignore no-explicit-any
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
      last_stock_sync_at: new Date().toISOString(),
      stock_source: 'CJ',
      supplier_warehouse: result.warehouse,
    };

    if (result.confirmed && result.stock !== null) {
      // CJ confirmed the stock value — update it
      updateData.stock = result.stock;
      // Also write per-warehouse columns so the generated `effective_stock`,
      // `inventory_score`, and `inventory_priority` resolve correctly.
      // Only overwrite the warehouse that CJ confirmed; leave the others NULL
      // so we never falsely zero-out a warehouse we have no data for.
      if (result.warehouse === 'US') updateData.us_stock = result.stock;
      else if (result.warehouse === 'EU') updateData.eu_stock = result.stock;
      else if (result.warehouse === 'CN') updateData.cn_stock = result.stock;
      else if (result.warehouse === 'none' || result.status === 'discontinued') {
        updateData.us_stock = 0;
        updateData.eu_stock = 0;
        updateData.cn_stock = 0;
      }
      updateData.stock_sync_status = result.status === 'discontinued' ? 'discontinued' : 'ok';
      updateData.stock_sync_error = null;
      console.log(`✓ [${offset + i + 1}/${totalProducts}] ${product.name}: stock=${result.stock} (${result.warehouse})`);
      batchSynced++;
    } else if (result.status === 'no_data') {
      // CJ returned no inventory data — DO NOT overwrite existing stock with 0
      // Keep previous stock value, mark status
      updateData.stock_sync_status = 'no_data';
      updateData.stock_sync_error = result.message;
      console.log(`⚠ [${offset + i + 1}/${totalProducts}] ${product.name}: no CJ data, keeping stock=${product.stock}`);
      batchSynced++; // Not an error — just no data
    } else {
      // API error — DO NOT overwrite stock
      updateData.stock_sync_status = 'error';
      updateData.stock_sync_error = result.message;
      console.error(`✗ [${offset + i + 1}/${totalProducts}] ${product.name}: ${result.message}`);
      batchErrorMessages.push(`${product.name}: ${result.message}`);
      batchErrors++;
    }

    const { error: updateError } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', product.id);

    if (updateError) {
      console.error(`DB update error for ${product.name}:`, updateError.message);
      batchErrors++;
    }

    if (i < batch.length - 1) await sleep(API_DELAY_MS);
  }

  // Update progress
  const currentProgress = await getOrCreateSyncProgress(supabase);
  const newOffset = offset + batch.length;
  const newSyncedCount = (currentProgress.synced_count || 0) + batchSynced;
  const newErrorCount = (currentProgress.error_count || 0) + batchErrors;
  const newErrorMessages = [...(currentProgress.error_messages || []), ...batchErrorMessages].slice(-50);
  const hasMore = newOffset < totalProducts;

  await updateSyncProgress(supabase, {
    last_offset: newOffset,
    synced_count: newSyncedCount,
    error_count: newErrorCount,
    error_messages: newErrorMessages,
    last_sync_at: new Date().toISOString(),
    status: hasMore ? 'running' : 'completed',
    completed_at: hasMore ? null : new Date().toISOString(),
  });

  return {
    success: batchErrors === 0,
    synced: batchSynced, errors: batchErrors,
    errorMessages: batchErrorMessages,
    message: hasMore
      ? `Batch done. ${batchSynced} synced, ${batchErrors} errors. ${newOffset}/${totalProducts}...`
      : `Sync completed! ${newSyncedCount} updated, ${newErrorCount} errors.`,
    timestamp: new Date().toISOString(),
    progress: { current: newOffset, total: totalProducts, status: hasMore ? 'running' : 'completed', hasMore },
  };
}

// Debug action: test CJ API for a single product and return raw response
// deno-lint-ignore no-explicit-any
async function debugProduct(supabase: any, accessToken: string, productId?: string): Promise<Record<string, unknown>> {
  let product;

  if (productId) {
    const { data } = await supabase.from('products').select('id, cj_product_id, sku, name, stock, stock_sync_status, stock_sync_error, last_stock_sync_at').eq('id', productId).maybeSingle();
    product = data;
  } else {
    const { data } = await supabase.from('products').select('id, cj_product_id, sku, name, stock, stock_sync_status, stock_sync_error, last_stock_sync_at').eq('is_active', true).not('cj_product_id', 'is', null).limit(1);
    product = data?.[0];
  }

  if (!product) return { error: 'Product not found' };

  // Single CJ API call — return both raw and interpreted
  const rawResponse = await fetch(
    `${CJ_API_BASE}/product/stock/getInventoryByPid?pid=${product.cj_product_id}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'CJ-Access-Token': accessToken,
      },
    }
  );

  const rawText = await rawResponse.text();
  let rawJson;
  try { rawJson = JSON.parse(rawText); } catch { rawJson = rawText; }

  // Interpret the same raw response (no second API call)
  let interpreted: StockResult;
  const isSuccess = rawJson?.result === true || rawJson?.success === true;
  if (rawResponse.status === 429) {
    interpreted = { stock: null, confirmed: false, warehouse: 'unknown', status: 'error', message: 'Rate limited (429)' };
  } else if (typeof rawJson === 'object' && rawJson !== null) {
    if (!isSuccess) {
      const msg = rawJson.message || '';
      if (msg.includes('removed from shelves') || msg.includes('discontinued')) {
        interpreted = { stock: 0, confirmed: true, warehouse: 'none', status: 'discontinued', message: 'Discontinued' };
      } else if (rawJson.code === 200 || rawJson.code === '200') {
        interpreted = { stock: null, confirmed: false, warehouse: 'unknown', status: 'no_data', message: 'No inventory data' };
      } else {
        interpreted = { stock: null, confirmed: false, warehouse: 'unknown', status: 'error', message: msg };
      }
    } else {
      // Parse inventories from data.inventories[] or data[] directly
      const inventoryList = rawJson.data?.inventories || (Array.isArray(rawJson.data) ? rawJson.data : []);
      let totalStock = 0;
      let warehouse = 'unknown';
      for (const inv of inventoryList) {
        if (inv.countryCode === 'US') { totalStock += inv.totalInventoryNum || inv.cjInventoryNum || 0; warehouse = 'US'; }
      }
      if (warehouse === 'unknown') {
        for (const inv of inventoryList) { totalStock += inv.totalInventoryNum || inv.cjInventoryNum || 0; }
        warehouse = inventoryList[0]?.countryCode || 'unknown';
      }
      interpreted = { stock: totalStock, confirmed: true, warehouse, status: 'ok', message: `Stock: ${totalStock} (${warehouse})` };
    }
  } else {
    interpreted = { stock: null, confirmed: false, warehouse: 'unknown', status: 'error', message: 'Invalid response' };
  }

  return {
    product: { id: product.id, name: product.name, cj_product_id: product.cj_product_id, sku: product.sku, current_stock: product.stock, stock_sync_status: product.stock_sync_status, last_stock_sync_at: product.last_stock_sync_at },
    cj_api_response: { http_status: rawResponse.status, body: rawJson },
    interpreted_result: interpreted,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    let body: { action?: string; offset?: number; source?: string; productId?: string } = {};
    try { body = await req.json(); } catch { /* empty body ok */ }

    const authHeader = req.headers.get('Authorization');
    const isCronJob = body.source === 'cron' || authHeader === `Bearer ${supabaseServiceKey}`;

    // Auth check for non-cron requests
    if (!isCronJob) {
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
      const authClient = createClient(supabaseUrl, supabaseAnon, { global: { headers: { Authorization: authHeader } } });
      const { data: { user }, error: userError } = await authClient.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
      if (!roleData) {
        return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const action = body.action || 'sync-batch';
    let offset = body.offset ?? 0;

    if (action === 'status') {
      const progress = await getOrCreateSyncProgress(supabase);
      // Also get stock distribution
      const { data: stats } = await supabase.rpc('', {}).maybeSingle(); // won't work, use raw query via select
      // Get stock stats from products
      const { data: products } = await supabase.from('products').select('stock, stock_sync_status').not('cj_product_id', 'is', null);
      const stockStats = {
        total: products?.length || 0,
        with_stock: products?.filter((p: { stock: number | null }) => p.stock !== null && p.stock > 0).length || 0,
        zero_stock: products?.filter((p: { stock: number | null }) => p.stock === 0).length || 0,
        null_stock: products?.filter((p: { stock: number | null }) => p.stock === null).length || 0,
        sync_ok: products?.filter((p: { stock_sync_status: string | null }) => p.stock_sync_status === 'ok').length || 0,
        sync_no_data: products?.filter((p: { stock_sync_status: string | null }) => p.stock_sync_status === 'no_data').length || 0,
        sync_error: products?.filter((p: { stock_sync_status: string | null }) => p.stock_sync_status === 'error').length || 0,
        sync_discontinued: products?.filter((p: { stock_sync_status: string | null }) => p.stock_sync_status === 'discontinued').length || 0,
      };
      return new Response(JSON.stringify({ ...progress, stockStats }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'reset') {
      await updateSyncProgress(supabase, {
        last_offset: 0, synced_count: 0, error_count: 0,
        status: 'idle', started_at: null, completed_at: null, error_messages: [],
      });
      return new Response(JSON.stringify({ success: true, message: 'Progress reset' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Debug: test CJ API for a single product
    if (action === 'debug') {
      const accessToken = await getAccessToken(supabase);
      const result = await debugProduct(supabase, accessToken, body.productId);
      return new Response(JSON.stringify(result, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // For cron jobs, resume or start fresh
    if (isCronJob && offset === 0) {
      const existingProgress = await getOrCreateSyncProgress(supabase);
      if (existingProgress.status === 'running' && existingProgress.last_offset > 0) {
        offset = existingProgress.last_offset;
        console.log(`Resuming cron sync from offset ${offset}`);
      } else {
        await updateSyncProgress(supabase, {
          last_offset: 0, synced_count: 0, error_count: 0,
          status: 'running', started_at: new Date().toISOString(), completed_at: null, error_messages: [],
        });
      }
    }

    const accessToken = await getAccessToken(supabase);
    const result = await syncBatch(supabase, accessToken, offset, isCronJob);

    // For cron jobs with more to process, trigger next batch
    if (isCronJob && (result as { progress?: { hasMore: boolean } }).progress?.hasMore) {
      const nextOffset = (result as { progress?: { current: number } }).progress?.current;
      console.log(`Cron job scheduling next batch at offset ${nextOffset}`);
      const functionUrl = `${supabaseUrl}/functions/v1/sync-stock`;
      fetch(functionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
        body: JSON.stringify({ source: 'cron', offset: nextOffset }),
      }).catch(err => console.error('Failed to trigger next batch:', err));
    }

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Stock sync error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage, success: false }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

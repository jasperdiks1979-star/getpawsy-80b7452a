import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CJ_API_BASE = 'https://developers.cjdropshipping.com/api2.0/v1';

// Process only 1 product per batch - extremely conservative due to CJ's aggressive rate limits
const BATCH_SIZE = 1;
// Delay between API calls (milliseconds) - 15 seconds to respect CJ's aggressive rate limits
const API_DELAY_MS = 15000;
// Delay after rate limit hit (milliseconds) - 60 seconds
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

interface SyncResult {
  success: boolean;
  synced: number;
  errors: number;
  errorMessages: string[];
  message: string;
  timestamp: string;
  progress?: {
    current: number;
    total: number;
    status: string;
    hasMore: boolean;
  };
}

interface Product {
  id: string;
  cj_product_id: string;
  sku: string | null;
  name: string;
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

  // CJ API 2.0 uses apiKey only (not email+password)
  const apiKey = Deno.env.get('CJ_API_KEY');

  if (!apiKey) {
    throw new Error('CJ_API_KEY not configured');
  }

  console.log('Requesting new CJ access token with apiKey...');

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

  console.log('Successfully obtained CJ access token');

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

async function getProductInventory(accessToken: string, productId: string) {
  return await withRetry(async () => {
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

    if (response.status === 429) {
      console.log(`Rate limited on ${productId}, waiting ${RATE_LIMIT_DELAY_MS / 1000}s...`);
      await sleep(RATE_LIMIT_DELAY_MS);
      throw new Error('Rate limited (429)');
    }

    if (!response.ok) {
      throw new Error(`Inventory request failed: ${response.status}`);
    }

    return await response.json();
  }, 2, isRetryableError);
}

// deno-lint-ignore no-explicit-any
async function getOrCreateSyncProgress(supabase: any): Promise<SyncProgress> {
  const { data, error } = await supabase
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
async function updateSyncProgress(
  supabase: any,
  updates: Partial<SyncProgress>
): Promise<void> {
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
): Promise<SyncResult> {
  const progress = await getOrCreateSyncProgress(supabase);

  // Get products with CJ IDs
  const { data: allProducts, error: fetchError } = await supabase
    .from('products')
    .select('id, cj_product_id, sku, name')
    .not('cj_product_id', 'is', null)
    .order('id', { ascending: true });

  if (fetchError) {
    throw new Error(`Failed to fetch products: ${fetchError.message}`);
  }

  const products: Product[] = allProducts || [];
  const totalProducts = products.length;

  if (totalProducts === 0) {
    await updateSyncProgress(supabase, {
      status: 'completed',
      completed_at: new Date().toISOString(),
    });
    return {
      success: true,
      synced: 0,
      errors: 0,
      errorMessages: [],
      message: 'No products to sync',
      timestamp: new Date().toISOString(),
    };
  }

  // If offset is 0, reset progress for a new sync run
  if (offset === 0) {
    await updateSyncProgress(supabase, {
      last_offset: 0,
      total_products: totalProducts,
      synced_count: 0,
      error_count: 0,
      status: 'running',
      started_at: new Date().toISOString(),
      completed_at: null,
      error_messages: [],
    });
  }

  // Get batch
  const batch = products.slice(offset, offset + BATCH_SIZE);
  
  if (batch.length === 0) {
    // No more products - sync complete
    await updateSyncProgress(supabase, {
      status: 'completed',
      completed_at: new Date().toISOString(),
    });

    const finalProgress = await getOrCreateSyncProgress(supabase);
    
    // Log cron completion if applicable
    if (isCronJob) {
      await supabase.from('cron_job_logs').insert({
        job_name: 'nightly-stock-sync',
        status: 'completed',
        success: finalProgress.error_count === 0,
        items_processed: finalProgress.synced_count,
        items_failed: finalProgress.error_count,
        started_at: finalProgress.started_at,
        completed_at: new Date().toISOString(),
        details: { totalProducts, errorMessages: finalProgress.error_messages?.slice(0, 10) },
      });
    }

    return {
      success: finalProgress.error_count === 0,
      synced: finalProgress.synced_count,
      errors: finalProgress.error_count,
      errorMessages: finalProgress.error_messages || [],
      message: `Sync completed. ${finalProgress.synced_count} products updated, ${finalProgress.error_count} errors.`,
      timestamp: new Date().toISOString(),
      progress: {
        current: totalProducts,
        total: totalProducts,
        status: 'completed',
        hasMore: false,
      },
    };
  }

  console.log(`Processing batch: offset ${offset}, size ${batch.length}, total ${totalProducts}`);

  let batchSynced = 0;
  let batchErrors = 0;
  const batchErrorMessages: string[] = [];

  for (let i = 0; i < batch.length; i++) {
    const product = batch[i];

    try {
      const inventoryResponse = await getProductInventory(accessToken, product.cj_product_id);

      if (!inventoryResponse.result) {
        console.error(`Failed to get inventory for ${product.name}:`, inventoryResponse.message);
        batchErrorMessages.push(`${product.name}: ${inventoryResponse.message || 'Unknown error'}`);
        batchErrors++;
        continue;
      }

      // Calculate total stock (prefer US warehouse)
      let totalStock = 0;
      const inventoryData = inventoryResponse.data;

      if (Array.isArray(inventoryData)) {
        for (const inv of inventoryData) {
          if (inv.countryCode === 'US') {
            totalStock += inv.totalInventoryNum || 0;
          } else if (inv.countryCode === 'CN' && totalStock === 0) {
            totalStock = inv.totalInventoryNum || 0;
          }
        }
      }

      // Update product stock
      const { error: updateError } = await supabase
        .from('products')
        .update({
          stock: totalStock,
          updated_at: new Date().toISOString()
        })
        .eq('id', product.id);

      if (updateError) {
        throw updateError;
      }

      console.log(`✓ [${offset + i + 1}/${totalProducts}] ${product.name}: stock = ${totalStock}`);
      batchSynced++;

      // Delay between API calls to avoid rate limiting
      if (i < batch.length - 1) {
        await sleep(API_DELAY_MS);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Error syncing ${product.name}:`, errorMsg);
      batchErrorMessages.push(`${product.name}: ${errorMsg}`);
      batchErrors++;
    }
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

  console.log(`Batch complete: ${batchSynced} synced, ${batchErrors} errors. Next offset: ${newOffset}`);

  return {
    success: batchErrors === 0,
    synced: batchSynced,
    errors: batchErrors,
    errorMessages: batchErrorMessages,
    message: hasMore
      ? `Batch complete. ${batchSynced} synced, ${batchErrors} errors. Processing ${newOffset}/${totalProducts}...`
      : `Sync completed! ${newSyncedCount} products updated, ${newErrorCount} errors.`,
    timestamp: new Date().toISOString(),
    progress: {
      current: newOffset,
      total: totalProducts,
      status: hasMore ? 'running' : 'completed',
      hasMore,
    },
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
    // Parse request body for options
    let body: { action?: string; offset?: number; source?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is fine
    }

    const authHeader = req.headers.get('Authorization');
    const isCronJob = body.source === 'cron' || authHeader === `Bearer ${supabaseServiceKey}`;

    // Auth check for non-cron requests
    if (!isCronJob) {
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
      const authClient = createClient(supabaseUrl, supabaseAnon, {
        global: { headers: { Authorization: authHeader } }
      });

      const { data: { user }, error: userError } = await authClient.auth.getUser();
      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: 'Invalid token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (!roleData) {
        return new Response(
          JSON.stringify({ error: 'Admin access required' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Handle different actions
    const action = body.action || 'sync-batch';
    let offset = body.offset ?? 0;

    if (action === 'status') {
      // Return current progress
      const progress = await getOrCreateSyncProgress(supabase);
      return new Response(JSON.stringify(progress), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'reset') {
      // Reset progress
      await updateSyncProgress(supabase, {
        last_offset: 0,
        synced_count: 0,
        error_count: 0,
        status: 'idle',
        started_at: null,
        completed_at: null,
        error_messages: [],
      });
      return new Response(JSON.stringify({ success: true, message: 'Progress reset' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // For cron jobs, check if there's a running sync to resume
    if (isCronJob && offset === 0) {
      const existingProgress = await getOrCreateSyncProgress(supabase);
      if (existingProgress.status === 'running' && existingProgress.last_offset > 0) {
        // Resume from where we left off
        offset = existingProgress.last_offset;
        console.log(`Resuming cron sync from offset ${offset}`);
      } else {
        // Reset for fresh start
        await updateSyncProgress(supabase, {
          last_offset: 0,
          synced_count: 0,
          error_count: 0,
          status: 'running',
          started_at: new Date().toISOString(),
          completed_at: null,
          error_messages: [],
        });
      }
    }

    // Get access token
    const accessToken = await getAccessToken(supabase);

    // Run batch sync
    const result = await syncBatch(supabase, accessToken, offset, isCronJob);

    // For cron jobs: if there's more to process, trigger next batch
    if (isCronJob && result.progress?.hasMore) {
      const nextOffset = result.progress.current;
      console.log(`Cron job scheduling next batch at offset ${nextOffset}`);
      
      // Use fetch to trigger next batch (fire and forget)
      const functionUrl = `${supabaseUrl}/functions/v1/sync-stock`;
      fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ source: 'cron', offset: nextOffset }),
      }).catch(err => console.error('Failed to trigger next batch:', err));
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Stock sync error:', errorMessage);

    return new Response(
      JSON.stringify({
        error: errorMessage,
        success: false,
        synced: 0,
        errors: 1,
        errorMessages: [errorMessage],
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

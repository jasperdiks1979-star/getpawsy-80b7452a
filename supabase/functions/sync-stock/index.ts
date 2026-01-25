import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CJ_API_BASE = 'https://developers.cjdropshipping.com/api2.0/v1';

interface CJAuthResponse {
  result: boolean;
  code: number;
  message?: string;
  data: {
    accessToken: string;
    accessTokenExpiryDate: string;
    refreshToken: string;
    refreshTokenExpiryDate: string;
  };
}

interface SyncProgress {
  current: number;
  total: number;
  currentProduct: string;
  status: 'syncing' | 'completed' | 'error';
  synced: number;
  errors: number;
}

interface SyncResult {
  success: boolean;
  synced: number;
  errors: number;
  errorMessages: string[];
  message: string;
  timestamp: string;
  progress?: SyncProgress;
}

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay for exponential backoff
 */
function calculateBackoffDelay(attempt: number, baseDelayMs = 1000, maxDelayMs = 30000): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay;
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

/**
 * Execute a function with retry logic and exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: Error) => boolean;
    onRetry?: (attempt: number, error: Error, delayMs: number) => void;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    shouldRetry = () => true,
    onRetry,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries && shouldRetry(lastError)) {
        const delayMs = calculateBackoffDelay(attempt, baseDelayMs, maxDelayMs);
        
        if (onRetry) {
          onRetry(attempt + 1, lastError, delayMs);
        }
        
        console.log(`Retry ${attempt + 1}/${maxRetries} after ${Math.round(delayMs)}ms: ${lastError.message}`);
        await sleep(delayMs);
      } else {
        throw lastError;
      }
    }
  }

  throw lastError || new Error('Unknown error');
}

/**
 * Check if an error is retryable (network errors, rate limits, server errors)
 */
function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('rate limit') ||
    message.includes('429') ||
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('econnreset') ||
    message.includes('fetch failed')
  );
}

// Get access token from CJ API with database-backed caching
async function getAccessToken(): Promise<string> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: cachedData, error: cacheError } = await supabase
    .from('cj_token_cache')
    .select('access_token, token_expiry')
    .eq('id', 'singleton')
    .single();

  if (!cacheError && cachedData) {
    const tokenExpiry = new Date(cachedData.token_expiry).getTime();
    if (Date.now() < tokenExpiry) {
      console.log('Using cached CJ access token');
      return cachedData.access_token;
    }
    console.log('Cached token expired, requesting new one...');
  }

  const apiKey = Deno.env.get('CJ_API_KEY');
  const email = Deno.env.get('CJ_EMAIL');

  if (!apiKey || !email) {
    throw new Error('CJ_API_KEY or CJ_EMAIL not configured');
  }

  console.log('Requesting new CJ access token...');
  
  const response = await withRetry(
    async () => {
      const res = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          password: apiKey,
        }),
      });
      
      if (!res.ok) {
        throw new Error(`CJ Auth request failed: ${res.status}`);
      }
      
      return res;
    },
    { maxRetries: 3, shouldRetry: isRetryableError }
  );

  const data: CJAuthResponse = await response.json();
  
  if (!data.result) {
    console.error('CJ Auth failed:', data);
    throw new Error(`CJ Authentication failed: ${data.code} - ${data.message || 'Unknown error'}`);
  }

  const expiryDate = new Date(data.data.accessTokenExpiryDate);
  const safeExpiry = new Date(expiryDate.getTime() - (5 * 60 * 1000));
  
  await supabase
    .from('cj_token_cache')
    .upsert({
      id: 'singleton',
      access_token: data.data.accessToken,
      token_expiry: safeExpiry.toISOString(),
      updated_at: new Date().toISOString()
    });

  return data.data.accessToken;
}

// Get inventory for a product by product ID with retry logic
async function getProductInventory(accessToken: string, productId: string) {
  return await withRetry(
    async () => {
      const response = await fetch(`${CJ_API_BASE}/product/stock/getInventoryByPid?pid=${productId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'CJ-Access-Token': accessToken,
        },
      });

      if (!response.ok) {
        throw new Error(`Inventory request failed: ${response.status}`);
      }

      return await response.json();
    },
    {
      maxRetries: 3,
      baseDelayMs: 500,
      shouldRetry: isRetryableError,
      onRetry: (attempt, error, delayMs) => {
        console.log(`Retrying inventory fetch for ${productId} (attempt ${attempt}): ${error.message}`);
      },
    }
  );
}

// Log cron job start
// deno-lint-ignore no-explicit-any
async function logCronStart(supabase: any, jobName: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('cron_job_logs')
      .insert({
        job_name: jobName,
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to log cron start:', error);
      return '';
    }
    return data?.id || '';
  } catch (err) {
    console.error('Failed to log cron start:', err);
    return '';
  }
}

// Log cron job completion
// deno-lint-ignore no-explicit-any
async function logCronComplete(
  supabase: any,
  logId: string,
  success: boolean,
  itemsProcessed: number,
  itemsFailed: number,
  errorMessage?: string,
  details?: Record<string, unknown>
): Promise<void> {
  if (!logId) return;
  
  try {
    const { error } = await supabase
      .from('cron_job_logs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        success,
        items_processed: itemsProcessed,
        items_failed: itemsFailed,
        error_message: errorMessage,
        details: details || {},
      })
      .eq('id', logId);

    if (error) {
      console.error('Failed to log cron completion:', error);
    }
  } catch (err) {
    console.error('Failed to log cron completion:', err);
  }
}

// Main sync function
async function syncAllProductStock(isCronJob = false): Promise<SyncResult> {
  console.log('=== Starting scheduled stock sync ===');
  console.log('Time:', new Date().toISOString());

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const errorMessages: string[] = [];
  let cronLogId = '';

  // Log start if cron job
  if (isCronJob) {
    cronLogId = await logCronStart(supabase, 'nightly-stock-sync');
  }

  try {
    // Get access token with retry
    const accessToken = await getAccessToken();

    // Get all products that have CJ product IDs
    const { data: products, error: fetchError } = await supabase
      .from('products')
      .select('id, cj_product_id, sku, name')
      .not('cj_product_id', 'is', null);

    if (fetchError) {
      console.error('Error fetching products:', fetchError);
      throw new Error(`Failed to fetch products: ${fetchError.message}`);
    }

    if (!products || products.length === 0) {
      console.log('No products with CJ product IDs found');
      
      if (isCronJob) {
        await logCronComplete(supabase, cronLogId, true, 0, 0, undefined, { message: 'No products to sync' });
      }
      
      return { 
        success: true,
        synced: 0, 
        errors: 0, 
        errorMessages: [],
        message: 'No products to sync',
        timestamp: new Date().toISOString(),
      };
    }

    console.log(`Found ${products.length} products to sync`);

    let synced = 0;
    let errors = 0;

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      
      try {
        const inventoryResponse = await getProductInventory(accessToken, product.cj_product_id);
        
        if (!inventoryResponse.result) {
          console.error(`Failed to get inventory for ${product.name}:`, inventoryResponse.message);
          errorMessages.push(`${product.name}: ${inventoryResponse.message || 'Unknown error'}`);
          errors++;
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

        // Update product stock with retry
        await withRetry(
          async () => {
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
          },
          {
            maxRetries: 2,
            baseDelayMs: 500,
            shouldRetry: (err) => err.message.includes('network') || err.message.includes('timeout'),
          }
        );

        console.log(`✓ [${i + 1}/${products.length}] ${product.name}: stock = ${totalStock}`);
        synced++;

        // Small delay to avoid rate limiting
        await sleep(200);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`Error syncing ${product.name}:`, errorMsg);
        errorMessages.push(`${product.name}: ${errorMsg}`);
        errors++;
      }
    }

    console.log('=== Stock sync completed ===');
    console.log(`Synced: ${synced}, Errors: ${errors}`);

    // Log completion if cron job
    if (isCronJob) {
      await logCronComplete(supabase, cronLogId, errors === 0, synced, errors, 
        errors > 0 ? errorMessages.slice(0, 5).join('; ') : undefined,
        { totalProducts: products.length, errorMessages: errorMessages.slice(0, 10) }
      );
    }

    return { 
      success: errors === 0,
      synced, 
      errors,
      errorMessages,
      message: `Stock sync completed. ${synced} products updated, ${errors} errors.`,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    
    // Log failure if cron job
    if (isCronJob && cronLogId) {
      await logCronComplete(supabase, cronLogId, false, 0, 1, errorMsg);
    }
    
    throw error;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check if this is a cron job call (internal scheduled call via Authorization header)
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    // If the Authorization header contains the service role key, it's a cron job
    if (authHeader === `Bearer ${serviceRoleKey}`) {
      console.log('=== Cron job triggered stock sync (bypassing rate limit) ===');
      const result = await syncAllProductStock(true); // Pass true for cron job
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Authenticate user - require admin role (authHeader already defined above)
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - no authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await authSupabase.auth.getUser();
    
    if (userError || !user) {
      console.error('User verification failed:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    console.log(`Authenticated user: ${userId}`);

    // Check if user is admin
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: roleData, error: roleError } = await adminSupabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError || !roleData) {
      console.error('Admin check failed:', roleError || 'User is not admin');
      return new Response(
        JSON.stringify({ error: 'Forbidden - admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Admin verified for user: ${userId}`);

    // Check rate limit (30 requests per hour for sync-stock)
    const { data: rateLimitData, error: rateLimitError } = await adminSupabase
      .rpc('check_rate_limit', {
        p_user_id: userId,
        p_function_name: 'sync-stock',
        p_max_requests: 30,
        p_window_minutes: 60
      });

    if (rateLimitError) {
      console.error('Rate limit check failed:', rateLimitError);
    } else if (rateLimitData && rateLimitData.length > 0 && !rateLimitData[0].allowed) {
      console.log(`Rate limit exceeded for user: ${userId}`);
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded. Please try again later.',
          reset_at: rateLimitData[0].reset_at
        }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimitData[0].reset_at
          } 
        }
      );
    }

    const result = await syncAllProductStock();
    
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

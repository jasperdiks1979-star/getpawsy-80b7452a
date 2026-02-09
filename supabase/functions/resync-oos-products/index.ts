import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CJ_API_BASE = 'https://developers.cjdropshipping.com/api2.0/v1';
const BATCH_SIZE = 5;
const API_DELAY_MS = 3000;
const RATE_LIMIT_DELAY_MS = 60000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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

  const res = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  });
  if (!res.ok) throw new Error(`CJ Auth failed: ${res.status}`);
  const data = await res.json();
  if (!data.result) throw new Error(`CJ Auth failed: ${data.message}`);

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

interface StockResult {
  stock: number | null;
  confirmed: boolean;
  warehouse: string;
  status: 'ok' | 'discontinued' | 'no_data' | 'error';
  message: string;
}

async function getProductInventory(accessToken: string, pid: string): Promise<StockResult> {
  try {
    const response = await fetch(
      `${CJ_API_BASE}/product/stock/getInventoryByPid?pid=${pid}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'CJ-Access-Token': accessToken,
        },
      }
    );

    if (response.status === 429) {
      console.log(`Rate limited on ${pid}, waiting ${RATE_LIMIT_DELAY_MS / 1000}s...`);
      await sleep(RATE_LIMIT_DELAY_MS);
      return { stock: null, confirmed: false, warehouse: 'unknown', status: 'error', message: 'Rate limited (429)' };
    }

    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch { return { stock: null, confirmed: false, warehouse: 'unknown', status: 'error', message: 'Invalid JSON' }; }

    if (!response.ok) {
      return { stock: null, confirmed: false, warehouse: 'unknown', status: 'error', message: `HTTP ${response.status}` };
    }

    const isSuccess = json.result === true || json.success === true;

    if (!isSuccess) {
      const msg = json.message || '';
      if (msg.includes('removed from shelves') || msg.includes('discontinued')) {
        return { stock: 0, confirmed: true, warehouse: 'none', status: 'discontinued', message: 'Product discontinued by CJ' };
      }
      if (json.code === 200 || json.code === '200') {
        return { stock: null, confirmed: false, warehouse: 'unknown', status: 'no_data', message: 'CJ returned no inventory data' };
      }
      return { stock: null, confirmed: false, warehouse: 'unknown', status: 'error', message: `CJ error: ${msg}` };
    }

    const inventoryList = json.data?.inventories || (Array.isArray(json.data) ? json.data : []);
    if (inventoryList.length === 0) {
      return { stock: null, confirmed: false, warehouse: 'unknown', status: 'no_data', message: 'Empty inventory list' };
    }

    let totalStock = 0;
    let warehouse = 'unknown';
    let usStock = 0;
    let hasUs = false;

    for (const inv of inventoryList) {
      if (inv.countryCode === 'US') {
        usStock += inv.totalInventoryNum || inv.cjInventoryNum || 0;
        hasUs = true;
      }
    }

    if (hasUs) {
      totalStock = usStock;
      warehouse = 'US';
    } else {
      // Fallback to all warehouses
      for (const inv of inventoryList) {
        totalStock += inv.totalInventoryNum || inv.cjInventoryNum || 0;
      }
      warehouse = inventoryList[0]?.countryCode || 'global';
    }

    return { stock: totalStock, confirmed: true, warehouse, status: 'ok', message: `Stock: ${totalStock} (${warehouse})` };
  } catch (err) {
    return { stock: null, confirmed: false, warehouse: 'unknown', status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
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

    let body: { action?: string; offset?: number; limit?: number } = {};
    try { body = await req.json(); } catch { /* empty body ok */ }

    const action = body.action || 'resync';
    const offset = body.offset ?? 0;
    const limit = body.limit ?? BATCH_SIZE;

    // Get all canonical OOS products
    const { data: oosProducts, error: fetchErr } = await supabase
      .from('products')
      .select('id, cj_product_id, name, stock, stock_sync_status')
      .eq('is_duplicate', false)
      .eq('is_active', true)
      .eq('stock', 0)
      .not('cj_product_id', 'is', null)
      .order('id', { ascending: true });

    if (fetchErr) throw new Error(`Failed to fetch OOS products: ${fetchErr.message}`);

    const products = oosProducts || [];
    const totalCount = products.length;

    if (action === 'count') {
      // Breakdown by sync status
      const statusBreakdown: Record<string, number> = {};
      for (const p of products) {
        const s = p.stock_sync_status || 'null';
        statusBreakdown[s] = (statusBreakdown[s] || 0) + 1;
      }
      return new Response(JSON.stringify({ count: totalCount, statusBreakdown }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Resync action - process a batch
    const batch = products.slice(offset, offset + limit);
    if (batch.length === 0) {
      return new Response(JSON.stringify({
        success: true, done: true,
        summary: { total: totalCount, processed: offset, restoredToStock: 0, confirmedOos: 0, errors: 0, discontinued: 0 },
        products: []
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const accessToken = await getAccessToken(supabase);

    interface ProductResult {
      productId: string;
      productName: string;
      cjProductId: string;
      previousStock: number;
      previousStatus: string | null;
      newStock: number | null;
      newStatus: string;
      warehouse: string;
      action: string;
      error?: string;
    }

    const results: ProductResult[] = [];
    let restoredToStock = 0;
    let confirmedOos = 0;
    let errors = 0;
    let discontinued = 0;

    for (let i = 0; i < batch.length; i++) {
      const product = batch[i];
      const result = await getProductInventory(accessToken, product.cj_product_id);

      // deno-lint-ignore no-explicit-any
      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString(),
        last_stock_sync_at: new Date().toISOString(),
        stock_source: 'CJ',
        supplier_warehouse: result.warehouse,
      };

      let actionTaken = 'no_change';

      if (result.confirmed && result.stock !== null) {
        updateData.stock = result.stock;
        updateData.stock_sync_error = null;

        if (result.status === 'discontinued') {
          updateData.stock_sync_status = 'discontinued';
          actionTaken = 'confirmed_discontinued';
          discontinued++;
        } else if (result.stock > 0) {
          updateData.stock_sync_status = 'ok';
          actionTaken = 'restored_to_stock';
          restoredToStock++;
        } else {
          updateData.stock_sync_status = 'ok';
          actionTaken = 'confirmed_oos';
          confirmedOos++;
        }
      } else if (result.status === 'no_data') {
        updateData.stock_sync_status = 'no_data';
        updateData.stock_sync_error = result.message;
        actionTaken = 'no_data_kept_previous';
        errors++;
      } else {
        updateData.stock_sync_status = 'error';
        updateData.stock_sync_error = result.message;
        actionTaken = 'sync_error';
        errors++;
      }

      await supabase.from('products').update(updateData).eq('id', product.id);

      const idx = offset + i + 1;
      const icon = result.stock && result.stock > 0 ? '🟢' : result.confirmed ? '🔴' : '⚠️';
      console.log(`${icon} [${idx}/${totalCount}] ${product.name}: ${actionTaken} (stock=${result.stock ?? 'null'}, ${result.warehouse})`);

      results.push({
        productId: product.id,
        productName: product.name,
        cjProductId: product.cj_product_id,
        previousStock: product.stock,
        previousStatus: product.stock_sync_status,
        newStock: result.stock,
        newStatus: result.status,
        warehouse: result.warehouse,
        action: actionTaken,
        error: result.status === 'error' ? result.message : undefined,
      });

      if (i < batch.length - 1) await sleep(API_DELAY_MS);
    }

    const hasMore = offset + batch.length < totalCount;

    return new Response(JSON.stringify({
      success: true,
      done: !hasMore,
      summary: {
        total: totalCount,
        processed: offset + batch.length,
        batchSize: batch.length,
        restoredToStock,
        confirmedOos,
        discontinued,
        errors,
        hasMore,
        nextOffset: hasMore ? offset + batch.length : null,
      },
      products: results,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('OOS resync error:', msg);
    return new Response(JSON.stringify({ error: msg, success: false }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

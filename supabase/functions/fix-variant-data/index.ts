import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProductVariant {
  variantKey?: string | null;
  variantName?: string | null;
  variantNameEn?: string | null;
  variantSku?: string | null;
  [key: string]: unknown;
}

interface Product {
  id: string;
  name: string;
  variants: ProductVariant[] | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Determine trigger source
  const authHeader = req.headers.get('authorization');
  const triggeredBy = authHeader?.includes('service_role') ? 'cron' : 'manual';
  const isCronJob = triggeredBy === 'cron';

  // Log cron start
  let cronLogId = '';
  if (isCronJob) {
    try {
      const { data } = await supabase
        .from('cron_job_logs')
        .insert({
          job_name: 'nightly-variant-data-fix',
          status: 'running',
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      cronLogId = data?.id || '';
    } catch (err) {
      console.error('Failed to log cron start:', err);
    }
  }

  try {
    console.log('Starting automatic variant data fix...');

    // Fetch all products with variants
    const { data: products, error: fetchError } = await supabase
      .from('products')
      .select('id, name, variants')
      .not('variants', 'is', null);

    if (fetchError) {
      throw new Error(`Failed to fetch products: ${fetchError.message}`);
    }

    if (!products || products.length === 0) {
      console.log('No products with variants found');
      
      // Log the run
      await supabase.from('variant_fix_logs').insert({
        products_fixed: 0,
        total_variants_fixed: 0,
        fixed_products: [],
        triggered_by: triggeredBy,
        success: true
      });

      // Log cron completion
      if (isCronJob && cronLogId) {
        await supabase.from('cron_job_logs').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          success: true,
          items_processed: 0,
          items_failed: 0,
          details: { message: 'No products with variants found' },
        }).eq('id', cronLogId);
      }

      return new Response(
        JSON.stringify({ success: true, message: 'No products with variants found', fixed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let fixedCount = 0;
    let totalVariantsFixed = 0;
    const fixedProducts: string[] = [];

    for (const product of products as Product[]) {
      if (!product.variants || !Array.isArray(product.variants)) continue;

      let needsUpdate = false;
      const updatedVariants = product.variants.map((variant: ProductVariant) => {
        const updated = { ...variant };
        let variantFixed = false;

        // Fix missing variantNameEn
        if (!variant.variantNameEn || variant.variantNameEn === null) {
          updated.variantNameEn = variant.variantKey || variant.variantSku || 'Option';
          variantFixed = true;
        }

        // Fix missing variantKey
        if (!variant.variantKey || variant.variantKey === null) {
          updated.variantKey = variant.variantNameEn || variant.variantSku || 'option';
          variantFixed = true;
        }

        if (variantFixed) {
          needsUpdate = true;
          totalVariantsFixed++;
        }

        return updated;
      });

      if (needsUpdate) {
        const { error: updateError } = await supabase
          .from('products')
          .update({ variants: updatedVariants })
          .eq('id', product.id);

        if (updateError) {
          console.error(`Failed to update product ${product.id}: ${updateError.message}`);
        } else {
          fixedCount++;
          fixedProducts.push(product.name);
          console.log(`Fixed variants for product: ${product.name}`);
        }
      }
    }

    const summary = {
      success: true,
      message: `Automatic variant data fix completed`,
      productsFixed: fixedCount,
      totalVariantsFixed,
      fixedProducts,
      timestamp: new Date().toISOString()
    };

    // Log the run to database
    await supabase.from('variant_fix_logs').insert({
      products_fixed: fixedCount,
      total_variants_fixed: totalVariantsFixed,
      fixed_products: fixedProducts,
      triggered_by: triggeredBy,
      success: true
    });

    // Log cron completion
    if (isCronJob && cronLogId) {
      await supabase.from('cron_job_logs').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        success: true,
        items_processed: fixedCount,
        items_failed: 0,
        details: { totalProducts: products.length, fixedProducts, totalVariantsFixed },
      }).eq('id', cronLogId);
    }

    console.log('Fix completed:', summary);

    return new Response(
      JSON.stringify(summary),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in fix-variant-data:', error);

    // Log the error
    await supabase.from('variant_fix_logs').insert({
      products_fixed: 0,
      total_variants_fixed: 0,
      fixed_products: [],
      triggered_by: triggeredBy,
      success: false,
      error_message: errorMessage
    });

    // Log cron failure
    if (isCronJob && cronLogId) {
      await supabase.from('cron_job_logs').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        success: false,
        items_processed: 0,
        items_failed: 1,
        error_message: errorMessage,
      }).eq('id', cronLogId);
    }

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

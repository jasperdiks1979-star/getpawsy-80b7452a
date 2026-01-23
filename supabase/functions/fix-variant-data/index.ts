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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    console.log('Fix completed:', summary);

    return new Response(
      JSON.stringify(summary),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in fix-variant-data:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

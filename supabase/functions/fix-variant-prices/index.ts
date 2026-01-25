import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FixResult {
  success: boolean;
  message: string;
  productsFixed: number;
  totalVariantsFixed: number;
  updatedProducts: Array<{ id: string; name: string; variantCount: number }>;
  errors: string[];
  timestamp: string;
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
 * Check if an error is retryable
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
    message.includes('504')
  );
}

/**
 * Calculate dynamic markup multiplier based on cost price
 */
function calculateDynamicMultiplier(costPrice: number): number {
  if (costPrice <= 2) return 4.0;
  if (costPrice <= 5) return 3.5;
  if (costPrice <= 10) return 3.0;
  if (costPrice <= 20) return 2.5;
  if (costPrice <= 50) return 2.0;
  if (costPrice <= 100) return 1.75;
  return 1.5;
}

/**
 * Estimate shipping cost based on weight in grams
 */
function estimateShippingCost(weight: number): number {
  if (weight <= 100) return 3.99;
  if (weight <= 250) return 4.99;
  if (weight <= 500) return 5.99;
  if (weight <= 1000) return 7.99;
  if (weight <= 2000) return 9.99;
  return 9.99 + Math.ceil((weight - 2000) / 1000) * 3;
}

/**
 * Round to psychological price
 */
function roundToPsychologicalPrice(price: number): number {
  const wholePart = Math.floor(price);
  const decimalPart = price - wholePart;
  
  if (price < 5) {
    if (decimalPart < 0.25) return wholePart - 0.01;
    if (decimalPart < 0.75) return wholePart + 0.49;
    return wholePart + 0.99;
  }
  
  if (price < 20) {
    if (decimalPart < 0.30) return wholePart - 0.01;
    if (decimalPart < 0.60) return wholePart + 0.49;
    return wholePart + 0.99;
  }
  
  if (price < 100) {
    if (decimalPart < 0.475) return wholePart - 0.01;
    if (decimalPart < 0.725) return wholePart + 0.49;
    return wholePart + 0.95;
  }
  
  if (decimalPart < 0.50) return wholePart - 0.01;
  return wholePart + 0.99;
}

/**
 * Calculate selling price from cost price and weight
 */
function calculateSellingPrice(costPrice: number, weight: number = 200): number {
  const shippingCost = estimateShippingCost(weight);
  const totalCost = costPrice + shippingCost;
  const multiplier = calculateDynamicMultiplier(totalCost);
  const rawPrice = totalCost * multiplier;
  return roundToPsychologicalPrice(rawPrice);
}

interface ProductVariant {
  vid: string;
  pid: string;
  variantNameEn: string;
  variantSku: string;
  variantImage?: string;
  variantKey: string;
  variantWeight: number;
  variantSellPrice: number;
  variantCostPrice?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const errors: string[] = [];

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is admin
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all products with variants with retry
    const products = await withRetry(
      async () => {
        const result = await supabase
          .from("products")
          .select("id, name, price, weight, cost_price, variants")
          .not("variants", "is", null);
        
        if (result.error) throw new Error(result.error.message);
        return result.data;
      },
      { maxRetries: 3, shouldRetry: isRetryableError }
    );

    console.log(`Found ${products?.length || 0} products with variants`);

    let updatedCount = 0;
    let totalVariantsFixed = 0;
    let skippedCount = 0;
    const updates: { id: string; name: string; variantCount: number }[] = [];

    for (let i = 0; i < (products?.length || 0); i++) {
      const product = products![i];
      
      if (!product.variants || !Array.isArray(product.variants) || product.variants.length === 0) {
        skippedCount++;
        continue;
      }

      const productWeight = Number(product.weight) || 200;
      const productPrice = Number(product.price) || 0;
      let hasChanges = false;
      let variantsFixedInProduct = 0;

      const updatedVariants = (product.variants as unknown as ProductVariant[]).map((variant) => {
        const currentPrice = Number(variant.variantSellPrice) || 0;
        const variantWeight = Number(variant.variantWeight) || productWeight;
        
        // Check if this looks like a cost price (much lower than the product selling price)
        // If it's less than 40% of the product price, it's likely still the cost price
        const isProbablyCostPrice = currentPrice > 0 && currentPrice < productPrice * 0.4;
        
        if (isProbablyCostPrice) {
          const newSellingPrice = calculateSellingPrice(currentPrice, variantWeight);
          hasChanges = true;
          variantsFixedInProduct++;
          
          console.log(`[${i + 1}/${products!.length}] Product "${product.name}" variant: $${currentPrice} -> $${newSellingPrice}`);
          
          return {
            ...variant,
            variantCostPrice: currentPrice,
            variantSellPrice: newSellingPrice,
          };
        }
        
        // Price seems already correct
        return variant;
      });

      if (hasChanges) {
        try {
          await withRetry(
            async () => {
              const { error: updateError } = await supabase
                .from("products")
                .update({ variants: updatedVariants })
                .eq("id", product.id);

              if (updateError) throw updateError;
            },
            {
              maxRetries: 3,
              baseDelayMs: 500,
              shouldRetry: isRetryableError,
              onRetry: (attempt, error) => {
                console.log(`Retrying update for ${product.name} (attempt ${attempt}): ${error.message}`);
              },
            }
          );

          updatedCount++;
          totalVariantsFixed += variantsFixedInProduct;
          updates.push({
            id: product.id,
            name: product.name,
            variantCount: updatedVariants.length,
          });
          
          console.log(`✓ [${i + 1}/${products!.length}] Updated ${product.name} (${variantsFixedInProduct} variants fixed)`);
        } catch (updateErr) {
          const errorMsg = updateErr instanceof Error ? updateErr.message : 'Unknown error';
          console.error(`Failed to update product ${product.id}: ${errorMsg}`);
          errors.push(`${product.name}: ${errorMsg}`);
        }
      } else {
        skippedCount++;
      }

      // Small delay between products to avoid overwhelming the database
      if (i < (products?.length || 0) - 1) {
        await sleep(100);
      }
    }

    const result: FixResult = {
      success: errors.length === 0,
      message: `Updated ${updatedCount} products, skipped ${skippedCount}. ${totalVariantsFixed} variants fixed.`,
      productsFixed: updatedCount,
      totalVariantsFixed,
      updatedProducts: updates,
      errors,
      timestamp: new Date().toISOString(),
    };

    // Log the fix operation
    await supabase.from("variant_fix_logs").insert({
      success: result.success,
      products_fixed: updatedCount,
      total_variants_fixed: totalVariantsFixed,
      fixed_products: updates,
      error_message: errors.length > 0 ? errors.join('; ') : null,
      triggered_by: user.id,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error:", errorMessage);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage,
        productsFixed: 0,
        totalVariantsFixed: 0,
        updatedProducts: [],
        errors: [errorMessage],
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Fetch all products with variants
    const { data: products, error: fetchError } = await supabase
      .from("products")
      .select("id, name, price, weight, cost_price, variants")
      .not("variants", "is", null);

    if (fetchError) {
      throw new Error(`Failed to fetch products: ${fetchError.message}`);
    }

    console.log(`Found ${products?.length || 0} products with variants`);

    let updatedCount = 0;
    let skippedCount = 0;
    const updates: { id: string; name: string; variantCount: number }[] = [];

    for (const product of products || []) {
      if (!product.variants || !Array.isArray(product.variants) || product.variants.length === 0) {
        skippedCount++;
        continue;
      }

      const productWeight = Number(product.weight) || 200;
      const productPrice = Number(product.price) || 0;
      let hasChanges = false;

      const updatedVariants = (product.variants as unknown as ProductVariant[]).map((variant) => {
        const currentPrice = Number(variant.variantSellPrice) || 0;
        const variantWeight = Number(variant.variantWeight) || productWeight;
        
        // Check if this looks like a cost price (much lower than the product selling price)
        // If it's less than 40% of the product price, it's likely still the cost price
        const isProbablyCostPrice = currentPrice > 0 && currentPrice < productPrice * 0.4;
        
        if (isProbablyCostPrice) {
          const newSellingPrice = calculateSellingPrice(currentPrice, variantWeight);
          hasChanges = true;
          
          console.log(`Product "${product.name}" variant: $${currentPrice} -> $${newSellingPrice}`);
          
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
        const { error: updateError } = await supabase
          .from("products")
          .update({ variants: updatedVariants })
          .eq("id", product.id);

        if (updateError) {
          console.error(`Failed to update product ${product.id}: ${updateError.message}`);
        } else {
          updatedCount++;
          updates.push({
            id: product.id,
            name: product.name,
            variantCount: updatedVariants.length,
          });
        }
      } else {
        skippedCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Updated ${updatedCount} products, skipped ${skippedCount}`,
        updatedProducts: updates,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

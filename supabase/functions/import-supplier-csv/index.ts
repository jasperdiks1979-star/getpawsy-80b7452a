import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TopDawgProduct {
  'Item #'?: string;
  'UPC'?: string;
  'Product Name'?: string;
  'Description'?: string;
  'Category'?: string;
  'Brand'?: string;
  'Wholesale Price'?: string;
  'MSRP'?: string;
  'Weight'?: string;
  'Image URL'?: string;
  'Stock Status'?: string;
  [key: string]: string | undefined;
}

interface PetDropshipperProduct {
  'SKU'?: string;
  'Product Name'?: string;
  'Description'?: string;
  'Category'?: string;
  'Brand'?: string;
  'Cost'?: string;
  'MSRP'?: string;
  'Weight (lbs)'?: string;
  'Image'?: string;
  'In Stock'?: string;
  [key: string]: string | undefined;
}

function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  // Parse header - handle quoted fields
  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    if (values.length === headers.length) {
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      rows.push(row);
    }
  }

  return rows;
}

function parsePrice(priceStr: string | undefined): number | null {
  if (!priceStr) return null;
  // Handle price ranges like "22.89-24.54" - take the lowest
  if (priceStr.includes('-')) {
    const parts = priceStr.split('-');
    priceStr = parts[0];
  }
  const cleaned = priceStr.replace(/[^0-9.]/g, '');
  const price = parseFloat(cleaned);
  return isNaN(price) ? null : price;
}

function parseWeight(weightStr: string | undefined): number | null {
  if (!weightStr) return null;
  const cleaned = weightStr.replace(/[^0-9.]/g, '');
  const weight = parseFloat(cleaned);
  return isNaN(weight) ? null : weight;
}

function normalizeTopDawgProduct(row: TopDawgProduct) {
  const costPrice = parsePrice(row['Wholesale Price']);
  if (!costPrice) return null;

  return {
    supplier: 'topdawg',
    supplier_product_id: row['Item #'] || row['UPC'] || '',
    product_name: row['Product Name'] || '',
    description: row['Description'] || '',
    category: row['Category'] || '',
    brand: row['Brand'] || '',
    cost_price: costPrice,
    msrp: parsePrice(row['MSRP']),
    weight: parseWeight(row['Weight']),
    image_url: row['Image URL'] || '',
    sku: row['Item #'] || '',
    stock_status: (row['Stock Status'] || 'in_stock').toLowerCase().includes('out') ? 'out_of_stock' : 'in_stock',
    shipping_time: '2-5 business days',
    raw_data: row,
    is_discontinued: false,
  };
}

function normalizePetDropshipperProduct(row: PetDropshipperProduct) {
  const costPrice = parsePrice(row['Cost']);
  if (!costPrice) return null;

  return {
    supplier: 'petdropshipper',
    supplier_product_id: row['SKU'] || '',
    product_name: row['Product Name'] || '',
    description: row['Description'] || '',
    category: row['Category'] || '',
    brand: row['Brand'] || '',
    cost_price: costPrice,
    msrp: parsePrice(row['MSRP']),
    weight: parseWeight(row['Weight (lbs)']),
    image_url: row['Image'] || '',
    sku: row['SKU'] || '',
    stock_status: (row['In Stock'] || 'yes').toLowerCase() === 'yes' ? 'in_stock' : 'out_of_stock',
    shipping_time: '2-5 business days',
    raw_data: row,
    is_discontinued: false,
  };
}

// Auto-detect supplier based on CSV headers
function detectSupplier(headers: string[]): 'topdawg' | 'petdropshipper' | null {
  const headerStr = headers.join(',').toLowerCase();
  
  if (headerStr.includes('wholesale price') || headerStr.includes('item #')) {
    return 'topdawg';
  }
  if (headerStr.includes('cost') && headerStr.includes('sku')) {
    return 'petdropshipper';
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify admin access
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const { data: { user } } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    const { action, csvContent, supplier: specifiedSupplier, filename } = await req.json();

    if (action === "import") {
      if (!csvContent) {
        throw new Error("CSV content is required");
      }

      // Parse CSV
      const rows = parseCSV(csvContent);
      if (rows.length === 0) {
        throw new Error("No valid rows found in CSV");
      }

      // Detect or use specified supplier
      const headers = Object.keys(rows[0]);
      const detectedSupplier = specifiedSupplier || detectSupplier(headers);
      
      if (!detectedSupplier) {
        throw new Error("Could not detect supplier format. Please specify supplier type.");
      }

      // Create import log
      const { data: importLog, error: logError } = await supabaseAdmin
        .from("supplier_import_logs")
        .insert({
          supplier: detectedSupplier,
          filename: filename || 'unknown.csv',
          total_rows: rows.length,
          imported_by: user.id,
          status: 'processing',
        })
        .select()
        .single();

      if (logError) {
        console.error("Failed to create import log:", logError);
      }

      // Process rows
      let imported = 0;
      let failed = 0;
      let skipped = 0;
      const errors: { row: number; error: string }[] = [];

      for (let i = 0; i < rows.length; i++) {
        try {
          const row = rows[i];
          let normalized;

          if (detectedSupplier === 'topdawg') {
            normalized = normalizeTopDawgProduct(row as TopDawgProduct);
          } else {
            normalized = normalizePetDropshipperProduct(row as PetDropshipperProduct);
          }

          if (!normalized || !normalized.product_name || !normalized.supplier_product_id) {
            skipped++;
            continue;
          }

          // Check if product is discontinued
          const { data: discCheck } = await supabaseAdmin
            .from("discontinued_products")
            .select("id")
            .eq("supplier", normalized.supplier)
            .eq("sku", normalized.sku)
            .maybeSingle();

          if (discCheck) {
            // Mark as discontinued and skip
            normalized.is_discontinued = true;
          }

          // Upsert the product
          const { error: upsertError } = await supabaseAdmin
            .from("supplier_products")
            .upsert(normalized, {
              onConflict: 'supplier,supplier_product_id',
            });

          if (upsertError) {
            failed++;
            errors.push({ row: i + 2, error: upsertError.message });
          } else {
            imported++;
          }
        } catch (err) {
          failed++;
          errors.push({ row: i + 2, error: err instanceof Error ? err.message : 'Unknown error' });
        }
      }

      // Update import log
      if (importLog) {
        await supabaseAdmin
          .from("supplier_import_logs")
          .update({
            imported_count: imported,
            failed_count: failed,
            skipped_count: skipped,
            errors: errors.slice(0, 50), // Limit stored errors
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq("id", importLog.id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          supplier: detectedSupplier,
          summary: {
            total: rows.length,
            imported,
            failed,
            skipped,
          },
          errors: errors.slice(0, 10),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (action === "list") {
      const { supplier, search, limit = 50, offset = 0 } = await req.json();

      let query = supabaseAdmin
        .from("supplier_products")
        .select("*", { count: "exact" });

      if (supplier) {
        query = query.eq("supplier", supplier);
      }

      if (search) {
        query = query.ilike("product_name", `%${search}%`);
      }

      const { data: products, count, error } = await query
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return new Response(
        JSON.stringify({
          success: true,
          products,
          total: count,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (action === "find-matches") {
      // Find potential matches between slow-shipping products and supplier products
      const { data: slowProducts, error: slowError } = await supabaseAdmin
        .from("products")
        .select("id, name, cj_product_id, cost_price, price, shipping_time")
        .eq("is_active", true)
        .like("shipping_time", "%10-20%");

      if (slowError) throw slowError;

      const matches: Array<{
        product: typeof slowProducts[0];
        potentialMatches: Array<{
          id: string;
          supplier: string;
          product_name: string;
          cost_price: number;
          shipping_time: string;
          match_score: number;
        }>;
      }> = [];

      for (const product of slowProducts || []) {
        // Search for similar products by name keywords
        const keywords = product.name
          .toLowerCase()
          .split(/\s+/)
          .filter((w: string) => w.length > 3)
          .slice(0, 3);

        if (keywords.length === 0) continue;

        // Build search query
        let searchQuery = supabaseAdmin
          .from("supplier_products")
          .select("id, supplier, product_name, cost_price, shipping_time")
          .neq("supplier", "cj");

        // Search by first keyword
        const { data: supplierProducts } = await searchQuery
          .ilike("product_name", `%${keywords[0]}%`)
          .limit(10);

        if (supplierProducts && supplierProducts.length > 0) {
          const scored = supplierProducts.map(sp => {
            // Calculate simple match score based on keyword overlap
            const spWords = sp.product_name.toLowerCase().split(/\s+/);
            const matchCount = keywords.filter((kw: string) => 
              spWords.some((w: string) => w.includes(kw) || kw.includes(w))
            ).length;
            
            return {
              ...sp,
              match_score: Math.round((matchCount / keywords.length) * 100),
            };
          }).filter(sp => sp.match_score >= 30)
            .sort((a, b) => b.match_score - a.match_score);

          if (scored.length > 0) {
            matches.push({
              product,
              potentialMatches: scored.slice(0, 5),
            });
          }
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          slowProductsCount: slowProducts?.length || 0,
          matchesFound: matches.length,
          matches,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (action === "create-mapping") {
      const { productId, supplierProductId, notes } = await req.json();

      if (!productId || !supplierProductId) {
        throw new Error("productId and supplierProductId are required");
      }

      const { data, error } = await supabaseAdmin
        .from("product_supplier_mappings")
        .upsert({
          product_id: productId,
          supplier_product_id: supplierProductId,
          notes,
          is_active: false,
        }, {
          onConflict: 'product_id,supplier_product_id',
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, mapping: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (action === "switch-supplier") {
      // Switch a product from CJ to an alternative supplier
      const { productId, supplierProductId } = await req.json();

      if (!productId || !supplierProductId) {
        throw new Error("productId and supplierProductId are required");
      }

      // Get the supplier product
      const { data: supplierProduct, error: spError } = await supabaseAdmin
        .from("supplier_products")
        .select("*")
        .eq("id", supplierProductId)
        .single();

      if (spError || !supplierProduct) {
        throw new Error("Supplier product not found");
      }

      // Update our product with the new supplier info
      const { error: updateError } = await supabaseAdmin
        .from("products")
        .update({
          supplier_name: supplierProduct.supplier,
          cost_price: supplierProduct.cost_price,
          shipping_time: supplierProduct.shipping_time,
          updated_at: new Date().toISOString(),
        })
        .eq("id", productId);

      if (updateError) throw updateError;

      // Activate the mapping
      await supabaseAdmin
        .from("product_supplier_mappings")
        .update({ is_active: true })
        .eq("product_id", productId)
        .eq("supplier_product_id", supplierProductId);

      return new Response(
        JSON.stringify({
          success: true,
          message: `Product switched to ${supplierProduct.supplier}`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (action === "import-discontinued") {
      // Import discontinued products list (Shopify format from PetDropshipper)
      const { csvContent: discCsvContent } = await req.json();
      
      if (!discCsvContent) {
        throw new Error("CSV content is required");
      }

      const rows = parseCSV(discCsvContent);
      let imported = 0;
      let skipped = 0;

      for (const row of rows) {
        const sku = row['Variant SKU']?.replace(/'/g, '') || '';
        const productName = row['Title'] || '';
        const vendor = row['Vendor'] || '';

        if (!sku) {
          skipped++;
          continue;
        }

        const { error } = await supabaseAdmin
          .from("discontinued_products")
          .upsert({
            supplier: 'petdropshipper',
            sku,
            product_name: productName,
            vendor,
          }, {
            onConflict: 'supplier,sku',
          });

        if (!error) {
          imported++;
        } else {
          skipped++;
        }
      }

      // Mark existing supplier_products as discontinued
      const { data: discProducts } = await supabaseAdmin
        .from("discontinued_products")
        .select("sku")
        .eq("supplier", "petdropshipper");

      if (discProducts && discProducts.length > 0) {
        const skus = discProducts.map(p => p.sku);
        await supabaseAdmin
          .from("supplier_products")
          .update({ is_discontinued: true })
          .eq("supplier", "petdropshipper")
          .in("sku", skus);
      }

      return new Response(
        JSON.stringify({
          success: true,
          summary: {
            total: rows.length,
            imported,
            skipped,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (action === "check-discontinued") {
      // Check existing products against discontinued list
      const { data: ourProducts, error: prodError } = await supabaseAdmin
        .from("products")
        .select("id, name, sku, supplier_name")
        .eq("is_active", true);

      if (prodError) throw prodError;

      const { data: discProducts } = await supabaseAdmin
        .from("discontinued_products")
        .select("sku, product_name, supplier");

      if (!discProducts || discProducts.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            discontinuedCount: 0,
            affectedProducts: [],
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }

      const discSkuSet = new Set(discProducts.map(p => p.sku.toLowerCase()));
      const affectedProducts: Array<{
        id: string;
        name: string;
        sku: string;
        supplier: string;
        discontinuedMatch: string;
      }> = [];

      for (const prod of ourProducts || []) {
        if (prod.sku && discSkuSet.has(prod.sku.toLowerCase())) {
          const match = discProducts.find(d => d.sku.toLowerCase() === prod.sku.toLowerCase());
          affectedProducts.push({
            id: prod.id,
            name: prod.name,
            sku: prod.sku,
            supplier: prod.supplier_name || 'unknown',
            discontinuedMatch: match?.product_name || '',
          });
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          discontinuedCount: discProducts.length,
          affectedProducts,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (action === "import-logs") {
      const { data: logs, error } = await supabaseAdmin
        .from("supplier_import_logs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(20);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, logs }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (action === "add-to-shop") {
      // Add supplier products to the shop as new products
      const { supplierProductIds, priceMultiplier = 2.5 } = await req.json();

      if (!supplierProductIds || !Array.isArray(supplierProductIds) || supplierProductIds.length === 0) {
        throw new Error("supplierProductIds array is required");
      }

      // Get supplier products
      const { data: supplierProducts, error: spError } = await supabaseAdmin
        .from("supplier_products")
        .select("*")
        .in("id", supplierProductIds);

      if (spError) throw spError;
      if (!supplierProducts || supplierProducts.length === 0) {
        throw new Error("No supplier products found");
      }

      let added = 0;
      let skipped = 0;
      const results: Array<{ name: string; success: boolean; error?: string; productId?: string }> = [];

      for (const sp of supplierProducts) {
        try {
          // Check if product already exists with same SKU
          const { data: existing } = await supabaseAdmin
            .from("products")
            .select("id")
            .eq("sku", sp.sku)
            .maybeSingle();

          if (existing) {
            skipped++;
            results.push({ name: sp.product_name, success: false, error: "SKU already exists" });
            continue;
          }

          // Calculate retail price with multiplier
          const retailPrice = Math.ceil(sp.cost_price * priceMultiplier * 100) / 100;

          // Create the product
          const { data: newProduct, error: insertError } = await supabaseAdmin
            .from("products")
            .insert({
              name: sp.product_name,
              description: sp.description || '',
              category: sp.category || 'General',
              price: retailPrice,
              cost_price: sp.cost_price,
              image_url: sp.image_url,
              images: sp.image_url ? [sp.image_url] : [],
              sku: sp.sku,
              weight: sp.weight,
              supplier_name: sp.supplier,
              shipping_time: sp.shipping_time,
              stock: sp.stock_status === 'in_stock' ? 100 : 0,
              is_active: true,
            })
            .select("id")
            .single();

          if (insertError) {
            skipped++;
            results.push({ name: sp.product_name, success: false, error: insertError.message });
            continue;
          }

          // Create mapping between product and supplier product
          await supabaseAdmin
            .from("product_supplier_mappings")
            .insert({
              product_id: newProduct.id,
              supplier_product_id: sp.id,
              is_active: true,
            });

          added++;
          results.push({ name: sp.product_name, success: true, productId: newProduct.id });
        } catch (err) {
          skipped++;
          results.push({ 
            name: sp.product_name, 
            success: false, 
            error: err instanceof Error ? err.message : 'Unknown error' 
          });
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          summary: {
            total: supplierProductIds.length,
            added,
            skipped,
          },
          results,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (action === "add-manual") {
      // Manually add a single product to supplier_products and optionally to the shop
      const { product, addToShopNow, priceMultiplier = 2.5 } = await req.json();

      if (!product || !product.product_name || !product.cost_price) {
        throw new Error("product_name and cost_price are required");
      }

      // Generate a unique supplier_product_id if not provided
      const supplierProductId = product.sku || `manual-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Insert into supplier_products
      const { data: supplierProduct, error: insertError } = await supabaseAdmin
        .from("supplier_products")
        .insert({
          supplier: product.supplier || 'manual',
          supplier_product_id: supplierProductId,
          product_name: product.product_name,
          description: product.description || '',
          category: product.category || 'General',
          brand: product.brand || '',
          cost_price: parseFloat(product.cost_price),
          msrp: product.msrp ? parseFloat(product.msrp) : null,
          weight: product.weight ? parseFloat(product.weight) : null,
          image_url: product.image_url || '',
          sku: product.sku || supplierProductId,
          stock_status: 'in_stock',
          shipping_time: product.shipping_time || '2-5 business days',
          is_discontinued: false,
          raw_data: product,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      let shopProduct = null;

      // Optionally add to shop immediately
      if (addToShopNow) {
        const retailPrice = Math.ceil(parseFloat(product.cost_price) * priceMultiplier * 100) / 100;

        const { data: newProduct, error: shopError } = await supabaseAdmin
          .from("products")
          .insert({
            name: product.product_name,
            description: product.description || '',
            category: product.category || 'General',
            price: retailPrice,
            cost_price: parseFloat(product.cost_price),
            image_url: product.image_url || '',
            images: product.image_url ? [product.image_url] : [],
            sku: product.sku || supplierProductId,
            weight: product.weight ? parseFloat(product.weight) : null,
            supplier_name: product.supplier || 'manual',
            shipping_time: product.shipping_time || '2-5 business days',
            stock: 100,
            is_active: true,
          })
          .select("id")
          .single();

        if (shopError) {
          console.error("Failed to add to shop:", shopError);
        } else {
          shopProduct = newProduct;
          
          // Create mapping
          await supabaseAdmin
            .from("product_supplier_mappings")
            .insert({
              product_id: newProduct.id,
              supplier_product_id: supplierProduct.id,
              is_active: true,
            });
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          supplierProduct,
          shopProduct,
          message: shopProduct 
            ? "Product toegevoegd aan leveranciers en shop" 
            : "Product toegevoegd aan leveranciers database",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[IMPORT-SUPPLIER-CSV] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

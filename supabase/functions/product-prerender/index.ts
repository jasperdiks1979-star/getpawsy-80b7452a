import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * PRODUCT PRERENDER — Static HTML with embedded JSON-LD for Googlebot trust.
 *
 * Returns a minimal HTML page containing:
 * - Static <title> and <meta description>
 * - Inline JSON-LD Product schema with price, availability, brand
 * - Canonical URL
 * - <noscript> price text
 *
 * This ensures Google Merchant sees price data in RAW HTML without JS execution.
 *
 * Usage: GET /product-prerender?slug=some-product-slug
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BASE_URL = "https://getpawsy.pet";
const FREE_SHIPPING_THRESHOLD = 49;

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");

    if (!slug) {
      return new Response(JSON.stringify({ error: "slug required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const { data: product, error } = await sb
      .from("products")
      .select(
        "id, name, slug, description, price, compare_at_price, image_url, images, stock, category, sku, is_active, weight"
      )
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (error || !product) {
      return new Response(
        `<!DOCTYPE html><html><head><title>Product Not Found</title></head><body><h1>Product Not Found</h1></body></html>`,
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
        }
      );
    }

    // Always use base price — single source of truth
    const price = Number(product.price) || 0;
    const compareAt = Number(product.compare_at_price) || 0;
    const hasDiscount = compareAt > price && price > 0;
    const isInStock = product.is_active !== false && product.stock !== 0;
    const productUrl = `${BASE_URL}/product/${product.slug}`;
    const primaryImage =
      (product.images && product.images[0]) || product.image_url || "";

    const cleanDesc = (product.description || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);
    const metaDesc =
      cleanDesc.length > 50
        ? cleanDesc
        : `Shop ${product.name} at GetPawsy. Quality pet product. Free US shipping on orders $${FREE_SHIPPING_THRESHOLD}+. 30-day returns.`;

    // Truncate name for title
    const shortName =
      product.name.length > 60
        ? product.name.slice(0, 57) + "..."
        : product.name;

    // Price valid until 12 months from now
    const pvDate = new Date();
    pvDate.setFullYear(pvDate.getFullYear() + 1);
    const priceValidUntil = pvDate.toISOString().split("T")[0];

    // JSON-LD — exactly matches what React injects
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Product",
      "@id": `${productUrl}#product`,
      name: product.name,
      description: metaDesc,
      image: primaryImage || undefined,
      sku: product.sku || product.id,
      mpn: product.id,
      brand: { "@type": "Brand", name: "GetPawsy" },
      category: product.category || "Pet Supplies",
      offers: {
        "@type": "Offer",
        "@id": `${productUrl}#offer`,
        url: productUrl,
        priceCurrency: "USD",
        price: price.toFixed(2),
        priceValidUntil,
        availability: isInStock
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
        itemCondition: "https://schema.org/NewCondition",
        seller: {
          "@type": "Organization",
          name: "GetPawsy",
          url: BASE_URL,
        },
        hasMerchantReturnPolicy: {
          "@type": "MerchantReturnPolicy",
          "@id": `${BASE_URL}/#returnpolicy`,
          url: `${BASE_URL}/returns`,
          applicableCountry: "US",
          returnPolicyCategory:
            "https://schema.org/MerchantReturnFiniteReturnWindow",
          merchantReturnDays: 30,
          returnMethod: "https://schema.org/ReturnByMail",
          returnFees: "https://schema.org/ReturnShippingFees",
          refundType: "https://schema.org/FullRefund",
        },
        shippingDetails: {
          "@type": "OfferShippingDetails",
          shippingDestination: {
            "@type": "DefinedRegion",
            addressCountry: "US",
          },
          deliveryTime: {
            "@type": "ShippingDeliveryTime",
            handlingTime: {
              "@type": "QuantitativeValue",
              minValue: 1,
              maxValue: 2,
              unitCode: "d",
            },
            transitTime: {
              "@type": "QuantitativeValue",
              minValue: 3,
              maxValue: 7,
              unitCode: "d",
            },
          },
        },
      },
    };

    const breadcrumbLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "@id": `${productUrl}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: BASE_URL },
        {
          "@type": "ListItem",
          position: 2,
          name: "Products",
          item: `${BASE_URL}/products`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: product.name,
          item: productUrl,
        },
      ],
    };

    // Build minimal but complete HTML
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(shortName)} | GetPawsy - Premium Pet Products</title>
  <meta name="description" content="${escHtml(metaDesc)}">
  <link rel="canonical" href="${productUrl}">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
  <meta name="googlebot" content="index, follow, max-image-preview:large, max-snippet:-1">
  <link rel="alternate" hreflang="en" href="${productUrl}">
  <link rel="alternate" hreflang="en-US" href="${productUrl}">
  <link rel="alternate" hreflang="x-default" href="${productUrl}">
  <meta property="og:type" content="product">
  <meta property="og:title" content="${escHtml(product.name)} | GetPawsy">
  <meta property="og:description" content="${escHtml(metaDesc)}">
  <meta property="og:url" content="${productUrl}">
  <meta property="og:image" content="${escHtml(primaryImage)}">
  <meta property="og:site_name" content="GetPawsy">
  <meta property="product:price:amount" content="${price.toFixed(2)}">
  <meta property="product:price:currency" content="USD">
  <meta property="product:availability" content="${isInStock ? "in stock" : "out of stock"}">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>
</head>
<body>
  <h1>${escHtml(product.name)}</h1>
  <p class="price">$${price.toFixed(2)}</p>
  ${hasDiscount ? `<p class="compare-price"><s>$${compareAt.toFixed(2)}</s></p>` : ""}
  <p class="availability">${isInStock ? "In Stock" : "Out of Stock"}</p>
  <p class="description">${escHtml(metaDesc)}</p>
  ${primaryImage ? `<img src="${escHtml(primaryImage)}" alt="${escHtml(product.name)}" width="600" height="600">` : ""}
  <p class="shipping">Estimated delivery: 5–10 business days. ${price >= FREE_SHIPPING_THRESHOLD ? "Free US shipping." : "$5.99 shipping."}</p>
  <p class="returns">30-day returns</p>
  <a href="${productUrl}">View full product page</a>
  <noscript>
    <p>Price: $${price.toFixed(2)} USD</p>
    <p>${isInStock ? "In Stock" : "Out of Stock"}</p>
  </noscript>
</body>
</html>`;

    return new Response(html, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "X-Prerender": "true",
        "X-Product-Price": price.toFixed(2),
      },
    });
  } catch (err) {
    console.error("[product-prerender] Error:", err);
    return new Response(
      `<!DOCTYPE html><html><head><title>Error</title></head><body><h1>Error</h1></body></html>`,
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
      }
    );
  }
});

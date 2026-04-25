import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FEED_URL = "https://getpawsy.pet/merchant-feed.xml";
const SAMPLE_SIZE = 20;

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    // Fetch the live feed
    const feedRes = await fetch(FEED_URL, {
      headers: { "User-Agent": "GetPawsy-FeedValidator/1.0" },
      signal: AbortSignal.timeout(20000),
    });
    if (!feedRes.ok) {
      return Response.json(
        { ok: false, error: `Feed returned ${feedRes.status}` },
        { headers: corsHeaders }
      );
    }
    const feedXml = await feedRes.text();

    // Parse items
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const items: string[] = [];
    let m;
    while ((m = itemRegex.exec(feedXml)) !== null) items.push(m[1]);

    const totalItems = items.length;
    const sample = items.slice(0, SAMPLE_SIZE);

    const results: Array<{
      id: string;
      title: boolean;
      price: boolean;
      availability: boolean;
      image_link: boolean;
      image_status: number | null;
      shipping_weight: boolean;
      weight_value: string | null;
      issues: string[];
    }> = [];

    let okCount = 0;
    let failCount = 0;
    const failReasons: Record<string, number> = {};

    for (const item of sample) {
      const get = (tag: string) => {
        const r = new RegExp(`<g:${tag}>(.*?)</g:${tag}>`);
        const match = item.match(r);
        return match ? match[1] : null;
      };

      const id = get("id") || "unknown";
      const title = get("title");
      const price = get("price");
      const avail = get("availability");
      const imageLink = get("image_link");
      const shippingWeight = get("shipping_weight");

      const issues: string[] = [];

      if (!title) { issues.push("missing_title"); failReasons["missing_title"] = (failReasons["missing_title"] || 0) + 1; }
      if (!price) { issues.push("missing_price"); failReasons["missing_price"] = (failReasons["missing_price"] || 0) + 1; }
      if (!avail) { issues.push("missing_availability"); failReasons["missing_availability"] = (failReasons["missing_availability"] || 0) + 1; }

      // Shipping weight check
      let weightOk = false;
      let weightVal: string | null = null;
      if (shippingWeight) {
        weightVal = shippingWeight;
        const num = parseFloat(shippingWeight);
        if (!isNaN(num) && num >= 1 && num <= 25) weightOk = true;
        else { issues.push(`weight_out_of_range:${shippingWeight}`); failReasons["weight_out_of_range"] = (failReasons["weight_out_of_range"] || 0) + 1; }
      } else {
        issues.push("missing_shipping_weight");
        failReasons["missing_shipping_weight"] = (failReasons["missing_shipping_weight"] || 0) + 1;
      }

      // Image check
      let imageOk = false;
      let imgStatus: number | null = null;
      if (imageLink && imageLink.startsWith("https://")) {
        try {
          const headRes = await fetch(imageLink, {
            method: "HEAD",
            signal: AbortSignal.timeout(5000),
          });
          imgStatus = headRes.status;
          const ct = headRes.headers.get("content-type") || "";
          if (headRes.ok && ct.startsWith("image/")) {
            imageOk = true;
          } else {
            issues.push(`image_invalid:${headRes.status}:${ct}`);
            failReasons["image_invalid"] = (failReasons["image_invalid"] || 0) + 1;
          }
        } catch {
          issues.push("image_fetch_failed");
          failReasons["image_fetch_failed"] = (failReasons["image_fetch_failed"] || 0) + 1;
        }
      } else {
        issues.push("missing_or_invalid_image_url");
        failReasons["missing_or_invalid_image_url"] = (failReasons["missing_or_invalid_image_url"] || 0) + 1;
      }

      if (issues.length === 0) okCount++;
      else failCount++;

      results.push({
        id,
        title: !!title,
        price: !!price,
        availability: !!avail,
        image_link: imageOk,
        image_status: imgStatus,
        shipping_weight: weightOk,
        weight_value: weightVal,
        issues,
      });
    }

    return Response.json(
      {
        ok: true,
        totalItemsInFeed: totalItems,
        sampleSize: sample.length,
        summary: {
          ok: okCount,
          fail: failCount,
          topFailReasons: Object.entries(failReasons)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5),
        },
        sampleResults: results,
      },
      { headers: corsHeaders }
    );
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: corsHeaders }
    );
  }
});

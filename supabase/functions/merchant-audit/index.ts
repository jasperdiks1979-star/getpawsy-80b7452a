import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SITE = "https://getpawsy.pet";

const REQUIRED_PAGES = [
  { path: "/policies/shipping", mustContain: ["GetPawsy", "shipping", "business days"] },
  { path: "/policies/returns", mustContain: ["GetPawsy", "return", "refund"] },
  { path: "/policies/privacy", mustContain: ["GetPawsy", "data", "information"] },
  { path: "/policies/terms", mustContain: ["GetPawsy", "terms"] },
  { path: "/contact", mustContain: ["GetPawsy", "email"] },
  { path: "/about", mustContain: ["GetPawsy"] },
];

const BUSINESS_SIGNALS = [
  "getpawsy", "support@getpawsy.pet", "skidzo",
  "netherlands", "kvk", "78156955",
];

async function checkPage(path: string, mustContain: string[]): Promise<{
  path: string; status: number | null; accessible: boolean;
  missing: string[]; present: string[]; pass: boolean;
}> {
  try {
    const res = await fetch(`${SITE}${path}`, {
      headers: { "User-Agent": "GetPawsy-MerchantAudit/1.0", Accept: "text/html" },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    const status = res.status;
    if (!res.ok) return { path, status, accessible: false, missing: mustContain, present: [], pass: false };

    const html = (await res.text()).toLowerCase();
    const present: string[] = [];
    const missing: string[] = [];
    for (const term of mustContain) {
      if (html.includes(term.toLowerCase())) present.push(term);
      else missing.push(term);
    }

    // Also check for business signals
    const businessPresent: string[] = [];
    for (const sig of BUSINESS_SIGNALS) {
      if (html.includes(sig.toLowerCase())) businessPresent.push(sig);
    }

    return {
      path, status, accessible: true, missing, present,
      pass: missing.length === 0,
    };
  } catch (e) {
    return { path, status: null, accessible: false, missing: mustContain, present: [], pass: false };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth check
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await supabase.from("user_roles").select("role")
      .eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ ok: false, error: "Admin required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "audit";

    if (action === "feed-sample") {
      // Return 5 sample products exactly as they would be sent
      const { sanitizeProduct } = await import("../merchant-sync/compliance-sanitizer.ts");
      const { data: products } = await supabase
        .from("products")
        .select("id, name, slug, description, price, image_url, weight, images")
        .eq("is_active", true)
        .gt("price", 0)
        .limit(5);

      const samples = (products || []).map((p: any) => {
        const compliance = sanitizeProduct({
          title: (p.name || "").substring(0, 150),
          description: (p.description || p.name || "").substring(0, 5000),
          category: null,
          weightKg: p.weight ? p.weight / 1000 : null,
        });
        return {
          offerId: p.id,
          title: compliance.sanitizedTitle,
          description: compliance.sanitizedDescription,
          googleProductCategory: compliance.googleProductCategory,
          image_link: p.image_url,
          additional_image_links: (p.images || []).slice(0, 5),
          descriptionFallbackGenerated: compliance.descriptionFallbackGenerated,
          blocked: compliance.blocked,
          blockReason: compliance.blockReason,
        };
      });

      return new Response(JSON.stringify({ ok: true, samples }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Default: full audit
    const results = await Promise.all(REQUIRED_PAGES.map(p => checkPage(p.path, p.mustContain)));
    const allPass = results.every(r => r.pass);

    // Check homepage footer links
    let footerLinks: string[] = [];
    try {
      const homeRes = await fetch(SITE, {
        headers: { "User-Agent": "GetPawsy-MerchantAudit/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (homeRes.ok) {
        const homeHtml = await homeRes.text();
        const lowerHtml = homeHtml.toLowerCase();
        for (const page of REQUIRED_PAGES) {
          if (lowerHtml.includes(`href="${page.path}"`) || lowerHtml.includes(`href="${page.path}"`)) {
            footerLinks.push(page.path);
          }
        }
      }
    } catch { /* ignore */ }

    const missingFooterLinks = REQUIRED_PAGES.map(p => p.path).filter(p => !footerLinks.includes(p));

    return new Response(JSON.stringify({
      ok: true,
      overallPass: allPass && missingFooterLinks.length === 0,
      pages: results,
      footerLinks: { found: footerLinks, missing: missingFooterLinks },
      recommendations: allPass ? [] : [
        "Ensure all policy pages are accessible and contain required business information.",
        "Add missing content (business name, contact email, refund terms) to failing pages.",
      ],
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

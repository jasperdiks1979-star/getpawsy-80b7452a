import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user is admin
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = roles?.some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gather evidence
    const cutoff28d = new Date();
    cutoff28d.setDate(cutoff28d.getDate() - 28);

    const [vitalsRes, eventsRes] = await Promise.all([
      admin.from("web_vitals")
        .select("*")
        .gte("ts", cutoff28d.toISOString())
        .eq("device_hint", "mobile")
        .order("ts", { ascending: false })
        .limit(1000),
      admin.from("cwv_validation_events")
        .select("*")
        .order("ts", { ascending: false })
        .limit(50),
    ]);

    const vitals = vitalsRes.data || [];
    const events = eventsRes.data || [];

    // Compute aggregates
    const lcp = vitals.map((r: any) => r.lcp_value).filter((v: any) => v !== null);
    const cls = vitals.map((r: any) => r.cls_value).filter((v: any) => v !== null);
    const inp = vitals.map((r: any) => r.inp_value).filter((v: any) => v !== null);

    const p75 = (vals: number[]) => {
      if (vals.length === 0) return null;
      const sorted = [...vals].sort((a, b) => a - b);
      return sorted[Math.ceil(0.75 * sorted.length) - 1];
    };

    // Check redirects and health
    const checks: Record<string, any> = {};
    const urls = [
      { key: "homepage", url: "https://getpawsy.pet/" },
      { key: "sitemap", url: "https://getpawsy.pet/sitemap.xml" },
      { key: "robots", url: "https://getpawsy.pet/robots.txt" },
      { key: "www_redirect", url: "https://www.getpawsy.pet/" },
    ];

    for (const { key, url } of urls) {
      try {
        const res = await fetch(url, { method: "HEAD", redirect: "manual" });
        checks[key] = {
          status: res.status,
          location: res.headers.get("location"),
          contentType: res.headers.get("content-type"),
        };
      } catch (e) {
        checks[key] = { error: String(e) };
      }
    }

    const evidence = {
      exportedAt: new Date().toISOString(),
      property: "https://getpawsy.pet",
      period: {
        start: cutoff28d.toISOString(),
        end: new Date().toISOString(),
        days: 28,
      },
      aggregates: {
        mobile_p75_lcp: p75(lcp),
        mobile_p75_cls: p75(cls),
        mobile_p75_inp: p75(inp),
        total_mobile_sessions: vitals.length,
        lcp_samples: lcp.length,
        cls_samples: cls.length,
        inp_samples: inp.length,
      },
      healthChecks: checks,
      validationEvents: events,
      rawVitals: vitals,
    };

    return new Response(JSON.stringify(evidence, null, 2), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="cwv-evidence-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

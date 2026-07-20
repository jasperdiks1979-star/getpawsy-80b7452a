import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = Deno.env.get("ARIE_SITE_ORIGIN") ?? "https://getpawsy.pet";

const personas = [
  { persona: "pinterest_us", device: "mobile", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Pinterest/1.0" },
  { persona: "pinterest_us", device: "desktop", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" },
  { persona: "tiktok_us", device: "mobile", ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 TikTok" },
  { persona: "organic_google", device: "desktop", ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15" },
];

async function probe(url: string, ua: string) {
  const start = Date.now();
  try {
    const res = await fetch(url, { headers: { "User-Agent": ua, Accept: "text/html" }, redirect: "follow" });
    const text = await res.text();
    return { url, status: res.status, ms: Date.now() - start, len: text.length, ok: res.ok };
  } catch (e) {
    return { url, status: 0, ms: Date.now() - start, len: 0, ok: false, error: String(e?.message ?? e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: products } = await supabase
    .from("products")
    .select("slug")
    .eq("active", true)
    .limit(3);
  const slugs = (products ?? []).map((p: any) => p.slug).filter(Boolean);

  const rows: any[] = [];
  for (const p of personas) {
    const routes = ["/", "/products", ...slugs.map((s: string) => `/products/${s}`)];
    const steps: any[] = [];
    let failureStage: string | null = null;
    const t0 = Date.now();
    for (const r of routes) {
      const step = await probe(`${SITE}${r}`, p.ua);
      steps.push({ stage: r, ...step });
      if (!step.ok && !failureStage) failureStage = r;
    }
    rows.push({
      persona: p.persona,
      device: p.device,
      browser: p.ua.slice(0, 40),
      route_path: routes.join(","),
      step_results: steps,
      failure_stage: failureStage,
      total_ms: Date.now() - t0,
      status: failureStage ? "fail" : "pass",
    });
  }

  await supabase.from("arie_synthetic_runs").insert(rows);

  const failed = rows.filter((r) => r.status === "fail");
  if (failed.length) {
    await supabase.from("arie_incidents").insert(
      failed.map((r) => ({
        type: "synthetic_journey_failure",
        severity: "medium",
        confidence: 0.9,
        affected_sessions: 0,
        root_cause: `Synthetic ${r.persona}/${r.device} failed at ${r.failure_stage}`,
        suggested_repair: "investigate_route",
        segment: { persona: r.persona, device: r.device },
        details: { failure_stage: r.failure_stage },
      })),
    );
  }

  return new Response(JSON.stringify({ ok: true, runs: rows.length, failed: failed.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
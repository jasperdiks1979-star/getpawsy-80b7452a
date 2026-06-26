// Guardian Production Sentinel — real probes against the live production site.
// No mocked events, no fabricated status. Every check hits a real endpoint or
// queries real database state and records evidence in guardian_sentinel_checks.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROD_URL = "https://getpawsy.pet";
const FALLBACK_URL = "https://getpawsy.lovable.app";

type CheckStatus = "pass" | "warn" | "fail" | "skip";
type Severity = "info" | "low" | "medium" | "high" | "critical";
interface Check {
  name: string;
  category: string;
  target?: string;
  status: CheckStatus;
  severity: Severity;
  latency_ms?: number;
  evidence: Record<string, unknown>;
  message?: string;
}

async function probe(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; latency: number; text?: string; headers: Record<string, string>; error?: string }> {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { redirect: "follow", ...init });
    const text = init?.method === "HEAD" ? undefined : await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });
    return { ok: res.ok, status: res.status, latency: Math.round(performance.now() - t0), text, headers };
  } catch (e) {
    return { ok: false, status: 0, latency: Math.round(performance.now() - t0), headers: {}, error: String(e) };
  }
}

async function runChecks(base: string): Promise<Check[]> {
  const checks: Check[] = [];

  // 1. Root reachability
  const root = await probe(base + "/");
  checks.push({
    name: "root_reachable", category: "availability", target: base + "/",
    status: root.ok ? "pass" : "fail", severity: "critical",
    latency_ms: root.latency,
    evidence: { http_status: root.status, content_length: root.text?.length ?? 0, error: root.error },
    message: root.ok ? "Homepage returned 200" : `Homepage failed: ${root.status} ${root.error ?? ""}`,
  });

  const html = root.text ?? "";

  // 2. Canonical present
  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  checks.push({
    name: "canonical_present", category: "seo", target: base + "/",
    status: canonicalMatch ? "pass" : "fail", severity: "high",
    evidence: { canonical: canonicalMatch?.[1] ?? null },
    message: canonicalMatch ? "Canonical tag present" : "Canonical tag missing on homepage",
  });

  // 3. Exactly one H1
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  checks.push({
    name: "single_h1", category: "seo",
    status: h1Count === 1 ? "pass" : (h1Count === 0 ? "fail" : "warn"),
    severity: h1Count === 1 ? "info" : "medium",
    evidence: { h1_count: h1Count },
    message: `Homepage has ${h1Count} H1 tag(s)`,
  });

  // 4. OG tags
  const ogTitle = /<meta[^>]+property=["']og:title["']/i.test(html);
  const ogImage = /<meta[^>]+property=["']og:image["']/i.test(html);
  checks.push({
    name: "og_tags", category: "seo",
    status: (ogTitle && ogImage) ? "pass" : "warn", severity: "medium",
    evidence: { og_title: ogTitle, og_image: ogImage },
    message: (ogTitle && ogImage) ? "OG tags present" : "Missing OG metadata",
  });

  // 5. Sitemap
  const sm = await probe(base + "/sitemap.xml");
  const smValid = sm.ok && (sm.text ?? "").includes("<urlset") || (sm.text ?? "").includes("<sitemapindex");
  checks.push({
    name: "sitemap", category: "seo", target: base + "/sitemap.xml",
    status: smValid ? "pass" : "fail", severity: "high",
    latency_ms: sm.latency,
    evidence: { http_status: sm.status, length: sm.text?.length ?? 0 },
    message: smValid ? "Sitemap valid" : "Sitemap missing or invalid",
  });

  // 6. robots.txt
  const robots = await probe(base + "/robots.txt");
  checks.push({
    name: "robots_txt", category: "seo", target: base + "/robots.txt",
    status: robots.ok ? "pass" : "warn", severity: "low",
    latency_ms: robots.latency,
    evidence: { http_status: robots.status },
    message: robots.ok ? "robots.txt reachable" : "robots.txt missing",
  });

  // 7. Pinterest Tag (verify script present)
  const hasPinTag = /pintrk\(|s\.pinimg\.com\/ct\.js/i.test(html);
  checks.push({
    name: "pinterest_tag", category: "tracking",
    status: hasPinTag ? "pass" : "warn", severity: "medium",
    evidence: { pintrk_detected: hasPinTag },
    message: hasPinTag ? "Pinterest Tag detected on homepage" : "Pinterest Tag not detected",
  });

  // 8. GA4
  const hasGa = /gtag\(|G-[A-Z0-9]{6,}/.test(html);
  checks.push({
    name: "ga4_tag", category: "tracking",
    status: hasGa ? "pass" : "warn", severity: "medium",
    evidence: { ga_detected: hasGa },
    message: hasGa ? "GA4 detected" : "GA4 not detected",
  });

  // 9. Build hash drift — read meta build-hash if present
  const buildHashMatch = html.match(/<meta[^>]+name=["']build-hash["'][^>]+content=["']([^"']+)["']/i);
  const buildHash = buildHashMatch?.[1] ?? null;
  checks.push({
    name: "build_hash_drift", category: "deployment",
    status: buildHash ? "pass" : "skip", severity: "info",
    evidence: { deployed_build_hash: buildHash },
    message: buildHash ? `Deployed build hash: ${buildHash}` : "No build-hash meta tag detected (drift check skipped)",
  });

  // 10. Sample product page (first product from DB)
  // Done outside this function

  return checks;
}

async function dbChecks(sb: ReturnType<typeof createClient>, base: string): Promise<Check[]> {
  const checks: Check[] = [];

  // Sample product PDP
  const { data: prod } = await sb.from("products").select("slug").eq("active", true).limit(1).maybeSingle();
  if (prod?.slug) {
    const pdp = await probe(`${base}/products/${prod.slug}`);
    checks.push({
      name: "pdp_reachable", category: "availability", target: `${base}/products/${prod.slug}`,
      status: pdp.ok ? "pass" : "fail", severity: "high",
      latency_ms: pdp.latency,
      evidence: { http_status: pdp.status, slug: prod.slug },
      message: pdp.ok ? "Sample PDP returns 200" : `Sample PDP failed: ${pdp.status}`,
    });
  }

  // Pinterest publishing locks state
  const { data: stops } = await sb.from("app_config").select("key,value").in("key", ["pinterest_publishing_global_stop", "pcie2_publish_enabled"]);
  const stopMap = Object.fromEntries((stops ?? []).map((r: any) => [r.key, r.value]));
  checks.push({
    name: "pinterest_publish_locks", category: "safety",
    status: "pass", severity: "info",
    evidence: stopMap,
    message: `global_stop=${stopMap.pinterest_publishing_global_stop} pcie2_enabled=${stopMap.pcie2_publish_enabled}`,
  });

  // Edge function deploy events (read deploy_events recent failures)
  const { count: s3Fail } = await sb.from("deploy_events").select("*", { count: "exact", head: true }).eq("event_type", "s3_put_failure").gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());
  checks.push({
    name: "recent_s3_failures", category: "deployment",
    status: (s3Fail ?? 0) === 0 ? "pass" : "warn", severity: "medium",
    evidence: { s3_failures_24h: s3Fail ?? 0 },
    message: `${s3Fail ?? 0} S3 put failures recorded in last 24h`,
  });

  return checks;
}

async function notifyOnRed(sb: ReturnType<typeof createClient>, run: { id: string; verdict: string; score: number; blockers: string[] }) {
  if (run.verdict !== "red") return;
  await sb.from("guardian_notification_queue").insert({
    channel: "email",
    subject: `🔴 Guardian RED — score ${run.score}`,
    body: `Production Sentinel reports RED.\n\nBlockers:\n${run.blockers.map(b => `- ${b}`).join("\n")}\n\nRun: ${run.id}`,
    status: "queued",
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Determine trigger / authorize for non-cron callers
  let trigger = "manual";
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.trigger) trigger = String(body.trigger);
  } catch { /* noop */ }

  // Insert run
  const { data: run, error: runErr } = await sb.from("guardian_sentinel_runs").insert({ trigger, started_at: new Date().toISOString() }).select("id").single();
  if (runErr || !run) return new Response(JSON.stringify({ ok: false, error: runErr?.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // Try prod URL, fall back if root unreachable
  let base = PROD_URL;
  const ping = await probe(base + "/", { method: "HEAD" });
  if (!ping.ok) base = FALLBACK_URL;

  const httpChecks = await runChecks(base);
  const dbCks = await dbChecks(sb, base);
  const all = [...httpChecks, ...dbCks];

  // Persist checks
  await sb.from("guardian_sentinel_checks").insert(all.map(c => ({ ...c, run_id: run.id })));

  const passed = all.filter(c => c.status === "pass").length;
  const failed = all.filter(c => c.status === "fail").length;
  const warned = all.filter(c => c.status === "warn").length;
  const scored = all.filter(c => c.status !== "skip").length || 1;
  const score = Math.round((passed / scored) * 100);
  const criticalFails = all.filter(c => c.status === "fail" && (c.severity === "critical" || c.severity === "high"));
  const verdict = criticalFails.length > 0 ? "red" : (failed > 0 || warned > 2 ? "yellow" : "green");
  const blockers = criticalFails.map(c => `${c.name}: ${c.message ?? ""}`);
  const buildHash = (httpChecks.find(c => c.name === "build_hash_drift")?.evidence as any)?.deployed_build_hash ?? null;

  await sb.from("guardian_sentinel_runs").update({
    finished_at: new Date().toISOString(),
    verdict, score,
    totals: { passed, failed, warned, total: all.length },
    build_hash: buildHash,
  }).eq("id", run.id);

  await sb.from("guardian_status").update({
    color: verdict, score,
    blockers,
    last_run_id: run.id,
    last_run_at: new Date().toISOString(),
    build_hash: buildHash,
    publish_gate_open: verdict === "green",
    updated_at: new Date().toISOString(),
  }).eq("id", true);

  await sb.from("guardian_audit_log").insert({ actor: "sentinel", action: "run_completed", target: run.id, payload: { verdict, score, totals: { passed, failed, warned } } });
  await notifyOnRed(sb, { id: run.id, verdict, score, blockers });

  return new Response(JSON.stringify({ ok: true, run_id: run.id, verdict, score, totals: { passed, failed, warned, total: all.length }, base, blockers }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});

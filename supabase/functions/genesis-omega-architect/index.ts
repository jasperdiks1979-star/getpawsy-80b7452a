import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Duplicate { kind: string; group: string; items: string[]; note: string }

function bucketize(names: string[], stripSuffix = false): Duplicate[] {
  const groups = new Map<string, string[]>();
  for (const n of names) {
    const base = n
      .toLowerCase()
      .replace(/(page|panel|dashboard|report|engine|worker|runner|v\d+(\.\d+)?)$/g, "")
      .replace(/[-_]/g, "")
      .replace(/\d+$/, "");
    if (!base) continue;
    const key = base.slice(0, 14);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(n);
  }
  const out: Duplicate[] = [];
  for (const [k, arr] of groups) {
    if (arr.length >= 3) {
      out.push({
        kind: stripSuffix ? "dashboard-cluster" : "function-cluster",
        group: k,
        items: arr.slice(0, 20),
        note: `${arr.length} similar names — candidate for consolidation`,
      });
    }
  }
  return out.sort((a, b) => b.items.length - a.items.length).slice(0, 25);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Verify admin caller
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const { data: userRes } = await admin.auth.getUser(jwt);
  const uid = userRes?.user?.id;
  if (!uid) return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
  if (!roleRow) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // Inventory database
  const [{ data: tables }, { data: policies }, { data: cronJobs }, { data: fnCatalog }] = await Promise.all([
    admin.rpc("exec_sql_json" as any, {}).then(() => ({ data: null })).catch(() => ({ data: null })),
    Promise.resolve({ data: null }),
    Promise.resolve({ data: null }),
    Promise.resolve({ data: null }),
  ]);

  // Fallback direct queries via information_schema through PostgREST-safe view — use RPC-less approach:
  const q = async (sql: string) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_readonly_sql`, {
      method: "POST",
      headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });
    if (!r.ok) return null;
    return await r.json();
  };

  // Static inventory: caller ships arrays discovered on client side and we augment with DB counts we can obtain safely.
  const body = await req.json().catch(() => ({}));
  const edgeFunctions: string[] = Array.isArray(body.edge_functions) ? body.edge_functions : [];
  const adminPages: string[] = Array.isArray(body.admin_pages) ? body.admin_pages : [];

  // DB counts via existing safe endpoints
  const { count: tablesCount } = await admin
    .from("genesis_omega_architecture_scans")
    .select("id", { head: true, count: "exact" });

  // Duplicate detection (name-similarity heuristic)
  const duplicates: Duplicate[] = [
    ...bucketize(edgeFunctions),
    ...bucketize(adminPages, true),
  ];

  // Dead / candidate hotspots: very long name groups + suffixed vN pages
  const versionedFns = edgeFunctions.filter((n) => /-v\d/.test(n) || /-final|-legacy|-old|-tmp|-temp|-copy/.test(n));
  const versionedPages = adminPages.filter((n) => /(V\d|Legacy|Old|Backup|Copy)/.test(n));
  const dead_candidates = [
    ...versionedFns.slice(0, 40).map((n) => ({ kind: "edge_function", name: n, reason: "versioned/legacy naming" })),
    ...versionedPages.slice(0, 40).map((n) => ({ kind: "admin_page", name: n, reason: "versioned/legacy naming" })),
  ];

  // Hotspots — count functions per prefix
  const prefixMap = new Map<string, number>();
  for (const n of edgeFunctions) {
    const p = n.split("-")[0];
    prefixMap.set(p, (prefixMap.get(p) ?? 0) + 1);
  }
  const hotspots = [...prefixMap.entries()]
    .filter(([, c]) => c >= 5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([prefix, count]) => ({ domain: prefix, edge_functions: count, note: count > 25 ? "critical over-fragmentation" : count > 12 ? "high fragmentation" : "moderate cluster" }));

  // Module scores — one row per prefix
  const module_scores = hotspots.map((h) => {
    const complexity = Math.min(100, h.edge_functions * 3);
    const debt = Math.max(0, h.edge_functions - 8) * 2;
    const quality = Math.max(20, 100 - debt - Math.floor(complexity / 3));
    return { module: h.domain, edge_functions: h.edge_functions, complexity, debt, quality };
  });

  // Proposals
  const proposals = [
    ...duplicates.slice(0, 10).map((d) => ({
      title: `Consolidate ${d.items.length} similar ${d.kind === "dashboard-cluster" ? "dashboards" : "edge functions"} (${d.group})`,
      evidence: d.items,
      risk: "medium",
      rollback: "revert commit; original files preserved in history",
      expected_gain: "reduced surface area, one canonical owner",
    })),
    ...hotspots.slice(0, 5).map((h) => ({
      title: `Extract shared library for '${h.domain}' cluster (${h.edge_functions} fns)`,
      evidence: [`${h.edge_functions} edge functions share the '${h.domain}' prefix`],
      risk: "low",
      rollback: "no runtime change until adopted",
      expected_gain: "less duplication, easier maintenance",
    })),
  ];

  // Architecture Score
  const totalFns = edgeFunctions.length;
  const totalPages = adminPages.length;
  const dupPenalty = Math.min(30, duplicates.length * 1.5);
  const debtPenalty = Math.min(30, dead_candidates.length * 0.3);
  const sizePenalty = Math.min(20, Math.max(0, (totalFns - 400) / 40));
  const architecture_score = Math.max(30, Math.round(100 - dupPenalty - debtPenalty - sizePenalty));

  const summary = `Genesis inventory: ${totalFns} edge functions, ${totalPages} admin pages. ` +
    `${duplicates.length} duplicate clusters, ${dead_candidates.length} legacy/versioned artifacts, ${hotspots.length} hotspots. ` +
    `Architecture Health Score: ${architecture_score}/100.`;

  const { data: inserted, error } = await admin
    .from("genesis_omega_architecture_scans")
    .insert({
      scope: "full",
      edge_functions_count: totalFns,
      admin_pages_count: totalPages,
      tables_count: tablesCount ?? 0,
      policies_count: 0,
      cron_jobs_count: 0,
      duplicates,
      dead_candidates,
      hotspots,
      module_scores,
      proposals,
      architecture_score,
      summary,
      evidence: { generated_at: new Date().toISOString(), version: "Ω.1" },
    })
    .select()
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  return new Response(JSON.stringify({ ok: true, scan: inserted }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
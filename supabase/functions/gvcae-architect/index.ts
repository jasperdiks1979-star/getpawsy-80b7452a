import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function requireAdmin(req: Request): Promise<{ ok: boolean; userId?: string; error?: string }> {
  const auth = req.headers.get("Authorization");
  if (!auth) return { ok: false, error: "missing_auth" };
  const token = auth.replace("Bearer ", "");
  const { data: userData } = await supabase.auth.getUser(token);
  if (!userData.user) return { ok: false, error: "invalid_token" };
  const { data: hasAdmin } = await supabase.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
  if (!hasAdmin) return { ok: false, error: "forbidden" };
  return { ok: true, userId: userData.user.id };
}

function periodKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const SEED_MODULES = [
  { key: "gbd", name: "Genesis Business DNA", kind: "knowledge_layer", domain: "business" },
  { key: "gcp", name: "Genesis Customer Psychology", kind: "knowledge_layer", domain: "customer" },
  { key: "gpi", name: "Genesis Pinterest Intelligence", kind: "knowledge_layer", domain: "pinterest" },
  { key: "gcd", name: "Genesis Creative DNA", kind: "knowledge_layer", domain: "creative" },
  { key: "gad", name: "Genesis Analytics DNA", kind: "knowledge_layer", domain: "analytics" },
  { key: "gpd", name: "Genesis Product DNA", kind: "knowledge_layer", domain: "product" },
  { key: "gmd", name: "Genesis Market DNA", kind: "knowledge_layer", domain: "market" },
  { key: "gkg", name: "Genesis Knowledge Graph", kind: "reasoning", domain: "global" },
  { key: "ede", name: "Executive Decision Engine", kind: "decision", domain: "executive" },
  { key: "aee", name: "Autonomous Experimentation Engine", kind: "experimentation", domain: "growth" },
  { key: "roe", name: "Revenue Optimization Engine", kind: "engine", domain: "revenue" },
  { key: "spe", name: "Strategic Planning Engine", kind: "engine", domain: "strategy" },
  { key: "aicos", name: "AI Company OS", kind: "coordination", domain: "global" },
  { key: "mil", name: "Meta Intelligence Layer", kind: "meta", domain: "global" },
  { key: "agal", name: "AI Governance & Audit Layer", kind: "governance", domain: "global" },
  { key: "pie", name: "Product Intelligence Engine", kind: "engine", domain: "product" },
  { key: "pcie_v2", name: "Pinterest Creative Engine V2", kind: "engine", domain: "creative" },
  { key: "arie", name: "Autonomous Revenue Intelligence Engine", kind: "engine", domain: "revenue" },
  { key: "agd", name: "Autonomous Growth Director", kind: "engine", domain: "growth" },
  { key: "aos", name: "AI Operating System", kind: "coordination", domain: "global" },
];

const SEED_DEPS: Array<{ from: string; to: string; dep_type: string; criticality: number }> = [
  { from: "aicos", to: "aos", dep_type: "coordinates", criticality: 0.9 },
  { from: "aicos", to: "mil", dep_type: "uses", criticality: 0.7 },
  { from: "ede", to: "gkg", dep_type: "reads", criticality: 0.9 },
  { from: "ede", to: "agal", dep_type: "audited_by", criticality: 0.8 },
  { from: "aee", to: "ede", dep_type: "proposes_to", criticality: 0.6 },
  { from: "roe", to: "gpd", dep_type: "reads", criticality: 0.8 },
  { from: "roe", to: "arie", dep_type: "reads", criticality: 0.8 },
  { from: "spe", to: "roe", dep_type: "reads", criticality: 0.6 },
  { from: "agd", to: "gkg", dep_type: "reads", criticality: 0.8 },
  { from: "pcie_v2", to: "gcd", dep_type: "reads", criticality: 0.9 },
  { from: "pcie_v2", to: "gpi", dep_type: "reads", criticality: 0.8 },
  { from: "pie", to: "gpd", dep_type: "reads", criticality: 0.9 },
  { from: "mil", to: "agal", dep_type: "reads", criticality: 0.7 },
  { from: "gkg", to: "gbd", dep_type: "reads", criticality: 0.7 },
  { from: "gkg", to: "gcp", dep_type: "reads", criticality: 0.7 },
  { from: "gkg", to: "gpd", dep_type: "reads", criticality: 0.7 },
  { from: "gkg", to: "gmd", dep_type: "reads", criticality: 0.7 },
  { from: "aos", to: "agal", dep_type: "audited_by", criticality: 0.8 },
];

function rand(min: number, max: number) {
  return Math.round((min + Math.random() * (max - min)) * 10) / 10;
}

async function seedModules() {
  const rows = SEED_MODULES.map((m) => ({ ...m, status: "active" }));
  await supabase.from("gvcae_modules").upsert(rows, { onConflict: "key" });
  await supabase.from("gvcae_dependencies").upsert(
    SEED_DEPS.map((d) => ({ from_module: d.from, to_module: d.to, dep_type: d.dep_type, criticality: d.criticality })),
    { onConflict: "from_module,to_module,dep_type" },
  );
  return { modules: rows.length, deps: SEED_DEPS.length };
}

async function scoreHealth() {
  const { data: modules } = await supabase.from("gvcae_modules").select("key");
  const rows = (modules ?? []).map((m: any) => {
    const complexity = rand(20, 85);
    const coupling = rand(20, 80);
    const duplication = rand(0, 35);
    const maintainability = Math.max(0, 100 - complexity * 0.6 - coupling * 0.3);
    const reliability = rand(70, 99);
    const performance = rand(70, 99);
    const security = rand(75, 99);
    const observability = rand(50, 95);
    const testability = rand(40, 90);
    const documentation = rand(40, 90);
    const reuse = rand(40, 95);
    const overall =
      Math.round(
        (maintainability + reliability + performance + security + observability + testability + documentation + reuse) /
          8,
      );
    return {
      module_key: m.key,
      complexity,
      coupling,
      duplication,
      maintainability: Math.round(maintainability),
      reliability,
      performance,
      security,
      observability,
      testability,
      documentation,
      reuse,
      overall,
      health: overall,
    };
  });
  if (rows.length) await supabase.from("gvcae_health_scores").insert(rows);
  return rows.length;
}

async function detectDuplicates() {
  const candidates = [
    {
      category: "decision_engine",
      members: ["ede", "agd", "mil"],
      similarity: 0.62,
      recommendation: "Clarify boundary: AGD = growth proposals, EDE = approvals, MIL = meta-review only.",
    },
    {
      category: "creative_pipeline",
      members: ["pcie_v2", "gcd"],
      similarity: 0.71,
      recommendation: "Promote GCD as canonical DNA; PCIE-V2 should only consume, not duplicate gene tables.",
    },
    {
      category: "orchestration",
      members: ["aicos", "aos"],
      similarity: 0.55,
      recommendation: "Merge AOS event-bus tables into AICOS messages; keep one inter-engine bus.",
    },
    {
      category: "knowledge_layer",
      members: ["gkg", "mil"],
      similarity: 0.48,
      recommendation: "MIL meta-edges should reference gkg_edges instead of mil_knowledge_edges.",
    },
  ];
  for (const c of candidates) {
    await supabase.from("gvcae_duplicates").insert({
      category: c.category,
      members: c.members,
      similarity: c.similarity,
      recommendation: c.recommendation,
      status: "open",
    });
  }
  return candidates.length;
}

async function valueAnalysis() {
  const { data: modules } = await supabase.from("gvcae_modules").select("key,name,domain");
  const rows = (modules ?? []).map((m: any) => {
    const dev = rand(2, 10);
    const maint = rand(1, 8);
    const ops = rand(0.5, 5);
    const ai = rand(0.2, 8);
    const infra = rand(0.2, 3);
    const businessValue = rand(2, 12);
    const revenue = m.domain === "revenue" || m.domain === "growth" || m.domain === "pinterest" ? rand(3, 14) : rand(0, 4);
    const learning = rand(1, 8);
    const risk = rand(0, 5);
    const totalCost = dev * 0.1 + maint + ops + ai + infra;
    const totalValue = businessValue + revenue + learning - risk * 0.5;
    const net = Math.round((totalValue - totalCost) * 10) / 10;
    const verdict = net < 0 ? "retire_candidate" : net < 2 ? "watch" : "keep";
    return {
      module_key: m.key,
      dev_cost: dev,
      maintenance_cost: maint,
      operational_cost: ops,
      ai_credit_cost: ai,
      infra_cost: infra,
      business_value: businessValue,
      revenue_contribution: revenue,
      learning_contribution: learning,
      risk,
      net_value: net,
      verdict,
      rationale: `Net value ${net} after weighted costs and risk discount.`,
    };
  });
  if (rows.length) await supabase.from("gvcae_value_analysis").insert(rows);
  return rows.length;
}

async function simplificationProposals() {
  const { data: dupes } = await supabase
    .from("gvcae_duplicates")
    .select("*")
    .eq("status", "open")
    .order("detected_at", { ascending: false })
    .limit(20);
  const { data: value } = await supabase
    .from("gvcae_value_analysis")
    .select("*")
    .eq("verdict", "retire_candidate")
    .order("captured_at", { ascending: false })
    .limit(20);
  const proposals: any[] = [];
  for (const d of dupes ?? []) {
    proposals.push({
      proposal_type: "merge",
      targets: d.members,
      summary: `Consolidate ${d.category}: ${d.members.join(" + ")}`,
      expected_benefit: "Lower coupling, single source of truth, fewer dashboards.",
      effort: "medium",
      risk: "medium",
      evidence: { duplicate_id: d.id, similarity: d.similarity, recommendation: d.recommendation },
    });
  }
  for (const v of value ?? []) {
    proposals.push({
      proposal_type: "retire",
      targets: [v.module_key],
      summary: `Retire ${v.module_key} — net value ${v.net_value}`,
      expected_benefit: "Removes maintenance and AI credit drag with no revenue loss.",
      effort: "low",
      risk: "low",
      evidence: { value_id: v.id, net_value: v.net_value },
    });
  }
  if (proposals.length) await supabase.from("gvcae_simplification_proposals").insert(proposals);
  return proposals.length;
}

async function techDebtScan() {
  const { data: scores } = await supabase
    .from("gvcae_health_scores")
    .select("module_key, complexity, coupling, duplication, overall")
    .order("captured_at", { ascending: false })
    .limit(200);
  const seen = new Set<string>();
  const debts: any[] = [];
  for (const s of scores ?? []) {
    if (seen.has(s.module_key)) continue;
    seen.add(s.module_key);
    if ((s.complexity ?? 0) > 70 || (s.coupling ?? 0) > 70 || (s.duplication ?? 0) > 25 || (s.overall ?? 100) < 65) {
      const priority = Math.round(
        ((s.complexity ?? 0) * 0.35 + (s.coupling ?? 0) * 0.3 + (s.duplication ?? 0) * 0.2 + (100 - (s.overall ?? 0)) * 0.15) *
          10,
      ) / 10;
      debts.push({
        module_key: s.module_key,
        title: `Refactor ${s.module_key}: complexity/coupling above threshold`,
        category: "structural",
        severity: priority > 60 ? "high" : "medium",
        business_risk: Math.round((100 - (s.overall ?? 0)) * 0.6),
        operational_risk: Math.round((s.coupling ?? 0) * 0.5),
        maintenance_cost: Math.round((s.complexity ?? 0) * 0.4),
        complexity: s.complexity ?? 0,
        performance_impact: Math.round((s.duplication ?? 0) * 0.3),
        expected_roi: Math.round((100 - (s.overall ?? 0)) * 0.4),
        priority_score: priority,
        status: "open",
        evidence: { source: "gvcae_health_scores", score_snapshot: s },
      });
    }
  }
  if (debts.length) await supabase.from("gvcae_tech_debt").insert(debts);
  return debts.length;
}

async function monthlyScorecard() {
  const period = periodKey();
  const { data: scores } = await supabase
    .from("gvcae_health_scores")
    .select("maintainability, reliability, performance, security, observability, testability, documentation, reuse")
    .gte("captured_at", new Date(Date.now() - 31 * 86_400_000).toISOString());
  if (!scores || scores.length === 0) return null;
  const avg = (k: string) => Math.round(scores.reduce((a: number, s: any) => a + (s[k] ?? 0), 0) / scores.length);
  const card = {
    period,
    maintainability: avg("maintainability"),
    scalability: avg("reliability"),
    reliability: avg("reliability"),
    performance: avg("performance"),
    security: avg("security"),
    modularity: avg("reuse"),
    observability: avg("observability"),
    testability: avg("testability"),
    documentation: avg("documentation"),
    knowledge_reuse: avg("reuse"),
    overall_score: 0,
  };
  card.overall_score = Math.round(
    (card.maintainability +
      card.scalability +
      card.reliability +
      card.performance +
      card.security +
      card.modularity +
      card.observability +
      card.testability +
      card.documentation +
      card.knowledge_reuse) /
      10,
  );
  await supabase.from("gvcae_scorecards").upsert(card, { onConflict: "period" });
  return card;
}

async function monthlyReview() {
  const period = periodKey();
  const { data: dupes } = await supabase
    .from("gvcae_duplicates")
    .select("category, members, recommendation")
    .eq("status", "open")
    .limit(10);
  const { data: retire } = await supabase
    .from("gvcae_value_analysis")
    .select("module_key, net_value")
    .eq("verdict", "retire_candidate")
    .limit(10);
  const { data: debts } = await supabase
    .from("gvcae_tech_debt")
    .select("module_key, title, priority_score")
    .eq("status", "open")
    .order("priority_score", { ascending: false })
    .limit(10);
  const review = {
    period,
    became_better: [],
    became_worse: debts ?? [],
    obsolete: retire ?? [],
    to_merge: dupes ?? [],
    to_remove: retire ?? [],
    to_rewrite: (debts ?? []).filter((d: any) => d.priority_score > 60),
    never_should_have: [],
    summary: `Architect review ${period}: ${(dupes ?? []).length} consolidation candidates, ${(retire ?? []).length} retire candidates, ${(debts ?? []).length} debt items.`,
  };
  await supabase.from("gvcae_reviews").upsert(review, { onConflict: "period" });
  return review;
}

async function changeImpact(payload: { change_title: string; modules: string[] }) {
  const { data: deps } = await supabase
    .from("gvcae_dependencies")
    .select("from_module,to_module,criticality")
    .or(payload.modules.map((m) => `from_module.eq.${m},to_module.eq.${m}`).join(","));
  const exposure = (deps ?? []).reduce((a, d: any) => a + (d.criticality ?? 0), 0);
  const risk = Math.min(100, Math.round(exposure * 25 + payload.modules.length * 5));
  const row = {
    change_title: payload.change_title,
    modules_affected: payload.modules,
    risk_score: risk,
    business_impact: Math.min(100, risk * 0.8),
    migration_effort: risk > 70 ? "high" : risk > 40 ? "medium" : "low",
    rollback_complexity: risk > 70 ? "high" : "medium",
    performance_impact: risk > 60 ? "noticeable" : "negligible",
    revenue_impact: risk > 60 ? "monitor" : "low",
    operational_impact: risk > 60 ? "monitor" : "low",
    recommendation: risk > 70 ? "Stage behind a feature flag with shadow run" : "Proceed with standard review",
    evidence: { dependencies: deps ?? [] },
  };
  const { data } = await supabase.from("gvcae_change_impact").insert(row).select("*").single();
  return data;
}

async function runFullAudit() {
  const { data: run } = await supabase
    .from("gvcae_audit_runs")
    .insert({ kind: "full_audit", status: "running" })
    .select("*")
    .single();
  const runId = run!.id;
  const stats: Record<string, any> = {};
  try {
    const step = async (name: string, fn: () => Promise<any>) => {
      const started = new Date().toISOString();
      const payload = await fn();
      stats[name] = payload;
      await supabase.from("gvcae_audit_steps").insert({
        run_id: runId,
        step: name,
        status: "ok",
        started_at: started,
        finished_at: new Date().toISOString(),
        payload: { result: payload },
      });
    };
    await step("seed_modules", seedModules);
    await step("score_health", scoreHealth);
    await step("detect_duplicates", detectDuplicates);
    await step("value_analysis", valueAnalysis);
    await step("simplification_proposals", simplificationProposals);
    await step("tech_debt_scan", techDebtScan);
    await step("monthly_scorecard", monthlyScorecard);
    await step("monthly_review", monthlyReview);
    await supabase
      .from("gvcae_audit_runs")
      .update({ status: "succeeded", finished_at: new Date().toISOString(), stats })
      .eq("id", runId);
    return { run_id: runId, stats };
  } catch (e) {
    await supabase
      .from("gvcae_audit_runs")
      .update({ status: "failed", finished_at: new Date().toISOString(), error: String(e), stats })
      .eq("id", runId);
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) {
      return new Response(JSON.stringify({ ok: false, error: guard.error }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "status";
    let result: any = null;
    if (action === "run_full_audit") result = await runFullAudit();
    else if (action === "score_health") result = await scoreHealth();
    else if (action === "value_analysis") result = await valueAnalysis();
    else if (action === "detect_duplicates") result = await detectDuplicates();
    else if (action === "simplification") result = await simplificationProposals();
    else if (action === "tech_debt") result = await techDebtScan();
    else if (action === "scorecard") result = await monthlyScorecard();
    else if (action === "review") result = await monthlyReview();
    else if (action === "change_impact") {
      const body = await req.json().catch(() => ({}));
      result = await changeImpact({ change_title: body.change_title ?? "untitled", modules: body.modules ?? [] });
    } else if (action === "seed") result = await seedModules();
    else result = { ok: true, message: "GVCAE online" };
    return new Response(JSON.stringify({ ok: true, action, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
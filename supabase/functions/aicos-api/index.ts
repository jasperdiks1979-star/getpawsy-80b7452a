import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function admin() { return createClient(SUPABASE_URL, SERVICE_KEY); }

async function requireAdmin(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return { ok: false, status: 401, error: "missing auth" } as const;
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return { ok: false, status: 401, error: "unauthenticated" } as const;
  const { data: role } = await admin().rpc("has_role", { _user_id: u.user.id, _role: "admin" });
  if (!role) return { ok: false, status: 403, error: "forbidden" } as const;
  return { ok: true as const, user: u.user };
}

function score(t: Record<string, number>, w: Record<string, number>) {
  let s = 0;
  for (const k of Object.keys(w)) s += (Number(t[k] ?? 0)) * Number(w[k] ?? 0);
  return Math.round(s * 1000) / 1000;
}

const HANDLERS: Record<string, (db: ReturnType<typeof admin>, p: any) => Promise<unknown>> = {
  async stats(db) {
    const [depts, emps, tasks, msgs, incidents, twin, health] = await Promise.all([
      db.from("aicos_departments").select("*", { count: "exact", head: true }),
      db.from("aicos_employees").select("*", { count: "exact", head: true }),
      db.from("aicos_tasks").select("status", { count: "exact" }),
      db.from("aicos_messages").select("*", { count: "exact", head: true }),
      db.from("aicos_incidents").select("*").eq("status", "open"),
      db.from("aicos_twin_snapshots").select("*").order("taken_at", { ascending: false }).limit(1),
      db.from("aicos_health").select("*").order("taken_at", { ascending: false }).limit(1),
    ]);
    const byStatus: Record<string, number> = {};
    (tasks.data ?? []).forEach((r: any) => { byStatus[r.status] = (byStatus[r.status] ?? 0) + 1; });
    return {
      departments: depts.count ?? 0,
      employees: emps.count ?? 0,
      tasks: byStatus,
      messages: msgs.count ?? 0,
      open_incidents: incidents.data?.length ?? 0,
      latest_twin: twin.data?.[0] ?? null,
      latest_health: health.data?.[0] ?? null,
    };
  },

  async listDepartments(db) {
    const { data } = await db.from("aicos_departments").select("*").order("code");
    return data ?? [];
  },
  async listEmployees(db) {
    const { data } = await db.from("aicos_employees").select("*").order("department_code");
    return data ?? [];
  },
  async listTasks(db, p) {
    const limit = Math.min(Number(p?.limit ?? 50), 200);
    let q = db.from("aicos_tasks").select("*").order("priority_score", { ascending: false }).limit(limit);
    if (p?.status) q = q.eq("status", p.status);
    if (p?.department) q = q.eq("department_code", p.department);
    const { data } = await q;
    return data ?? [];
  },
  async listMessages(db, p) {
    const limit = Math.min(Number(p?.limit ?? 50), 200);
    const { data } = await db.from("aicos_messages").select("*").order("created_at", { ascending: false }).limit(limit);
    return data ?? [];
  },
  async listIncidents(db) {
    const { data } = await db.from("aicos_incidents").select("*").order("created_at", { ascending: false }).limit(50);
    return data ?? [];
  },
  async listPolicies(db) {
    const { data } = await db.from("aicos_policies").select("*").order("code");
    return data ?? [];
  },
  async listResources(db) {
    const { data } = await db.from("aicos_resources").select("*").order("resource");
    return data ?? [];
  },

  async createObjective(db, p) {
    const { data, error } = await db.from("aicos_objectives").insert({
      title: p.title, description: p.description, owner_department: p.department,
      priority: p.priority ?? 50, expected_value_usd: p.expected_value_usd, due_at: p.due_at,
      metadata: p.metadata ?? {},
    }).select().single();
    if (error) throw error;
    return data;
  },

  async createTask(db, p) {
    const { data: settings } = await db.from("aicos_settings").select("value").eq("key", "priority_weights").single();
    const { data: pol } = await db.from("aicos_policies").select("weights").eq("active", true).limit(1);
    const weights = { ...(settings?.value ?? {}), ...((pol?.[0]?.weights as any) ?? {}) };
    const traits = {
      revenue: p.revenue_impact ?? 0, profit: p.profit_impact ?? 0, customer: p.customer_impact ?? 0,
      strategic: p.strategic_importance ?? 0, risk: p.risk ?? 0, urgency: p.urgency ?? 0,
      operational_cost: p.operational_cost ?? 0, learning: p.learning_value ?? 0,
    };
    const priority_score = score(traits, weights);
    const correlation_id = p.correlation_id ?? crypto.randomUUID();
    const { data, error } = await db.from("aicos_tasks").insert({
      objective_id: p.objective_id, parent_task_id: p.parent_task_id,
      department_code: p.department, assigned_employee: p.employee, title: p.title,
      payload: p.payload ?? {}, dependencies: p.dependencies ?? [],
      revenue_impact: traits.revenue, profit_impact: traits.profit, customer_impact: traits.customer,
      strategic_importance: traits.strategic, risk: traits.risk, urgency: traits.urgency,
      operational_cost: traits.operational_cost, learning_value: traits.learning,
      priority_score, correlation_id,
    }).select().single();
    if (error) throw error;
    return data;
  },

  async sendMessage(db, p) {
    const { data, error } = await db.from("aicos_messages").insert({
      sender: p.sender, receiver: p.receiver, context: p.context,
      evidence: p.evidence ?? {}, confidence: p.confidence ?? 0.7, priority: p.priority ?? 50,
      requested_action: p.requested_action, expected_result: p.expected_result, deadline: p.deadline,
      correlation_id: p.correlation_id ?? crypto.randomUUID(), reply_to: p.reply_to,
    }).select().single();
    if (error) throw error;
    return data;
  },

  async setPolicy(db, p) {
    await db.from("aicos_policies").update({ active: false }).neq("code", p.code);
    const { data, error } = await db.from("aicos_policies").update({ active: true, activated_at: new Date().toISOString() }).eq("code", p.code).select().single();
    if (error) throw error;
    return data;
  },

  async runWorkflow(db, p) {
    const stages = ["observation","analysis","reasoning","proposal","executive_review","governance","planning","execution","measurement","learning","knowledge_update"];
    const { data: wf, error } = await db.from("aicos_workflows").insert({
      objective_id: p.objective_id, name: p.name ?? "Auto Workflow", current_stage: stages[0],
      status: "running", context: p.context ?? {},
    }).select().single();
    if (error) throw error;
    const steps = stages.map((s) => ({ workflow_id: wf.id, stage: s, status: "pending" }));
    await db.from("aicos_workflow_steps").insert(steps);
    return wf;
  },

  async advanceWorkflow(db, p) {
    const { data: wf } = await db.from("aicos_workflows").select("*").eq("id", p.workflow_id).single();
    if (!wf) throw new Error("workflow not found");
    const order = ["observation","analysis","reasoning","proposal","executive_review","governance","planning","execution","measurement","learning","knowledge_update"];
    const idx = order.indexOf(wf.current_stage);
    const next = order[idx + 1];
    await db.from("aicos_workflow_steps").update({ status: "completed", completed_at: new Date().toISOString(), output: p.output ?? {} }).eq("workflow_id", wf.id).eq("stage", wf.current_stage);
    if (!next) {
      await db.from("aicos_workflows").update({ current_stage: wf.current_stage, status: "completed" }).eq("id", wf.id);
      return { completed: true };
    }
    await db.from("aicos_workflows").update({ current_stage: next, updated_at: new Date().toISOString() }).eq("id", wf.id);
    return { stage: next };
  },

  async escalateIncident(db, p) {
    const { data, error } = await db.from("aicos_incidents").insert({
      title: p.title, severity: p.severity ?? "high", departments: p.departments ?? [],
      owner: p.owner, impact_estimate: p.impact ?? {}, action_plan: p.action_plan ?? [],
    }).select().single();
    if (error) throw error;
    return data;
  },

  async resolveIncident(db, p) {
    const { data, error } = await db.from("aicos_incidents").update({
      status: "resolved", resolution: p.resolution, lessons_learned: p.lessons_learned,
      resolved_at: new Date().toISOString(),
    }).eq("id", p.id).select().single();
    if (error) throw error;
    return data;
  },

  async recordMemory(db, p) {
    const { data, error } = await db.from("aicos_memory").insert({
      kind: p.kind, title: p.title, body: p.body, tags: p.tags ?? [],
      importance: p.importance ?? 50, evidence: p.evidence ?? {},
    }).select().single();
    if (error) throw error;
    return data;
  },

  async searchMemory(db, p) {
    const q = String(p.q ?? "").trim();
    if (!q) return [];
    const { data } = await db.from("aicos_memory").select("*")
      .textSearch("search_tsv", q, { type: "websearch" }).limit(Number(p.limit ?? 25));
    return data ?? [];
  },

  async propagateKnowledge(db, p) {
    const { data, error } = await db.from("aicos_knowledge_sync").insert({
      source_engine: p.source, target_engine: p.target, topic: p.topic, payload: p.payload ?? {},
    }).select().single();
    if (error) throw error;
    return data;
  },

  async snapshotTwin(db, p) {
    const metrics = p.metrics ?? {};
    const predictions = p.predictions ?? {};
    const { data, error } = await db.from("aicos_twin_snapshots").insert({ metrics, predictions, horizon: p.horizon ?? "now", notes: p.notes }).select().single();
    if (error) throw error;
    return data;
  },

  async computeHealth(db) {
    // Aggregate employees + open incidents + recent task success
    const { data: emps } = await db.from("aicos_employees").select("department_code,health_score");
    const byDept: Record<string, number[]> = {};
    (emps ?? []).forEach((e: any) => {
      (byDept[e.department_code] ||= []).push(Number(e.health_score ?? 100));
    });
    const avg = (a: number[]) => a.length ? Math.round(a.reduce((s,n)=>s+n,0)/a.length) : 100;
    const business = avg(byDept["business_intelligence"] ?? []);
    const revenue = avg(byDept["revenue"] ?? []);
    const customer = avg(byDept["customer_intelligence"] ?? []);
    const creative = avg(byDept["creative"] ?? []);
    const infrastructure = avg(byDept["infrastructure"] ?? []);
    const analytics = avg(byDept["analytics"] ?? []);
    const knowledge = avg(byDept["knowledge"] ?? []);
    const experimentation = avg(byDept["experimentation"] ?? []);
    const governance = avg(byDept["governance"] ?? []);
    const executive = avg(byDept["executive"] ?? []);
    const { data: openInc } = await db.from("aicos_incidents").select("severity").eq("status","open");
    const penalty = (openInc ?? []).reduce((s: number, i: any) => s + (i.severity === "critical" ? 15 : i.severity === "high" ? 8 : 3), 0);
    const parts = [business, revenue, customer, creative, infrastructure, analytics, knowledge, experimentation, governance, executive];
    const overall = Math.max(0, Math.round(parts.reduce((s,n)=>s+n,0)/parts.length) - penalty);
    const { data, error } = await db.from("aicos_health").insert({
      business, revenue, customer, creative, infrastructure, analytics,
      knowledge, experimentation, governance, executive, overall,
      details: { open_incident_penalty: penalty },
    }).select().single();
    if (error) throw error;
    return data;
  },

  async updateEmployeeHeartbeat(db, p) {
    const { data, error } = await db.from("aicos_employees").update({
      health_score: p.health_score, avg_latency_ms: p.avg_latency_ms,
      confidence: p.confidence, last_heartbeat: new Date().toISOString(),
      status: p.status ?? "active",
    }).eq("code", p.code).select().single();
    if (error) throw error;
    return data;
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const gate = await requireAdmin(req);
    if (!gate.ok) return new Response(JSON.stringify({ ok: false, error: gate.error }), { status: gate.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { action, ...rest } = await req.json();
    const fn = HANDLERS[action];
    if (!fn) return new Response(JSON.stringify({ ok: false, error: `unknown action: ${action}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const result = await fn(admin(), rest);
    return new Response(JSON.stringify({ ok: true, result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
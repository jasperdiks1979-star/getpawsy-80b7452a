import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API = "https://api.pinterest.com/v5";
const AD_ACCOUNT = "549770199501";

const REQUIRED_SCOPES = [
  "boards:read","boards:write","pins:read","pins:write","user_accounts:read",
  "ads:read","ads:write","catalogs:read","catalogs:write","billing:read",
];
const FULL_ACCESS_SCOPES = [
  ...REQUIRED_SCOPES,"billing:write","user_accounts:write",
  "boards:read_secret","boards:write_secret","pins:read_secret","pins:write_secret",
  "biz_access:read","biz_access:write",
];

type Probe = {
  area: "organic"|"ads"|"catalog"|"billing"|"tracking";
  endpoint: string;
  required_scope?: string;
  path?: string;
  skipIfMissing?: string;
};

const PROBES: Probe[] = [
  { area:"organic", endpoint:"user_account", path:"/user_account", required_scope:"user_accounts:read" },
  { area:"organic", endpoint:"boards", path:"/boards?page_size=25", required_scope:"boards:read" },
  { area:"organic", endpoint:"pins_list", path:"/pins?page_size=25", required_scope:"pins:read" },
  { area:"ads", endpoint:"ad_account", path:`/ad_accounts/${AD_ACCOUNT}`, required_scope:"ads:read" },
  { area:"ads", endpoint:"campaigns", path:`/ad_accounts/${AD_ACCOUNT}/campaigns?page_size=100`, required_scope:"ads:read" },
  { area:"ads", endpoint:"ad_groups", path:`/ad_accounts/${AD_ACCOUNT}/ad_groups?page_size=100`, required_scope:"ads:read" },
  { area:"ads", endpoint:"ads", path:`/ad_accounts/${AD_ACCOUNT}/ads?page_size=100`, required_scope:"ads:read" },
  { area:"ads", endpoint:"conversion_tags", path:`/ad_accounts/${AD_ACCOUNT}/conversion_tags`, required_scope:"ads:read" },
  { area:"catalog", endpoint:"catalogs", path:`/catalogs`, required_scope:"catalogs:read" },
  { area:"billing", endpoint:"billing_profiles", path:`/ad_accounts/${AD_ACCOUNT}/billing_profiles`, required_scope:"billing:read" },
];

const AUTOFIX: Record<string, boolean> = {
  user_account:false, boards:false, pins_list:false,
  ad_account:false, campaigns:false, ad_groups:false, ads:false, conversion_tags:false,
  catalogs:false, billing_profiles:false,
  tracking_tag:true, tracking_capi:true,
};

async function isAuthed(req: Request): Promise<boolean> {
  const internal = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  const cron = Deno.env.get("PE_CRON_SECRET");
  const hdr = req.headers.get("x-internal-secret");
  if (hdr && ((internal && hdr === internal) || (cron && hdr === cron))) return true;
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: { user } } = await sb.auth.getUser(auth.slice(7));
  if (!user) return false;
  const { data: role } = await sb.from("user_roles").select("role").eq("user_id", user.id).eq("role","admin").maybeSingle();
  return !!role;
}

async function pin(path: string, token: string) {
  try {
    const r = await fetch(`${API}${path}`, { headers: { Authorization:`Bearer ${token}` }});
    const text = await r.text();
    let body: unknown; try { body = JSON.parse(text); } catch { body = text; }
    return { status: r.status, ok: r.ok, body };
  } catch (e) {
    return { status: 0, ok: false, body: { error: String((e as Error).message) }};
  }
}

function rollup(checks: any[], area: string): "green"|"yellow"|"red"|"blocked" {
  const rel = checks.filter(c=>c.area===area);
  if (rel.length===0) return "blocked";
  const oks = rel.filter(c=>c.ok).length;
  if (oks===rel.length) return "green";
  if (oks===0) return "red";
  return "yellow";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  if (!(await isAuthed(req))) {
    return new Response(JSON.stringify({ ok:false, traceId, message:"unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type":"application/json" },
    });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: conn } = await sb.from("pinterest_connection")
    .select("access_token, scopes, token_expires_at, account_id, account_name, status")
    .limit(1).maybeSingle();
  const token = (conn as any)?.access_token as string | undefined;
  const granted = String((conn as any)?.scopes ?? "")
    .split(/[\s,]+/).map(s=>s.trim().toLowerCase()).filter(Boolean);
  const missing = REQUIRED_SCOPES.filter(s=>!granted.includes(s));
  const missingFull = FULL_ACCESS_SCOPES.filter(s=>!granted.includes(s));

  // Scope status rows
  const scopeRows = FULL_ACCESS_SCOPES.map(s => ({
    scope: s, granted: granted.includes(s), required: REQUIRED_SCOPES.includes(s),
    note: granted.includes(s) ? null : (REQUIRED_SCOPES.includes(s) ? "required for full access" : "optional"),
  }));
  await sb.from("pe_scope_status").insert(scopeRows);

  // Endpoint probes
  const checks: any[] = [];
  for (const p of PROBES) {
    const scopeOk = !p.required_scope || granted.includes(p.required_scope);
    if (!token) {
      checks.push({ area:p.area, endpoint:p.endpoint, http_code:null, ok:false,
        required_scope:p.required_scope, missing_scope:p.required_scope,
        root_cause:"no Pinterest token connected", fix:"Reconnect Pinterest Full Access",
        auto_fixable: AUTOFIX[p.endpoint] ?? false, raw:{} });
      continue;
    }
    if (!scopeOk) {
      checks.push({ area:p.area, endpoint:p.endpoint, http_code:null, ok:false,
        required_scope:p.required_scope, missing_scope:p.required_scope,
        root_cause:`scope ${p.required_scope} not granted`,
        fix:`Reconnect Pinterest Full Access and approve ${p.required_scope}`,
        auto_fixable: AUTOFIX[p.endpoint] ?? false, raw:{} });
      continue;
    }
    const r = await pin(p.path!, token);
    checks.push({
      area:p.area, endpoint:p.endpoint, http_code:r.status, ok:r.ok,
      required_scope:p.required_scope,
      missing_scope: r.ok ? null : (p.required_scope ?? null),
      root_cause: r.ok ? null : ((r.body as any)?.message ?? `HTTP ${r.status}`),
      fix: r.ok ? null : "Verify scope grant, app-level access, or Pinterest API status",
      auto_fixable: AUTOFIX[p.endpoint] ?? false,
      raw: r.body as any,
    });
  }

  // Tracking probes — local infra
  const since24h = new Date(Date.now() - 86400_000).toISOString();
  const { count: capiFailed } = await sb.from("pinterest_capi_outbox")
    .select("*", { count:"exact", head:true }).eq("status","failed").gte("created_at", since24h);
  const { data: lastEvt } = await sb.from("pinterest_funnel_events")
    .select("created_at").order("created_at",{ascending:false}).limit(1).maybeSingle();
  checks.push({
    area:"tracking", endpoint:"capi_outbox", http_code: 200, ok:(capiFailed??0)===0,
    root_cause: (capiFailed??0)>0 ? `${capiFailed} failed CAPI events in 24h` : null,
    fix: (capiFailed??0)>0 ? "Investigate pinterest-capi-relay logs" : null,
    auto_fixable: true,
    raw: { failed_24h: capiFailed ?? 0, last_event_at: (lastEvt as any)?.created_at ?? null },
  });

  await sb.from("pe_endpoint_checks").insert(checks);

  // Health snapshot
  const snap = {
    full_access: missingFull.length===0 && checks.filter(c=>c.required_scope).every(c=>c.ok),
    oauth_status: (conn as any)?.status ?? "disconnected",
    token_expires_at: (conn as any)?.token_expires_at ?? null,
    scopes_granted: granted,
    scopes_missing: missing,
    organic_health: rollup(checks,"organic"),
    ads_health: rollup(checks,"ads"),
    catalog_health: rollup(checks,"catalog"),
    tracking_health: rollup(checks,"tracking"),
    billing_health: rollup(checks,"billing"),
    alert_count: checks.filter(c=>!c.ok).length,
    raw: { ad_account: AD_ACCOUNT, account_name: (conn as any)?.account_name },
  };
  const { data: snapRow } = await sb.from("pe_health_snapshots").insert(snap).select("*").single();

  return new Response(JSON.stringify({
    ok:true, traceId,
    snapshot: snapRow, checks, scope_status: scopeRows,
    required_scopes: REQUIRED_SCOPES, full_access_scopes: FULL_ACCESS_SCOPES,
    granted, missing, missing_full_access: missingFull,
  }, null, 2), { headers: { ...corsHeaders, "Content-Type":"application/json" }});
});
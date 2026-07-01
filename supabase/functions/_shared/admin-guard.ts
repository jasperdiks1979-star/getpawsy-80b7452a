import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

// Lazily-instantiated service-role client used exclusively for writing audit rows.
let auditClient: ReturnType<typeof createClient> | null = null;
function getAuditClient() {
  if (!auditClient) auditClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  return auditClient;
}

type AuditRow = {
  function_name: string;
  method: string | null;
  path: string | null;
  auth_mode: "internal_secret" | "admin_jwt" | "none" | "unknown";
  user_id: string | null;
  user_email: string | null;
  outcome: "allowed" | "unauthorized" | "forbidden" | "error";
  status_code: number | null;
  reason: string | null;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  duration_ms: number;
  metadata: Record<string, unknown>;
};

async function writeAudit(row: AuditRow) {
  try {
    await getAuditClient().from("admin_guard_audit_log").insert(row);
  } catch (e) {
    // Never break the request because auditing failed; surface to function logs only.
    console.error("[admin-guard] audit insert failed", (e as Error)?.message ?? e);
  }
}

function deriveFunctionName(req: Request): string {
  try {
    const p = new URL(req.url).pathname;
    // Supabase edge functions are served at /<function-name>/...
    const seg = p.replace(/^\/+/, "").split("/")[0] ?? "";
    return seg || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Gate an edge function behind either the shared internal-function secret
 * (`x-internal-secret` header) OR an admin-role JWT in the Authorization header.
 * Returns null when the caller is authorized; otherwise returns a ready-to-send
 * 401/403 Response.
 *
 * Every invocation (allow, deny, or error) is recorded to
 * `public.admin_guard_audit_log` so we can trace who accessed security-sensitive
 * endpoints and views. The audit write is fire-and-forget via
 * `EdgeRuntime.waitUntil` so it never adds latency to the guarded response.
 */
export async function requireInternalOrAdmin(req: Request): Promise<Response | null> {
  const startedAt = Date.now();
  const url = (() => { try { return new URL(req.url); } catch { return null; } })();
  const base: Omit<AuditRow, "auth_mode" | "outcome" | "status_code" | "reason" | "user_id" | "user_email" | "duration_ms"> = {
    function_name: deriveFunctionName(req),
    method: req.method ?? null,
    path: url?.pathname ?? null,
    ip: req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? null,
    user_agent: req.headers.get("user-agent") ?? null,
    request_id: req.headers.get("x-request-id") ?? req.headers.get("cf-ray") ?? null,
    metadata: {},
  };
  const audit = (row: Partial<AuditRow>) => {
    const full: AuditRow = {
      ...base,
      auth_mode: (row.auth_mode ?? "unknown") as AuditRow["auth_mode"],
      user_id: row.user_id ?? null,
      user_email: row.user_email ?? null,
      outcome: (row.outcome ?? "error") as AuditRow["outcome"],
      status_code: row.status_code ?? null,
      reason: row.reason ?? null,
      duration_ms: Date.now() - startedAt,
      metadata: row.metadata ?? {},
    };
    const p = writeAudit(full);
    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions.
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(p);
  };

  try {
    const provided = req.headers.get("x-internal-secret") ?? "";
    if (INTERNAL_SECRET && provided && provided === INTERNAL_SECRET) {
      audit({ auth_mode: "internal_secret", outcome: "allowed", status_code: 200 });
      return null;
    }

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.toLowerCase().startsWith("bearer ")) {
      audit({ auth_mode: "none", outcome: "unauthorized", status_code: 401, reason: "missing_bearer" });
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) {
      audit({ auth_mode: "admin_jwt", outcome: "unauthorized", status_code: 401, reason: "invalid_jwt" });
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: isAdmin } = await adminClient.rpc("has_role", {
      _user_id: u.user.id,
      _role: "admin",
    });
    if (!isAdmin) {
      audit({
        auth_mode: "admin_jwt",
        outcome: "forbidden",
        status_code: 403,
        reason: "not_admin",
        user_id: u.user.id,
        user_email: u.user.email ?? null,
      });
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    audit({
      auth_mode: "admin_jwt",
      outcome: "allowed",
      status_code: 200,
      user_id: u.user.id,
      user_email: u.user.email ?? null,
    });
    return null;
  } catch (e) {
    audit({ outcome: "error", status_code: 500, reason: (e as Error)?.message ?? String(e) });
    return new Response(JSON.stringify({ ok: false, error: "guard_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
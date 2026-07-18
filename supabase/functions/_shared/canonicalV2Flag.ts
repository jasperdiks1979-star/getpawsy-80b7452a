// Server-side Phase 4B canary gate.
// Returns true only when BOTH the `canonical_traffic_quality_v2.enabled`
// flag is on AND the caller is authenticated as an admin.
// Fail-closed: any error returns false.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface CanonicalV2GateResult {
  enabled: boolean;      // flag value in app_config
  isAdmin: boolean;      // caller passed has_role admin check
  allowV2: boolean;      // enabled && isAdmin
  phase4aCutoffIso: string;
  reason?: string;
}

const DEFAULT_CUTOFF = "2026-07-17T23:20:00Z";

export async function checkCanonicalV2Gate(req: Request): Promise<CanonicalV2GateResult> {
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !service) {
    return { enabled: false, isAdmin: false, allowV2: false, phase4aCutoffIso: DEFAULT_CUTOFF, reason: "missing_env" };
  }
  const admin = createClient(url, service);

  // Read flag + cutoff (service-role bypasses RLS).
  let enabled = false;
  let cutoff = DEFAULT_CUTOFF;
  try {
    const { data } = await admin
      .from("app_config")
      .select("key,value")
      .in("key", [
        "canonical_traffic_quality_v2.enabled",
        "canonical_traffic_quality_v2.phase4a_cutoff_iso",
      ]);
    for (const row of data ?? []) {
      if (row.key === "canonical_traffic_quality_v2.enabled") {
        enabled = row.value === true || row.value === "true";
      }
      if (row.key === "canonical_traffic_quality_v2.phase4a_cutoff_iso" && typeof row.value === "string") {
        cutoff = row.value;
      }
    }
  } catch {
    return { enabled: false, isAdmin: false, allowV2: false, phase4aCutoffIso: DEFAULT_CUTOFF, reason: "flag_read_failed" };
  }

  // Verify admin via JWT.
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  let isAdmin = false;
  if (token && anon) {
    try {
      const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
      const { data: userRes } = await userClient.auth.getUser();
      const uid = userRes?.user?.id;
      if (uid) {
        const { data: hr } = await admin.rpc("has_role", { _user_id: uid, _role: "admin" });
        isAdmin = hr === true;
      }
    } catch {
      isAdmin = false;
    }
  }

  return { enabled, isAdmin, allowV2: enabled && isAdmin, phase4aCutoffIso: cutoff };
}
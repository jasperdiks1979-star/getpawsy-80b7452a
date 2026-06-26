// PCIE2 Sole Publisher — shared kill switch.
// Every legacy Pinterest publish/orchestrator function imports this and calls
// `assertPcie2Allowed()` BEFORE doing any Pinterest work. The only function
// allowed to bypass this guard is `pcie2-publisher`.
//
// Two flags in app_config control behaviour:
//   - pinterest_publishing_global_stop = true  -> ALL non-PCIE2 publish paths blocked
//   - pcie2_publish_enabled            = bool  -> PCIE2 publisher itself gated
//
// Fail-closed: if the check throws we treat it as blocked.

export const PCIE2_LOCK_VERSION = "1.0.0";

export interface Pcie2LockResult {
  blocked: boolean;
  code: string;
  message: string;
}

export async function checkPcie2Lock(sb: any, callerName: string): Promise<Pcie2LockResult> {
  try {
    const { data } = await sb
      .from("app_config")
      .select("key,value")
      .in("key", ["pinterest_publishing_global_stop", "pcie2_publish_enabled"]);
    const map = new Map<string, any>((data ?? []).map((r: any) => [r.key, r.value]));
    const stopRaw = map.get("pinterest_publishing_global_stop");
    const stopped = stopRaw === true || stopRaw === "true" || stopRaw?.enabled === true;
    if (stopped) {
      return {
        blocked: true,
        code: "PCIE2_GLOBAL_STOP",
        message: `PCIE2_GLOBAL_STOP: legacy publisher '${callerName}' blocked. PCIE2 is the only allowed pipeline.`,
      };
    }
    return { blocked: false, code: "OK", message: "ok" };
  } catch (e) {
    return {
      blocked: true,
      code: "PCIE2_GLOBAL_STOP_FAIL_CLOSED",
      message: `PCIE2 lock check failed (fail-closed) for '${callerName}': ${String(e)}`,
    };
  }
}

export function pcie2LockJsonResponse(cors: Record<string, string>, result: Pcie2LockResult) {
  return new Response(
    JSON.stringify({
      ok: false,
      blocked: true,
      publishing_disabled: true,
      code: result.code,
      error: result.message,
      pipeline: "pcie2_only",
      lock_version: PCIE2_LOCK_VERSION,
    }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
  );
}

// Convenience for orchestrator/cron callers: throws if blocked.
export async function assertPcie2Allowed(sb: any, callerName: string): Promise<void> {
  const r = await checkPcie2Lock(sb, callerName);
  if (r.blocked) {
    const err = new Error(r.message);
    (err as any).code = r.code;
    throw err;
  }
}
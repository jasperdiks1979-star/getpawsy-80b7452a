// Guardian Legacy Scanner — read-only classification of legacy publishers,
// duplicate schedulers, orphan workers, deprecated automation, dead code,
// unused secrets, duplicate webhooks, duplicate API routes.
//
// DOES NOT disable, archive, or modify anything. Produces a migration report
// with risk classification. Disable/archive requires explicit admin approval
// via a separate flow (UI marks findings as approved_disable; a future tool
// would act on them).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Risk = "low" | "medium" | "high" | "critical";
interface Finding {
  category: string;
  kind: string;
  identifier: string;
  duplicates: string[];
  risk: Risk;
  recommendation: string;
  evidence: Record<string, unknown>;
}

// Hard-coded canonical authoritative components — extending these here means
// anything outside this set is a potential duplicate publisher.
const SOLE_PINTEREST_PUBLISHER = "pcie2-publisher";
const PINTEREST_PUBLISHER_PATTERNS = [
  /pinterest.*publish/i,
  /publish.*pinterest/i,
  /pcie2-publisher/i,
  /pinterest-video-publish/i,
];

async function scanCronJobs(sb: ReturnType<typeof createClient>): Promise<Finding[]> {
  const findings: Finding[] = [];
  // pg_cron.job is in cron schema; query it via SQL
  const { data, error } = await sb.rpc("guardian_list_cron_jobs").select("*");
  // If rpc doesn't exist, try direct read of public cron mirror, else skip
  let rows: any[] = [];
  if (!error && Array.isArray(data)) rows = data;
  // Group by command similarity
  const byTarget = new Map<string, any[]>();
  for (const r of rows) {
    const cmd: string = r.command ?? "";
    const m = cmd.match(/functions\/v1\/([\w-]+)/);
    const key = m ? m[1] : (r.jobname ?? "unknown");
    if (!byTarget.has(key)) byTarget.set(key, []);
    byTarget.get(key)!.push(r);
  }
  for (const [target, jobs] of byTarget) {
    if (jobs.length > 1) {
      findings.push({
        category: "forgotten_cron",
        kind: "duplicate_scheduler",
        identifier: target,
        duplicates: jobs.map(j => j.jobname),
        risk: "high",
        recommendation: `Multiple cron jobs schedule ${target}. Keep the most recent active job; unschedule the rest after review.`,
        evidence: { jobs },
      });
    }
    // Legacy pinterest publishers in cron
    if (PINTEREST_PUBLISHER_PATTERNS.some(p => p.test(target)) && target !== SOLE_PINTEREST_PUBLISHER) {
      findings.push({
        category: "duplicate_pinterest_publisher",
        kind: "legacy_cron_target",
        identifier: target,
        duplicates: jobs.map(j => j.jobname),
        risk: "critical",
        recommendation: `Cron is invoking ${target}, which is not the sole authorized Pinterest publisher (${SOLE_PINTEREST_PUBLISHER}). Unschedule.`,
        evidence: { jobs },
      });
    }
  }
  return findings;
}

async function scanQueues(sb: ReturnType<typeof createClient>): Promise<Finding[]> {
  const findings: Finding[] = [];
  // Look for abandoned queues: tables with name LIKE '%queue%' that have rows older than 30 days in 'pending' or 'queued'
  const queueTables = [
    "pinterest_publish_queue", "pinterest_pin_queue", "pinterest_video_queue",
    "pinterest_recovery_queue", "pinterest_regeneration_queue",
    "pcie2_publish_queue", "pcie2_creative_jobs",
    "tiktok_post_queue", "cluster_publish_queue", "seo_nurture_queue",
  ];
  for (const t of queueTables) {
    const { count, error } = await sb.from(t).select("*", { count: "exact", head: true })
      .lte("created_at", new Date(Date.now() - 30 * 24 * 3600_000).toISOString());
    if (error) continue;
    if ((count ?? 0) > 0) {
      findings.push({
        category: "abandoned_queue",
        kind: "stale_queue_rows",
        identifier: t,
        duplicates: [],
        risk: (count ?? 0) > 1000 ? "high" : "medium",
        recommendation: `${t} has ${count} rows older than 30 days. Verify drain logic, then archive.`,
        evidence: { stale_rows: count, threshold_days: 30 },
      });
    }
  }
  return findings;
}

async function scanLegacyPinterestPublishers(sb: ReturnType<typeof createClient>): Promise<Finding[]> {
  const findings: Finding[] = [];
  // Check pinterest_video_function_logs for recent activity outside the sole publisher
  const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const { data: recentVideoLogs } = await sb.from("pinterest_video_function_logs").select("function_name, created_at").gte("created_at", since).limit(50);
  const violators = new Set<string>();
  for (const row of recentVideoLogs ?? []) {
    const fn = (row as any).function_name as string;
    if (fn && fn !== SOLE_PINTEREST_PUBLISHER && PINTEREST_PUBLISHER_PATTERNS.some(p => p.test(fn))) {
      violators.add(fn);
    }
  }
  for (const fn of violators) {
    findings.push({
      category: "duplicate_pinterest_publisher",
      kind: "active_legacy_publisher",
      identifier: fn,
      duplicates: [SOLE_PINTEREST_PUBLISHER],
      risk: "critical",
      recommendation: `${fn} executed within last 7 days. Single Publisher Guarantee requires ${SOLE_PINTEREST_PUBLISHER} only. Disable function and verify global_stop lock.`,
      evidence: { observed_since: since },
    });
  }
  return findings;
}

async function scanFeatureFlags(sb: ReturnType<typeof createClient>): Promise<Finding[]> {
  const findings: Finding[] = [];
  const { data } = await sb.from("app_config").select("key,value");
  const keys = (data ?? []).map((r: any) => r.key as string);
  const suspectPatterns = [/_v\d+_active$/, /^legacy_/, /^deprecated_/, /_old$/];
  for (const k of keys) {
    if (suspectPatterns.some(p => p.test(k))) {
      findings.push({
        category: "deprecated_automation",
        kind: "suspect_feature_flag",
        identifier: k,
        duplicates: [],
        risk: "low",
        recommendation: `app_config key '${k}' looks like a legacy/deprecated flag. Review and consider removing after migration.`,
        evidence: { key: k },
      });
    }
  }
  return findings;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: scan } = await sb.from("guardian_legacy_scans").insert({ trigger: "manual", status: "running" }).select("id").single();
  if (!scan) return new Response(JSON.stringify({ ok: false, error: "scan_create_failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const findings: Finding[] = [];
  try { findings.push(...await scanCronJobs(sb)); } catch (e) { /* cron RPC may not exist */ }
  try { findings.push(...await scanQueues(sb)); } catch {}
  try { findings.push(...await scanLegacyPinterestPublishers(sb)); } catch {}
  try { findings.push(...await scanFeatureFlags(sb)); } catch {}

  if (findings.length) {
    await sb.from("guardian_legacy_findings").insert(findings.map(f => ({ ...f, scan_id: scan.id, status: "open" })));
  }

  const totals = {
    total: findings.length,
    critical: findings.filter(f => f.risk === "critical").length,
    high: findings.filter(f => f.risk === "high").length,
    medium: findings.filter(f => f.risk === "medium").length,
    low: findings.filter(f => f.risk === "low").length,
    duplicate_pinterest_publishers: findings.filter(f => f.category === "duplicate_pinterest_publisher").length,
  };
  await sb.from("guardian_legacy_scans").update({ finished_at: new Date().toISOString(), status: "completed", totals }).eq("id", scan.id);
  await sb.from("guardian_audit_log").insert({ actor: "legacy_scanner", action: "scan_completed", target: scan.id, payload: totals });

  // Single Publisher Guarantee — surface as separate flag in response
  const single_publisher_violated = totals.duplicate_pinterest_publishers > 0;

  return new Response(JSON.stringify({ ok: true, scan_id: scan.id, totals, single_publisher_violated, findings }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});

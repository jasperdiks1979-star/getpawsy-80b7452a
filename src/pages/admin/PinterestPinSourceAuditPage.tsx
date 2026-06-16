import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Audit = {
  ai_only_gate_active: boolean;
  allow_legacy_product_feed: boolean;
  premium_engine_paused: boolean;
  creative_director_stamped_rows: number;
  creative_director_path_rows: number;
  creative_director_path_unstamped_rows: number;
  legacy_rows_blocked: number;
  next_publishable_ai_rows: number;
  legacy_rows_still_publishable: number;
  last_pin_publish_at: string | null;
  last_pin_publish_error: string | null;
  last_pin_external_url: string | null;
};

export default function PinterestPinSourceAuditPage() {
  const [audit, setAudit] = useState<Audit | null>(null);
  const [loading, setLoading] = useState(false);
  const [enforcing, setEnforcing] = useState(false);
  const [lastRun, setLastRun] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadAudit = async () => {
    setLoading(true); setErr(null);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-ai-only-enforce", {
        body: {},
      });
      if (error) throw error;
      setAudit((data as any)?.audit ?? null);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally { setLoading(false); }
  };

  const runEnforce = async () => {
    if (!confirm("Backfill Creative Director meta and enforce the AI-only gate now?")) return;
    setEnforcing(true); setErr(null);
    try {
      const res = await fetch(
        `${(import.meta as any).env.VITE_SUPABASE_URL}/functions/v1/pinterest-ai-only-enforce?mode=enforce`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${(import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: "{}",
        },
      );
      const json = await res.json();
      setLastRun(json);
      setAudit(json.audit ?? null);
    } catch (e: any) { setErr(e?.message ?? String(e)); }
    finally { setEnforcing(false); }
  };

  useEffect(() => { loadAudit(); }, []);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <header>
        <h1 className="text-2xl font-semibold">Pinterest Pin Source Audit</h1>
        <p className="text-sm text-muted-foreground">
          AI-only publishing gate. Only Creative Director lifestyle/composite pins may publish.
        </p>
      </header>

      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{err}</div>
      )}

      <section className="rounded-lg border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Status</h2>
          <div className="flex gap-2">
            <button
              onClick={loadAudit}
              disabled={loading}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button
              onClick={runEnforce}
              disabled={enforcing}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {enforcing ? "Enforcing…" : "Backfill Creative Director Meta + Enforce AI-only Gate"}
            </button>
          </div>
        </div>

        {!audit ? (
          <p className="text-sm text-muted-foreground">No audit data yet.</p>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Row label="AI-only gate active" value={String(audit.ai_only_gate_active)} good={audit.ai_only_gate_active} />
            <Row label="allow_legacy_product_feed" value={String(audit.allow_legacy_product_feed)} good={!audit.allow_legacy_product_feed} />
            <Row label="premium_engine_paused" value={String(audit.premium_engine_paused)} good={!audit.premium_engine_paused} />
            <Row label="Creative Director stamped rows" value={audit.creative_director_stamped_rows} />
            <Row label="Creative Director path rows" value={audit.creative_director_path_rows} />
            <Row label="CD path rows missing meta (must be 0)" value={audit.creative_director_path_unstamped_rows} good={audit.creative_director_path_unstamped_rows === 0} />
            <Row label="Legacy rows blocked" value={audit.legacy_rows_blocked} />
            <Row label="Legacy rows still publishable (must be 0)" value={audit.legacy_rows_still_publishable} good={audit.legacy_rows_still_publishable === 0} />
            <Row label="Next publishable AI rows" value={audit.next_publishable_ai_rows} />
            <Row label="Last cron publish at" value={audit.last_pin_publish_at ?? "—"} />
            <Row label="Last cron publish url" value={audit.last_pin_external_url ?? "—"} />
            <Row label="Last blocked reason" value={audit.last_pin_publish_error ?? "—"} />
          </dl>
        )}
      </section>

      {lastRun && (
        <section className="rounded-lg border bg-card p-5">
          <h3 className="text-sm font-medium mb-2">Last enforcement result</h3>
          <pre className="text-xs bg-muted/40 p-3 rounded overflow-auto">{JSON.stringify(lastRun, null, 2)}</pre>
        </section>
      )}
    </div>
  );
}

function Row({ label, value, good }: { label: string; value: string | number; good?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={good === undefined ? "" : good ? "text-emerald-600 font-medium" : "text-destructive font-medium"}>
        {value}
      </dd>
    </div>
  );
}
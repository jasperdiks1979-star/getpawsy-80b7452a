import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCanonicalV2Flag } from "@/lib/featureFlags/canonicalV2";

type Bucket = "human" | "uncertain" | "commercial" | "crawler" | "bot" | "technical" | "internal" | "raw";

const BUCKET_LABELS: Record<Bucket, string> = {
  human: "Echte bezoekers (human only)",
  uncertain: "Uncertain",
  commercial: "Bezoekers (human + uncertain)",
  crawler: "Crawler",
  bot: "Bot",
  technical: "Technical",
  internal: "Internal",
  raw: "Raw",
};

export default function AnalyticsCanaryV2() {
  const flag = useCanonicalV2Flag();
  const [hours, setHours] = useState(24);
  const [bucket, setBucket] = useState<Bucket>("commercial");
  const [v1, setV1] = useState<any>(null);
  const [v2, setV2] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (flag.loading) return;
    if (!flag.allowV2) return;
    setLoading(true); setErr(null);
    (async () => {
      try {
        const [a, b] = await Promise.all([
          supabase.functions.invoke("analytics-canonical", { body: { hours } }),
          supabase.functions.invoke("analytics-canonical", { body: { hours, envelope: "v2" } }),
        ]);
        if (a.error) throw a.error;
        if (b.error) throw b.error;
        setV1(a.data);
        setV2(b.data);
      } catch (e: any) {
        setErr(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [hours, flag.loading, flag.allowV2]);

  const activeCount = useMemo(() => {
    if (!v2?.v2) return 0;
    const t = v2.v2;
    if (bucket === "commercial") return t.commercial_sessions;
    if (bucket === "raw") return t.raw_sessions;
    return t[`${bucket}_sessions`] ?? 0;
  }, [v2, bucket]);

  if (flag.loading) return <div className="p-8">Loading feature flag…</div>;
  if (!flag.isAdmin) return <div className="p-8">403 — admin only.</div>;
  if (!flag.enabled) {
    return (
      <div className="p-8 max-w-3xl mx-auto space-y-4">
        <h1 className="text-2xl font-semibold">Canonical Traffic Quality v2 — Canary</h1>
        <div className="rounded-md border border-border p-4">
          <p className="font-medium">Feature flag <code>canonical_traffic_quality_v2.enabled</code> is <span className="text-destructive">OFF</span>.</p>
          <p className="text-muted-foreground text-sm mt-2">Toggle it in <code>app_config</code> to view the canary. The public dashboard remains on v1.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Canonical Traffic Quality v2 — Canary</h1>
          <p className="text-sm text-muted-foreground">Admin-only. Public dashboard unaffected.</p>
        </div>
        <div className="flex gap-2 items-center">
          <label className="text-sm">Window</label>
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="border rounded px-2 py-1 bg-background">
            <option value={1}>1h</option>
            <option value={10}>10h</option>
            <option value={24}>24h</option>
            <option value={168}>7d</option>
          </select>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(BUCKET_LABELS) as Bucket[]).map((b) => (
          <button
            key={b}
            onClick={() => setBucket(b)}
            className={`px-3 py-1 rounded border text-sm ${bucket === b ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}
          >
            {BUCKET_LABELS[b]}
          </button>
        ))}
      </div>

      {err && <div className="rounded border border-destructive/50 text-destructive p-3 text-sm">{err}</div>}
      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}

      <div className="grid md:grid-cols-2 gap-6">
        <section className="rounded-md border border-border p-4 space-y-2">
          <h2 className="font-semibold">Huidige weergave (v1)</h2>
          <p className="text-sm text-muted-foreground">Unfiltered totals — legacy metric.</p>
          {v1?.totals && (
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt>Sessions</dt><dd className="text-right font-mono">{v1.totals.sessions}</dd>
              <dt>Visitors</dt><dd className="text-right font-mono">{v1.totals.visitors}</dd>
              <dt>Page views</dt><dd className="text-right font-mono">{v1.totals.page_views}</dd>
              <dt>Purchases</dt><dd className="text-right font-mono">{v1.totals.purchases}</dd>
              <dt>Revenue</dt><dd className="text-right font-mono">{v1.totals.revenue}</dd>
            </dl>
          )}
        </section>

        <section className="rounded-md border border-primary/60 p-4 space-y-2 bg-primary/5">
          <h2 className="font-semibold">Canary (v2) — {BUCKET_LABELS[bucket]}</h2>
          <p className="text-3xl font-bold">{activeCount}</p>
          {v2?.v2 && (
            <>
              {bucket === "commercial" && (
                <p className="text-xs text-muted-foreground">
                  {v2.v2.human_sessions} human · {v2.v2.uncertain_sessions} uncertain
                  (uncertain is NOT proven human)
                </p>
              )}
              <table className="w-full text-xs mt-3">
                <thead><tr className="text-muted-foreground"><th className="text-left">Bucket</th><th className="text-right">Sessions</th><th className="text-right">Visitors</th></tr></thead>
                <tbody>
                  {(["human","uncertain","crawler","bot","technical","internal","legacy_unclassified"] as const).map(b => (
                    <tr key={b} className={b === "legacy_unclassified" ? "text-muted-foreground italic" : ""}>
                      <td>{b}</td>
                      <td className="text-right font-mono">{v2.v2[`${b}_sessions`]}</td>
                      <td className="text-right font-mono">{v2.v2[`${b}_visitors`]}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold border-t"><td>commercial</td><td className="text-right font-mono">{v2.v2.commercial_sessions}</td><td className="text-right font-mono">{v2.v2.commercial_visitors}</td></tr>
                  <tr className="font-semibold"><td>raw</td><td className="text-right font-mono">{v2.v2.raw_sessions}</td><td className="text-right font-mono">{v2.v2.raw_visitors}</td></tr>
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-2">
                Coverage: {v2.v2.classification_coverage_pct}% · Cutoff: {v2.v2.phase4a_cutoff_iso}
              </p>
              <p className="text-xs text-muted-foreground">
                Historical unclassified sessions ({v2.v2.unclassified_historical_sessions}) remain visible as <code>legacy_unclassified</code>.
              </p>
            </>
          )}
        </section>
      </div>

      <div className="rounded-md border border-border p-4">
        <h2 className="font-semibold mb-2">Rollback</h2>
        <p className="text-sm text-muted-foreground">
          Set <code>canonical_traffic_quality_v2.enabled</code> to <code>false</code> in <code>app_config</code>.
          The v1 API and public dashboard are unchanged; this page will render the disabled banner.
          No schema rollback required.
        </p>
      </div>
    </div>
  );
}
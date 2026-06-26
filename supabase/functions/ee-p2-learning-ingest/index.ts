import { corsHeaders, svc, requireAdmin, ok, err } from "../_shared/ee-p2-common.ts";

// Ingest published pin metrics as training samples. Observation-only.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;
  const sb = svc();
  try {
    const body = await req.json().catch(() => ({}));
    const sinceHours = Math.min(720, Number(body.since_hours ?? 48));
    const since = new Date(Date.now() - sinceHours * 3600000).toISOString();

    const { data: perf } = await sb
      .from("pcie2_pin_performance")
      .select("*")
      .gte("observed_at", since)
      .limit(5000);

    const samples = (perf ?? []).map((r: any) => {
      const imp = Number(r.impressions ?? 0);
      const clk = Number(r.outbound_clicks ?? 0);
      const sv = Number(r.saves ?? 0);
      const rev = Number(r.revenue ?? 0);
      const conv = Number(r.conversions ?? 0);
      const ctr = imp ? clk / imp : 0;
      const label = 0.5 * ctr + 0.0005 * sv + 0.001 * rev;
      return {
        pin_id: r.pin_id ?? null,
        creative_id: r.creative_id ?? null,
        product_id: r.product_id ?? null,
        features: {
          board_id: r.board_id ?? null,
          observed_at: r.observed_at,
          headline: r.headline ?? null,
          hook: r.hook ?? null,
          cta: r.cta ?? null,
        },
        outcomes: {
          impressions: imp,
          saves: sv,
          outbound_clicks: clk,
          ctr,
          conversions: conv,
          purchases: Number(r.purchases ?? 0),
          revenue: rev,
          roas: Number(r.roas ?? 0),
          time_on_page: Number(r.time_on_page ?? 0),
          bounce_rate: Number(r.bounce_rate ?? 0),
        },
        label_score: label,
      };
    });

    if (samples.length) {
      for (let i = 0; i < samples.length; i += 500) await sb.from("ee_p2_training_samples").insert(samples.slice(i, i + 500));
    }

    // Record model accuracy snapshot (baseline mean predictor)
    if (samples.length >= 20) {
      const labels = samples.map((s) => s.label_score ?? 0);
      const mean = labels.reduce((a, b) => a + b, 0) / labels.length;
      const mae = labels.reduce((a, b) => a + Math.abs(b - mean), 0) / labels.length;
      await sb.from("ee_p2_model_accuracy").insert({
        model_name: "baseline_mean",
        model_version: "v1",
        metric_name: "mae",
        metric_value: mae,
        sample_size: labels.length,
      });
    }

    return ok({ ingested: samples.length });
  } catch (e) {
    return err(String(e));
  }
});
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function CinematicV4QualityGate() {
  const [cfg, setCfg] = useState<any>(null);
  useEffect(() => {
    supabase.from("cinematic_v4_safe_zone_config").select("*").limit(1).maybeSingle()
      .then(({ data }) => setCfg(data));
  }, []);
  if (!cfg) return <div className="p-6">Loading…</div>;
  const Row = ({ label, value }: { label: string; value: any }) => (
    <div className="flex justify-between border-b py-2 text-sm"><span className="text-muted-foreground">{label}</span><span className="font-mono">{String(value)}</span></div>
  );
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">V4 Quality Gate</h1>
        <p className="text-sm text-muted-foreground">Read-only view of the safe-zone + scoring configuration. Edit in the database to tune.</p>
      </div>
      <section className="border rounded-lg p-4">
        <h2 className="font-semibold mb-2">Canvas & safe zone</h2>
        <Row label="Canvas" value={`${cfg.canvas_width} × ${cfg.canvas_height}`} />
        <Row label="Top reserve" value={`${cfg.top_reserve_pct}%`} />
        <Row label="Bottom reserve" value={`${cfg.bottom_reserve_pct}%`} />
        <Row label="Side reserve" value={`${cfg.side_reserve_px}px`} />
        <Row label="Font range" value={`${cfg.min_font_px}–${cfg.max_font_px}px`} />
        <Row label="Max lines" value={cfg.max_lines} />
        <Row label="Min source image" value={`${cfg.min_source_image_px}px`} />
        <Row label="Approval threshold" value={cfg.approval_threshold} />
      </section>
      <section className="border rounded-lg p-4">
        <h2 className="font-semibold mb-2">Penalty weights</h2>
        <Row label="Safe area violation" value={`-${cfg.penalty_safe_area}`} />
        <Row label="Caption clipped" value={`-${cfg.penalty_caption_clipped}`} />
        <Row label="Supplier collage" value={`-${cfg.penalty_supplier_collage}`} />
        <Row label="Low-res source" value={`-${cfg.penalty_low_res}`} />
        <Row label="Zoom/pan only" value={`-${cfg.penalty_zoom_pan_only}`} />
        <Row label="Missing hook" value={`-${cfg.penalty_missing_hook}`} />
        <Row label="Missing benefit" value={`-${cfg.penalty_missing_benefit}`} />
        <Row label="Missing CTA" value={`-${cfg.penalty_missing_cta}`} />
        <Row label="Branding" value={`-${cfg.penalty_branding}`} />
      </section>
      <section className="border rounded-lg p-4">
        <h2 className="font-semibold mb-2">Brand</h2>
        <Row label="Primary" value={cfg.brand_primary} />
        <Row label="Accent" value={cfg.brand_accent} />
        <Row label="Logo URL" value={cfg.brand_logo_url ?? "—"} />
      </section>
    </div>
  );
}
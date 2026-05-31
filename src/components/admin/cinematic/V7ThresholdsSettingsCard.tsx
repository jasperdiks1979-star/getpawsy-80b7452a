import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, SlidersHorizontal, RotateCcw } from "lucide-react";
import { toast } from "sonner";

type V7Settings = {
  cinematic_v7_enabled: boolean;
  min_pinterest_quality_score: number;
  min_scene_count_v7: number;
  min_unique_scenes_v7: number;
  min_unique_cameras_v7: number;
  min_closeups_v7: number;
  min_lifestyle_v7: number;
  min_product_demo_v7: number;
  text_safe_zone_tolerance: number;
  max_caption_density_v7: number;
  max_dense_caption_ratio_v7: number;
  // Creative Domination Mode
  creative_domination_mode: boolean;
  min_hook_score: number;
  min_voice_score: number;
  min_ctr_prediction_score: number;
  min_final_creative_score: number;
  min_emotional_payoff_v7: number;
  require_cta_scene_v7: boolean;
  hard_reject_single_image: boolean;
  hard_reject_ken_burns_only: boolean;
};

const DEFAULTS: V7Settings = {
  cinematic_v7_enabled: true,
  min_pinterest_quality_score: 95,
  min_scene_count_v7: 5,
  min_unique_scenes_v7: 5,
  min_unique_cameras_v7: 3,
  min_closeups_v7: 1,
  min_lifestyle_v7: 1,
  min_product_demo_v7: 1,
  text_safe_zone_tolerance: 0,
  max_caption_density_v7: 0.25,
  max_dense_caption_ratio_v7: 0.34,
  creative_domination_mode: true,
  min_hook_score: 90,
  min_voice_score: 90,
  min_ctr_prediction_score: 90,
  min_final_creative_score: 95,
  min_emotional_payoff_v7: 1,
  require_cta_scene_v7: true,
  hard_reject_single_image: true,
  hard_reject_ken_burns_only: true,
};

const FIELDS: Array<{
  key: keyof Omit<V7Settings, "cinematic_v7_enabled">;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: "min_pinterest_quality_score", label: "Min Pinterest quality score", hint: "Composite score required to auto-approve (0–100)", min: 0, max: 100, step: 1 },
  { key: "min_scene_count_v7", label: "Min total scenes", hint: "Reject videos with fewer scenes than this", min: 1, max: 20, step: 1 },
  { key: "min_unique_scenes_v7", label: "Min unique scenes", hint: "Distinct crop+motion+role combinations", min: 1, max: 20, step: 1 },
  { key: "min_unique_cameras_v7", label: "Min unique camera angles", hint: "Distinct crops/framing values", min: 1, max: 10, step: 1 },
  { key: "min_closeups_v7", label: "Min close-up shots", hint: "Required close-up/macro/detail scenes", min: 0, max: 10, step: 1 },
  { key: "min_lifestyle_v7", label: "Min lifestyle shots", hint: "Required lifestyle/home/owner scenes", min: 0, max: 10, step: 1 },
  { key: "min_product_demo_v7", label: "Min product-demo shots", hint: "Required product-in-use / demo scenes", min: 0, max: 10, step: 1 },
  { key: "text_safe_zone_tolerance", label: "Text safe-zone tolerance", hint: "Fraction of scenes allowed outside safe area (0 = strict)", min: 0, max: 1, step: 0.05 },
  { key: "max_caption_density_v7", label: "Max caption density / frame", hint: "Caption length ratio per frame (0.25 = ~25% text)", min: 0.05, max: 1, step: 0.05 },
  { key: "max_dense_caption_ratio_v7", label: "Max dense-caption ratio", hint: "Max fraction of scenes that may exceed density before fail", min: 0, max: 1, step: 0.05 },
  { key: "min_hook_score", label: "Min hook score (Domination)", hint: "Winning hook variant must score ≥ this (0–100)", min: 0, max: 100, step: 1 },
  { key: "min_voice_score", label: "Min voice score (Domination)", hint: "Winning voice candidate must score ≥ this", min: 0, max: 100, step: 1 },
  { key: "min_ctr_prediction_score", label: "Min CTR prediction", hint: "Predicted CTR composite must score ≥ this", min: 0, max: 100, step: 1 },
  { key: "min_final_creative_score", label: "Min final creative score", hint: "Composite Domination score — auto-approve floor", min: 0, max: 100, step: 1 },
  { key: "min_emotional_payoff_v7", label: "Min emotional-payoff scenes", hint: "Required emotional-payoff scenes (joy/relief/cuddle)", min: 0, max: 5, step: 1 },
];

export default function V7ThresholdsSettingsCard() {
  const [s, setS] = useState<V7Settings | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("cinematic_ad_settings")
      .select("cinematic_v7_enabled, min_pinterest_quality_score, min_scene_count_v7, min_unique_scenes_v7, min_unique_cameras_v7, min_closeups_v7, min_lifestyle_v7, min_product_demo_v7, text_safe_zone_tolerance, max_caption_density_v7, max_dense_caption_ratio_v7, creative_domination_mode, min_hook_score, min_voice_score, min_ctr_prediction_score, min_final_creative_score, min_emotional_payoff_v7, require_cta_scene_v7, hard_reject_single_image, hard_reject_ken_burns_only")
      .eq("id", true)
      .maybeSingle();
    setS({ ...DEFAULTS, ...(data as Partial<V7Settings> | null ?? {}) } as V7Settings);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!s) return;
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("cinematic_ad_settings")
        .update({ ...s, updated_at: new Date().toISOString(), updated_by: u?.user?.id ?? null })
        .eq("id", true);
      if (error) throw error;
      toast.success("V7 thresholds saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => setS({ ...DEFAULTS });

  if (!s) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SlidersHorizontal className="h-4 w-4" /> V7 QA thresholds
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>V7 gate enabled (Pinterest-grade)</span>
          <Switch
            checked={s.cinematic_v7_enabled}
            onCheckedChange={(v) => setS({ ...s, cinematic_v7_enabled: v })}
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Creative Domination Mode</span>
          <Switch
            checked={s.creative_domination_mode}
            onCheckedChange={(v) => setS({ ...s, creative_domination_mode: v })}
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Require dedicated CTA scene</span>
          <Switch
            checked={s.require_cta_scene_v7}
            onCheckedChange={(v) => setS({ ...s, require_cta_scene_v7: v })}
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Hard reject: single-image renders</span>
          <Switch
            checked={s.hard_reject_single_image}
            onCheckedChange={(v) => setS({ ...s, hard_reject_single_image: v })}
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Hard reject: Ken-Burns-only renders</span>
          <Switch
            checked={s.hard_reject_ken_burns_only}
            onCheckedChange={(v) => setS({ ...s, hard_reject_ken_burns_only: v })}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="text-xs space-y-1">
              <span className="block text-muted-foreground">{f.label}</span>
              <Input
                type="number"
                min={f.min}
                max={f.max}
                step={f.step}
                value={s[f.key] as number}
                onChange={(e) => setS({ ...s, [f.key]: Number(e.target.value) })}
              />
              <span className="block text-[10px] text-muted-foreground/70">{f.hint}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Save thresholds
          </Button>
          <Button size="sm" variant="outline" onClick={reset}>
            <RotateCcw className="h-3 w-3 mr-1" /> Reset to defaults
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
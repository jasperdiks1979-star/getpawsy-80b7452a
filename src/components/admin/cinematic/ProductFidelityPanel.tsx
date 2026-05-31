import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, RefreshCw, ShieldAlert, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const FIDELITY_THRESHOLD = 90;

type SceneFlag = {
  shape_match: boolean;
  color_match: boolean;
  dimensions_match: boolean;
  buttons_match: boolean;
  display_match: boolean;
  opening_match: boolean;
  no_invented_features: boolean;
  branding_match: boolean;
  product_identifiable: boolean;
  geometry_match: boolean;
  cat_no_intersection: boolean;
};

type SceneResult = {
  index: number;
  passed: boolean;
  score: number;
  similarity_percent: number;
  scene_realism_score: number;
  reasons: string[];
  rule_flags: SceneFlag;
};

type FidelityReport = {
  checked_at?: string;
  product_match_score?: number;
  motion_quality_score?: number;
  scene_consistency_score?: number;
  min_similarity_percent?: number;
  min_scene_realism_score?: number;
  passed?: boolean;
  source_image_urls?: string[];
  scenes?: SceneResult[];
};

type Job = {
  id: string;
  fidelity_score?: number | null;
  fidelity_passed?: boolean | null;
  fidelity_reject_reasons?: string[] | null;
  fidelity_report?: FidelityReport | null;
  scene_assets?: Array<{ index: number; image_url: string }> | null;
  motion_quality_score?: number | null;
  scene_consistency_score?: number | null;
  fidelity_regen_passes?: number | null;
};

function scoreColor(v: number | null | undefined) {
  if (v == null) return "outline";
  if (v >= FIDELITY_THRESHOLD) return "default";
  if (v >= 75) return "secondary";
  return "destructive";
}

function ScoreBadge({ label, score }: { label: string; score: number | null | undefined }) {
  const variant = scoreColor(score) as any;
  const display = score == null ? "—" : `${score}/100`;
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <Badge variant={variant} className="text-sm">
        {score != null && score >= FIDELITY_THRESHOLD ? (
          <CheckCircle2 className="w-3 h-3 mr-1" />
        ) : (
          <XCircle className="w-3 h-3 mr-1" />
        )}
        {display}
      </Badge>
    </div>
  );
}

export function useFidelityGate(job: Job | null | undefined) {
  return useMemo(() => {
    if (!job) return { passes: false, reason: "no_job", scores: null };
    const productMatch = job.fidelity_report?.product_match_score ?? job.fidelity_score ?? null;
    const motion = job.motion_quality_score ?? job.fidelity_report?.motion_quality_score ?? null;
    const consistency = job.scene_consistency_score ?? job.fidelity_report?.scene_consistency_score ?? null;
    const scores = { productMatch, motion, consistency };
    if (productMatch == null && motion == null && consistency == null) {
      // Not yet evaluated — block until a fidelity report exists.
      return { passes: false, reason: "not_evaluated", scores };
    }
    const failing: string[] = [];
    if (productMatch == null || productMatch < FIDELITY_THRESHOLD) failing.push("product_match");
    if (motion == null || motion < FIDELITY_THRESHOLD) failing.push("motion_quality");
    if (consistency == null || consistency < FIDELITY_THRESHOLD) failing.push("scene_consistency");
    return { passes: failing.length === 0, reason: failing.join(","), scores };
  }, [job]);
}

export default function ProductFidelityPanel({
  job,
  onChanged,
}: {
  job: Job;
  onChanged?: () => void;
}) {
  const [busy, setBusy] = useState<"check" | "regen" | null>(null);
  const report = job.fidelity_report ?? null;
  const gate = useFidelityGate(job);
  const sourceImages = report?.source_image_urls ?? [];

  const runCheck = async () => {
    setBusy("check");
    try {
      const { error } = await supabase.functions.invoke("cinematic-fidelity-check", {
        body: { job_id: job.id },
      });
      if (error) throw error;
      toast.success("Fidelity check complete");
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Fidelity check failed");
    } finally {
      setBusy(null);
    }
  };

  const runRegen = async () => {
    setBusy("regen");
    try {
      const { error } = await supabase.functions.invoke("cinematic-fidelity-auto-regen", {
        body: { job_id: job.id },
      });
      if (error) throw error;
      toast.success("Scene regeneration triggered");
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Regenerate failed");
    } finally {
      setBusy(null);
    }
  };

  const scenes = report?.scenes ?? [];
  const sceneAssets = job.scene_assets ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert className="w-4 h-4" /> Product Fidelity Quality Gate
          <Badge variant={gate.passes ? "default" : "destructive"} className="ml-auto">
            {gate.passes ? "Approval allowed" : "Approval blocked"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <ScoreBadge label="Product Match" score={gate.scores?.productMatch ?? null} />
          <ScoreBadge label="Motion Quality" score={gate.scores?.motion ?? null} />
          <ScoreBadge label="Scene Consistency" score={gate.scores?.consistency ?? null} />
        </div>

        {!gate.passes && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs space-y-1">
            <div className="flex items-center gap-1 font-medium text-destructive">
              <AlertTriangle className="w-3.5 h-3.5" /> Cannot approve — quality gate failed
            </div>
            <p className="text-muted-foreground">
              Every score must be ≥ {FIDELITY_THRESHOLD}/100. Failing: {gate.reason || "none"}.
            </p>
            {Array.isArray(job.fidelity_reject_reasons) && job.fidelity_reject_reasons.length > 0 && (
              <ul className="list-disc ml-4 mt-1 space-y-0.5">
                {job.fidelity_reject_reasons.slice(0, 8).map((r, i) => (
                  <li key={i} className="text-muted-foreground break-words">{r}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={runCheck} disabled={busy !== null}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${busy === "check" ? "animate-spin" : ""}`} />
            Re-run fidelity check
          </Button>
          <Button size="sm" variant="outline" onClick={runRegen} disabled={busy !== null || gate.passes}>
            Regenerate failing scenes
          </Button>
          {typeof job.fidelity_regen_passes === "number" && (
            <Badge variant="outline" className="ml-auto text-[11px]">
              Regen passes: {job.fidelity_regen_passes}
            </Badge>
          )}
        </div>

        {sourceImages.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-1">Source PDP references</p>
            <div className="flex gap-2 overflow-x-auto">
              {sourceImages.slice(0, 6).map((u, i) => (
                <img key={i} src={u} alt={`source ${i}`} loading="lazy"
                  className="w-20 h-20 object-cover rounded border" />
              ))}
            </div>
          </div>
        )}

        {scenes.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-medium">Per-scene comparison</p>
            {scenes.map((s) => {
              const asset = sceneAssets.find((a) => Number(a.index) === Number(s.index));
              const ruleFails = Object.entries(s.rule_flags ?? {})
                .filter(([, ok]) => !ok).map(([k]) => k);
              const pass = s.passed && s.similarity_percent >= FIDELITY_THRESHOLD && s.scene_realism_score >= 8;
              return (
                <div key={s.index} className="border rounded-md p-2 space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline">Scene {s.index}</Badge>
                    <Badge variant={pass ? "default" : "destructive"}>
                      {pass ? "PASS" : "FAIL"}
                    </Badge>
                    <span className="text-muted-foreground">
                      sim {s.similarity_percent}% · realism {s.scene_realism_score}/10 · score {s.score}/100
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground mb-1">Source (PDP)</p>
                      {sourceImages[0] ? (
                        <img src={sourceImages[0]} alt="source"
                          className="w-full aspect-square object-cover rounded border" loading="lazy" />
                      ) : <div className="aspect-square bg-muted rounded" />}
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground mb-1">Generated</p>
                      {asset?.image_url ? (
                        <img src={asset.image_url} alt={`scene ${s.index}`}
                          className="w-full aspect-square object-cover rounded border" loading="lazy" />
                      ) : <div className="aspect-square bg-muted rounded" />}
                    </div>
                  </div>
                  {(ruleFails.length > 0 || (s.reasons?.length ?? 0) > 0) && (
                    <div className="text-[11px] text-destructive space-y-0.5">
                      {ruleFails.map((f) => <div key={f}>✕ {f.replace(/_/g, " ")}</div>)}
                      {(s.reasons ?? []).slice(0, 4).map((r, i) => (
                        <div key={`r-${i}`} className="text-muted-foreground">• {r}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {report?.checked_at && (
          <p className="text-[11px] text-muted-foreground">
            Last checked {new Date(report.checked_at).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
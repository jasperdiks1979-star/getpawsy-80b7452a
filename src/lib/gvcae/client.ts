import { supabase } from "@/integrations/supabase/client";

async function call(action: string, body?: unknown) {
  const { data, error } = await supabase.functions.invoke(`gvcae-architect?action=${action}`, {
    body: body ?? {},
  });
  if (error) throw error;
  return data;
}

export const GVCAE = {
  runFullAudit: () => call("run_full_audit"),
  seed: () => call("seed"),
  scoreHealth: () => call("score_health"),
  detectDuplicates: () => call("detect_duplicates"),
  valueAnalysis: () => call("value_analysis"),
  simplification: () => call("simplification"),
  techDebt: () => call("tech_debt"),
  scorecard: () => call("scorecard"),
  review: () => call("review"),
  changeImpact: (change_title: string, modules: string[]) =>
    call("change_impact", { change_title, modules }),
};
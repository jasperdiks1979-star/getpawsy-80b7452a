import { supabase } from "@/integrations/supabase/client";

type CallArgs = { action: string; [k: string]: unknown };

export async function gcd<T = unknown>(args: CallArgs): Promise<T> {
  const { data, error } = await supabase.functions.invoke("gcd-api", { body: args });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "gcd-api error");
  return data.result as T;
}

export const GCD = {
  consult: (module_key?: string, limit = 25) => gcd({ action: "consult", module_key, limit }),
  recommend: (family: string, gene_types?: string[], top_k = 3) =>
    gcd({ action: "recommend", family, gene_types, top_k }),
  upsertCreative: (genome: Record<string, unknown>) => gcd({ action: "upsertCreative", ...genome }),
  recordPerformance: (perf: Record<string, unknown>) => gcd({ action: "recordPerformance", ...perf }),
  predict: (creative_id: string | null, prediction_type = "ctr", features: Record<string, unknown> = {}) =>
    gcd({ action: "predict", creative_id, prediction_type, features }),
  recordLearning: (l: Record<string, unknown>) => gcd({ action: "recordLearning", ...l }),
  stats: () => gcd({ action: "stats" }),
};
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Pcie3WhatIf {
  wave_size?: number;
  only_categories?: string[];
  skip_categories?: string[];
  only_species?: string[];
  high_margin_only?: boolean;
  maximize_diversity?: boolean;
}

export interface Pcie3Envelope {
  ok: boolean;
  generated_at: string;
  mode: string;
  publisher: string;
  coverage: {
    catalog_total: number;
    unique_products_published: number;
    coverage_pct: number;
    pins_per_category: Record<string, number>;
    pins_per_board_top: Record<string, number>;
    boards_used_total: number;
    categories_used_total: number;
  };
  diversity: { board_diversity_score: number; category_diversity_score: number };
  candidates_total: number;
  candidates_eligible: number;
  candidates_excluded: number;
  top_recommended: Array<any>;
  excluded: Array<any>;
  simulations: Array<any>;
  recommended_wave: any;
  best_wave_size: number;
  what_if_applied: Pcie3WhatIf;
  safe_mode: boolean;
  note: string;
}

async function invoke(what_if: Pcie3WhatIf = {}): Promise<Pcie3Envelope> {
  const { data, error } = await supabase.functions.invoke("pcie3-diversity-planner", {
    body: { what_if },
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error || "planner failed");
  return data as Pcie3Envelope;
}

export function usePcie3Planner() {
  return useQuery({
    queryKey: ["pcie3-planner"],
    queryFn: () => invoke({}),
    staleTime: 60_000,
  });
}

export function usePcie3WhatIf() {
  return useMutation({ mutationFn: (w: Pcie3WhatIf) => invoke(w) });
}
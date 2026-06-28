import { supabase } from "@/integrations/supabase/client";

async function call(action: string, body?: unknown) {
  const { data, error } = await supabase.functions.invoke(`gaee-evolution?action=${action}`, {
    body: body ?? {},
  });
  if (error) throw error;
  return data;
}

export const GAEE = {
  status: () => call("status"),
  runCycle: (trigger = "manual") => call("run_cycle", { trigger }),
  reflect: (period?: string) => call("reflect", { period }),
  scorecard: (period?: string) => call("scorecard", { period }),
  approve: (id: string, reason?: string) => call("approve", { id, reason }),
  reject: (id: string, reason?: string) => call("reject", { id, reason }),
};
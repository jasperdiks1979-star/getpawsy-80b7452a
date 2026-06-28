import { supabase } from "@/integrations/supabase/client";

/** Engines call these helpers — never write to aos_events/aos_knowledge/aos_tasks directly. */
export async function aosPublishEvent(input: {
  event_type: string; source_engine?: string; subject?: string;
  payload?: Record<string, unknown>; severity?: "info" | "warn" | "critical";
}) {
  return supabase.functions.invoke("aos-orchestrator?action=publish_event", { body: input } as any);
}

export async function aosPublishKnowledge(input: {
  topic: string; key: string; publisher_engine: string; kind: string;
  payload: Record<string, unknown>; confidence?: number; tags?: string[];
}) {
  return supabase.functions.invoke("aos-orchestrator?action=publish_knowledge", { body: input } as any);
}

export async function aosScheduleTask(input: {
  title: string; category: string; owner_engine?: string;
  priority?: number; payload?: Record<string, unknown>; related_event_id?: string;
}) {
  return supabase.functions.invoke("aos-orchestrator?action=schedule_task", { body: input } as any);
}

export async function aosVote(input: {
  decision_id: string; engine_key: string; vote: string;
  weight?: number; confidence?: number; reasoning?: string;
}) {
  return supabase.functions.invoke("aos-orchestrator?action=vote", { body: input } as any);
}
// Shared AOS bus helpers for edge functions.
// Engines use these to publish heartbeats, events, knowledge and tasks
// directly to the AOS nervous system without an extra HTTP hop.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

let cached: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  return cached;
}

export async function aosHeartbeat(engineKey: string, health: "ok" | "degraded" | "down" = "ok") {
  try {
    await sb().from("aos_engine_registry").update({
      last_heartbeat_at: new Date().toISOString(),
      health,
    }).eq("engine_key", engineKey);
  } catch (_) { /* fire-and-forget */ }
}

export async function aosEvent(input: {
  event_type: string;
  source_engine: string;
  subject?: string | null;
  payload?: Record<string, unknown>;
  severity?: "info" | "warn" | "critical";
}) {
  try {
    await sb().from("aos_events").insert({
      event_type: input.event_type,
      source_engine: input.source_engine,
      subject: input.subject ?? null,
      payload: input.payload ?? {},
      severity: input.severity ?? "info",
    });
  } catch (_) { /* fire-and-forget */ }
}

export async function aosKnowledge(input: {
  topic: string;
  key: string;
  publisher_engine: string;
  kind: string;
  payload: Record<string, unknown>;
  confidence?: number;
  tags?: string[];
}) {
  try {
    const client = sb();
    const { data: prev } = await client
      .from("aos_knowledge")
      .select("id, version")
      .eq("topic", input.topic).eq("key", input.key)
      .is("superseded_at", null)
      .order("version", { ascending: false }).limit(1).maybeSingle();
    const nextVersion = (prev?.version ?? 0) + 1;
    if (prev) {
      await client.from("aos_knowledge")
        .update({ superseded_at: new Date().toISOString() })
        .eq("id", prev.id);
    }
    await client.from("aos_knowledge").insert({
      topic: input.topic,
      key: input.key,
      version: nextVersion,
      publisher_engine: input.publisher_engine,
      kind: input.kind,
      payload: input.payload,
      confidence: input.confidence ?? 0.7,
      supersedes_id: prev?.id ?? null,
      tags: input.tags ?? [],
    });
  } catch (_) { /* fire-and-forget */ }
}

export async function aosTask(input: {
  title: string;
  category: string;
  owner_engine?: string;
  priority?: number;
  payload?: Record<string, unknown>;
}) {
  try {
    await sb().from("aos_tasks").insert({
      title: input.title,
      category: input.category,
      owner_engine: input.owner_engine ?? null,
      priority: input.priority ?? 50,
      payload: input.payload ?? {},
    });
  } catch (_) { /* fire-and-forget */ }
}
// Shared helpers for GEIP edge functions.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function startRun(sb: SupabaseClient, source: string) {
  const { data } = await sb
    .from("geip_sync_runs")
    .insert({ source, status: "running" })
    .select("id")
    .single();
  return data?.id as string | undefined;
}

export async function finishRun(
  sb: SupabaseClient,
  id: string | undefined,
  patch: {
    status: "ok" | "waiting_for_auth" | "error" | "partial";
    blocker?: string;
    rows_ingested?: number;
    error?: string;
    metadata?: Record<string, unknown>;
  },
) {
  if (!id) return;
  await sb
    .from("geip_sync_runs")
    .update({ ...patch, finished_at: new Date().toISOString() })
    .eq("id", id);
}

export async function markConnection(
  sb: SupabaseClient,
  surface: string,
  status: "ready" | "waiting_for_auth" | "error" | "disabled",
  blocker?: string,
) {
  await sb
    .from("geip_connections")
    .update({
      status,
      blocker: blocker ?? null,
      last_check_at: new Date().toISOString(),
      ...(status === "ready" ? { last_ok_at: new Date().toISOString() } : {}),
    })
    .eq("surface", surface);
}
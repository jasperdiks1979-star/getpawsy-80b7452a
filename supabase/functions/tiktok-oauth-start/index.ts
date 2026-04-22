import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function base64url(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * TikTok OAuth Start
 * Generates the TikTok login URL for the @getpawsy account.
 * Stores CSRF state in DB for verification on callback.
 *
 * Required scopes for direct posting:
 *   user.info.basic, video.publish, video.upload, photo.upload
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const clientKey = Deno.env.get("TIKTOK_CLIENT_KEY");

    if (!clientKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "TIKTOK_CLIENT_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Auth: only admins can start OAuth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid auth token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ ok: false, error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Determine the redirect URI — must match exactly what's registered in TikTok Developer Portal
    // We use a frontend route that POSTs the code to the callback edge function.
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const origin = (body.origin as string) || "https://getpawsy.lovable.app";
    const redirectUri = `${origin.replace(/\/$/, "")}/auth/tiktok/callback`;

    // Generate CSRF state and persist it
    const state = base64url(crypto.getRandomValues(new Uint8Array(24)));
    await supabase.from("tiktok_oauth_states").insert({
      state,
      user_id: user.id,
      redirect_to: "/admin/tiktok-automation",
    });

    // Cleanup stale states (>10 min)
    await supabase
      .from("tiktok_oauth_states")
      .delete()
      .lt("expires_at", new Date().toISOString());

    const params = new URLSearchParams({
      client_key: clientKey,
      response_type: "code",
      scope: "user.info.basic,video.publish,video.upload",
      redirect_uri: redirectUri,
      state,
    });

    const authUrl = `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;

    console.log("[tiktok-oauth-start] Generated for user:", user.id, "redirect:", redirectUri);

    return new Response(
      JSON.stringify({ ok: true, authUrl, redirectUri }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[tiktok-oauth-start] Error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
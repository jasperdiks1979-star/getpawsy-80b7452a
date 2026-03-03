import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

async function generatePKCE() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(verifier)
      )
    )
  );
  return { verifier, challenge };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
    const configuredRedirect = Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI");
    const fallbackRedirect = `${supabaseUrl}/functions/v1/merchant-oauth-callback`;
    const redirectUri = configuredRedirect || fallbackRedirect;

    // Diagnostic: log URL origins (no secrets)
    console.log("[merchant-oauth-start] SUPABASE_URL:", supabaseUrl);
    console.log("[merchant-oauth-start] Redirect URI source:", configuredRedirect ? "GOOGLE_OAUTH_REDIRECT_URI env" : "fallback from SUPABASE_URL");
    console.log("[merchant-oauth-start] Redirect URI used:", redirectUri);

    if (!clientId) {
      return new Response(
        JSON.stringify({ ok: false, error: "GOOGLE_OAUTH_CLIENT_ID not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authenticate the calling user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const {
      data: { user },
      error: authError,
    } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));

    if (authError || !user) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid auth token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ ok: false, error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate PKCE
    const { verifier, challenge } = await generatePKCE();
    const state = base64url(crypto.getRandomValues(new Uint8Array(16)));

    // Store state + verifier in DB
    await supabase.from("merchant_oauth_state").insert({
      state,
      code_verifier: verifier,
      user_id: user.id,
    });

    // Clean up expired states
    await supabase
      .from("merchant_oauth_state")
      .delete()
      .lt("expires_at", new Date().toISOString());

    // Build Google OAuth URL
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/content",
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    console.log("[merchant-oauth-start] OAuth URL generated for user:", user.id);

    return new Response(
      JSON.stringify({ ok: true, authUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[merchant-oauth-start] Error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Internal error starting OAuth flow" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

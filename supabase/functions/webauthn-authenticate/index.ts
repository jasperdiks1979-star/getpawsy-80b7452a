import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Base64URL encoding utility
function base64URLEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();
    const { action, credentialId, email } = body;

    if (action === "get-challenge") {
      // Generate challenge for authentication
      const challengeBuffer = new Uint8Array(32);
      crypto.getRandomValues(challengeBuffer);
      const challengeBase64 = base64URLEncode(challengeBuffer);

      let allowCredentials: { id: string; type: string }[] = [];

      if (email) {
        // Get user by email first
        const { data: authData } = await supabaseAdmin.auth.admin.listUsers();
        const user = authData?.users?.find(u => u.email === email);
        
        if (user) {
          // Get passkeys for this user
          const { data: passkeys } = await supabaseAdmin
            .from("passkey_credentials")
            .select("credential_id")
            .eq("user_id", user.id);

          if (passkeys && passkeys.length > 0) {
            allowCredentials = passkeys.map(pk => ({
              id: pk.credential_id,
              type: "public-key",
            }));
          }
        }
      }

      return new Response(
        JSON.stringify({
          challenge: challengeBase64,
          rpId: new URL(req.headers.get("origin") || "https://localhost").hostname,
          allowCredentials,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "authenticate") {
      const { credential } = body;
      
      if (!credential || !credential.id) {
        return new Response(
          JSON.stringify({ error: "Invalid credential" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Find the passkey credential
      const { data: passkey, error: passkeyError } = await supabaseAdmin
        .from("passkey_credentials")
        .select("*")
        .eq("credential_id", credential.id)
        .single();

      if (passkeyError || !passkey) {
        return new Response(
          JSON.stringify({ error: "Passkey not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update last_used_at and counter
      await supabaseAdmin
        .from("passkey_credentials")
        .update({
          last_used_at: new Date().toISOString(),
          counter: passkey.counter + 1,
        })
        .eq("id", passkey.id);

      // Get the user
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(passkey.user_id);
      
      if (userError || !userData.user) {
        return new Response(
          JSON.stringify({ error: "User not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Create a session directly using admin API
      console.log("Creating session for user:", userData.user.email);
      
      // Use signInWithPassword approach - but we need to create a custom token
      // Instead, we'll use the admin API to create a session
      const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.createUser({
        email: userData.user.email!,
        email_confirm: true,
        // This won't create a new user, just return the existing one with session info
      });

      // The better approach is to generate a one-time sign-in link and return the token_hash
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: userData.user.email!,
      });

      if (linkError || !linkData) {
        console.error("Link generation error:", linkError);
        return new Response(
          JSON.stringify({ error: "Failed to generate authentication token" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Generated link properties:", linkData.properties);

      // The hashed_token is what we need for verifyOtp
      return new Response(
        JSON.stringify({
          success: true,
          token: linkData.properties.hashed_token,
          type: "magiclink",
          email: userData.user.email,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

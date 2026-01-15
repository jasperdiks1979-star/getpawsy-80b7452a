import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Base64URL encoding/decoding utilities
function base64URLEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64URLDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const paddedBase64 = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(paddedBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user from auth header
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action, credential, challenge, deviceName } = body;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    if (action === "get-challenge") {
      // Generate a random challenge
      const challengeBuffer = new Uint8Array(32);
      crypto.getRandomValues(challengeBuffer);
      const challengeBase64 = base64URLEncode(challengeBuffer);

      return new Response(
        JSON.stringify({
          challenge: challengeBase64,
          userId: user.id,
          userName: user.email,
          rpId: new URL(req.headers.get("origin") || "https://localhost").hostname,
          rpName: "GetPawsy",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "register") {
      // Validate credential
      if (!credential || !credential.id || !credential.response) {
        return new Response(
          JSON.stringify({ error: "Invalid credential data" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Store the credential
      const { error: insertError } = await supabaseAdmin
        .from("passkey_credentials")
        .insert({
          user_id: user.id,
          credential_id: credential.id,
          public_key: JSON.stringify(credential.response),
          counter: 0,
          device_name: deviceName || "Unknown Device",
        });

      if (insertError) {
        console.error("Insert error:", insertError);
        if (insertError.code === "23505") {
          return new Response(
            JSON.stringify({ error: "This passkey is already registered" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ error: "Failed to register passkey" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "Passkey registered successfully" }),
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

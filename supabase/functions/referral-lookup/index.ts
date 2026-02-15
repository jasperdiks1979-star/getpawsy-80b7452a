import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Handles referral code operations:
 * - GET ?code=XYZ — validate a referral code
 * - POST { email, name } — generate a referral code for a customer
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (req.method === "GET") {
      const url = new URL(req.url);
      const code = url.searchParams.get("code")?.toUpperCase();
      if (!code) {
        return new Response(JSON.stringify({ error: "Missing code" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await supabase
        .from("referral_codes")
        .select("id, code, reward_type, reward_value, uses_count, max_uses, is_active")
        .eq("code", code)
        .eq("is_active", true)
        .maybeSingle();

      if (error || !data) {
        return new Response(JSON.stringify({ valid: false }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const valid = data.is_active && (!data.max_uses || data.uses_count < data.max_uses);
      return new Response(JSON.stringify({
        valid,
        discount: valid ? { type: data.reward_type, value: data.reward_value } : null,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const { email, name } = await req.json();
      if (!email) {
        return new Response(JSON.stringify({ error: "Email required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if already has a code
      const { data: existing } = await supabase
        .from("referral_codes")
        .select("code, uses_count")
        .eq("owner_email", email.toLowerCase())
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ code: existing.code, uses: existing.uses_count }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Generate unique code: PAWSY-XXXXX
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let code = "PAWSY-";
      for (let i = 0; i < 5; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }

      const { data: created, error: insertErr } = await supabase
        .from("referral_codes")
        .insert({
          code,
          owner_email: email.toLowerCase(),
          owner_name: name || null,
          reward_type: "percentage",
          reward_value: 10,
          owner_reward_value: 10,
        })
        .select("code")
        .single();

      if (insertErr) throw insertErr;

      return new Response(JSON.stringify({ code: created.code, uses: 0, new: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[REFERRAL] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

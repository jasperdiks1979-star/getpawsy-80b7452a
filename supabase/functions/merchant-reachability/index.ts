const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) {
      return new Response(
        JSON.stringify({ ok: false, error: "SUPABASE_URL not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const pingUrl = `${supabaseUrl}/functions/v1/merchant-status`;
    const start = Date.now();

    try {
      const res = await fetch(pingUrl, {
        method: "OPTIONS",
        signal: AbortSignal.timeout(8000),
      });
      const latencyMs = Date.now() - start;

      return new Response(
        JSON.stringify({
          ok: true,
          reachable: true,
          latencyMs,
          status: res.status,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (fetchErr) {
      const latencyMs = Date.now() - start;
      const message = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      const errorType = message.includes("timed out") || message.includes("timeout")
        ? "timeout"
        : message.includes("DNS") || message.includes("resolve") || message.includes("getaddrinfo")
        ? "dns"
        : "network";

      return new Response(
        JSON.stringify({
          ok: true,
          reachable: false,
          latencyMs,
          errorType,
          error: errorType === "dns"
            ? "DNS resolution failed"
            : errorType === "timeout"
            ? "Connection timed out (8s)"
            : "Network error",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    console.error("[merchant-reachability] Error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

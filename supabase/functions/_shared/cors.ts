// Shared CORS headers for edge functions. The previous import path
// `npm:@supabase/supabase-js@2/cors` does not exist and caused ~265 functions
// to fail to boot with a module-not-found error. This local module replaces it.
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-application-name, x-client-probe-id",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  "Access-Control-Expose-Headers": "x-client-probe-id, x-echo-probe-id",
};
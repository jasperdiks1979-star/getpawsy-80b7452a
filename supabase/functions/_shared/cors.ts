// Shared CORS headers for edge functions. The previous import path
// `npm:@supabase/supabase-js@2/cors` does not exist and caused ~265 functions
// to fail to boot with a module-not-found error. This local module replaces it.
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-application-name",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
};
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

// Test GSC API connectivity using stored service account credentials
async function testGSCConnectivity(credentials: { client_email: string; private_key: string }): Promise<{
  success: boolean;
  responseTimeMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const payload = {
      iss: credentials.client_email,
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 300,
      iat: now
    };

    const encoder = new TextEncoder();
    const base64url = (data: Uint8Array): string => {
      const base64 = btoa(String.fromCharCode(...data));
      return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    };

    const headerB64 = base64url(encoder.encode(JSON.stringify(header)));
    const payloadB64 = base64url(encoder.encode(JSON.stringify(payload)));
    const signatureInput = `${headerB64}.${payloadB64}`;

    const pemContents = credentials.private_key
      .replace(/-----BEGIN PRIVATE KEY-----/g, '')
      .replace(/-----END PRIVATE KEY-----/g, '')
      .replace(/\n/g, '');

    const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8', binaryKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false, ['sign']
    );

    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, encoder.encode(signatureInput));
    const signatureB64 = base64url(new Uint8Array(signature));
    const jwt = `${signatureInput}.${signatureB64}`;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
      })
    });

    const elapsed = Date.now() - start;

    if (!tokenResponse.ok) {
      const err = await tokenResponse.json();
      return { success: false, responseTimeMs: elapsed, error: err.error_description || err.error || 'Token exchange failed' };
    }

    return { success: true, responseTimeMs: elapsed };
  } catch (e) {
    return { success: false, responseTimeMs: Date.now() - start, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// Test GA4 API connectivity
async function testGA4Connectivity(credentials: { client_email: string; private_key: string }): Promise<{
  success: boolean;
  responseTimeMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const payload = {
      iss: credentials.client_email,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 300,
      iat: now
    };

    const encoder = new TextEncoder();
    const base64url = (data: Uint8Array): string => {
      const base64 = btoa(String.fromCharCode(...data));
      return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    };

    const headerB64 = base64url(encoder.encode(JSON.stringify(header)));
    const payloadB64 = base64url(encoder.encode(JSON.stringify(payload)));
    const signatureInput = `${headerB64}.${payloadB64}`;

    const pemContents = credentials.private_key
      .replace(/-----BEGIN PRIVATE KEY-----/g, '')
      .replace(/-----END PRIVATE KEY-----/g, '')
      .replace(/\n/g, '');

    const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8', binaryKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false, ['sign']
    );

    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, encoder.encode(signatureInput));
    const signatureB64 = base64url(new Uint8Array(signature));
    const jwt = `${signatureInput}.${signatureB64}`;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
      })
    });

    const elapsed = Date.now() - start;

    if (!tokenResponse.ok) {
      const err = await tokenResponse.json();
      return { success: false, responseTimeMs: elapsed, error: err.error_description || err.error || 'Token exchange failed' };
    }

    return { success: true, responseTimeMs: elapsed };
  } catch (e) {
    return { success: false, responseTimeMs: Date.now() - start, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// Calculate risk score based on multiple factors
function calculateRiskScore(params: {
  keyAgeDays: number;
  consecutiveFailures: number;
  hasOverPrivilegedRoles: boolean;
  recoveryMode: boolean;
  anomalyCount: number;
}): number {
  let score = 0;

  // Key age risk
  if (params.keyAgeDays >= 90) score += 40;
  else if (params.keyAgeDays >= 75) score += 25;
  else if (params.keyAgeDays >= 60) score += 10;

  // Failure risk
  score += Math.min(params.consecutiveFailures * 10, 30);

  // IAM risk
  if (params.hasOverPrivilegedRoles) score += 15;

  // Recovery mode
  if (params.recoveryMode) score += 10;

  // Anomalies
  score += Math.min(params.anomalyCount * 5, 15);

  return Math.min(score, 100);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // HARDENED: require internal-secret (cron) or admin JWT. Anon requests are rejected.
  const gate = await requireInternalOrAdmin(req);
  if (gate) return gate;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[CREDENTIAL-HEALTH] Starting health check cycle');

    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');

    // Fetch all active service account keys
    const { data: keys, error: keysError } = await supabase
      .from('service_account_keys')
      .select('*')
      .eq('is_active', true);

    if (keysError) throw keysError;

    const results: Array<{
      accountName: string;
      status: string;
      riskScore: number;
      responseTimeMs: number;
      error?: string;
    }> = [];

    let credentials: { client_email: string; private_key: string } | null = null;
    if (serviceAccountJson) {
      try {
        credentials = JSON.parse(serviceAccountJson);
      } catch {
        console.error('[CREDENTIAL-HEALTH] Failed to parse service account JSON');
      }
    }

    for (const key of (keys || [])) {
      const keyAgeDays = Math.floor((Date.now() - new Date(key.key_created_at).getTime()) / (1000 * 60 * 60 * 24));
      let checkResult: { success: boolean; responseTimeMs: number; error?: string } = { success: false, responseTimeMs: 0, error: 'No credentials available' };

      // Run connectivity test based on service type
      if (credentials) {
        if (key.account_name.toLowerCase().includes('gsc') || key.service_description?.toLowerCase().includes('search console')) {
          checkResult = await testGSCConnectivity(credentials);
        } else if (key.account_name.toLowerCase().includes('ga4') || key.service_description?.toLowerCase().includes('analytics')) {
          checkResult = await testGA4Connectivity(credentials);
        } else {
          // Generic test - try GSC scope as default
          checkResult = await testGSCConnectivity(credentials);
        }
      }

      // Count recent anomalies
      const { count: anomalyCount } = await supabase
        .from('security_anomaly_events')
        .select('*', { count: 'exact', head: true })
        .eq('service_account_key_id', key.id)
        .eq('resolved', false);

      const hasOverPrivilegedRoles = (key.iam_roles || []).some(
        (r: string) => r.includes('owner') || r.includes('editor')
      );

      const riskScore = calculateRiskScore({
        keyAgeDays,
        consecutiveFailures: checkResult.success ? 0 : (key.consecutive_failures || 0) + 1,
        hasOverPrivilegedRoles,
        recoveryMode: key.recovery_mode || false,
        anomalyCount: anomalyCount || 0,
      });

      // Determine health status
      let healthStatus = 'healthy';
      if (!checkResult.success) healthStatus = 'failing';
      else if (keyAgeDays >= 90) healthStatus = 'critical';
      else if (keyAgeDays >= 75) healthStatus = 'warning';

      // Determine rotation status
      let rotationStatus = key.rotation_status;
      if (keyAgeDays >= 90 && rotationStatus !== 'rotating') {
        rotationStatus = 'critical';
      } else if (keyAgeDays >= 75 && rotationStatus === 'healthy') {
        rotationStatus = 'warning';
      }

      // Self-healing: if check failed, enter recovery mode
      const newConsecutiveFailures = checkResult.success ? 0 : (key.consecutive_failures || 0) + 1;
      const enterRecoveryMode = !checkResult.success && newConsecutiveFailures >= 3;

      // Update the service account key
      await supabase
        .from('service_account_keys')
        .update({
          risk_score: riskScore,
          last_health_check_at: new Date().toISOString(),
          health_check_status: healthStatus,
          consecutive_failures: newConsecutiveFailures,
          recovery_mode: enterRecoveryMode || key.recovery_mode,
          recovery_started_at: enterRecoveryMode && !key.recovery_mode ? new Date().toISOString() : key.recovery_started_at,
          rotation_status: rotationStatus,
          last_anomaly_check_at: new Date().toISOString(),
        })
        .eq('id', key.id);

      // Store health check result
      await supabase
        .from('credential_health_checks')
        .insert({
          service_account_key_id: key.id,
          check_type: key.account_name.toLowerCase().includes('gsc') ? 'gsc_api' : 'ga4_api',
          status: checkResult.success ? 'pass' : 'fail',
          response_time_ms: checkResult.responseTimeMs,
          error_message: checkResult.error || null,
          details: {
            key_age_days: keyAgeDays,
            risk_score: riskScore,
            recovery_mode: enterRecoveryMode,
          },
        });

      // Create anomaly event if entering recovery mode
      if (enterRecoveryMode && !key.recovery_mode) {
        await supabase
          .from('security_anomaly_events')
          .insert({
            service_account_key_id: key.id,
            event_type: 'credential_failure',
            severity: 'critical',
            description: `Service account ${key.account_name} entered recovery mode after ${newConsecutiveFailures} consecutive failures`,
            details: { consecutive_failures: newConsecutiveFailures, last_error: checkResult.error },
          });

        // Log rotation event
        await supabase
          .from('key_rotation_logs')
          .insert([{
            service_account_key_id: key.id,
            account_name: key.account_name,
            action: 'rotation_started',
            details: { reason: 'Auto-recovery: consecutive credential failures', failures: newConsecutiveFailures },
          }]);
      }

      // Create anomaly for key age threshold
      if (keyAgeDays === 75 || keyAgeDays === 90) {
        const existing = await supabase
          .from('security_anomaly_events')
          .select('id')
          .eq('service_account_key_id', key.id)
          .eq('event_type', 'key_age_threshold')
          .eq('resolved', false)
          .limit(1);

        if (!existing.data?.length) {
          await supabase
            .from('security_anomaly_events')
            .insert({
              service_account_key_id: key.id,
              event_type: 'key_age_threshold',
              severity: keyAgeDays >= 90 ? 'critical' : 'warning',
              description: `Key for ${key.account_name} is ${keyAgeDays} days old — ${keyAgeDays >= 90 ? 'mandatory' : 'recommended'} rotation`,
              details: { key_age_days: keyAgeDays, threshold: keyAgeDays >= 90 ? 90 : 75 },
            });
        }
      }

      // If recovery was active and check now passes, auto-resolve
      if (checkResult.success && key.recovery_mode) {
        await supabase
          .from('service_account_keys')
          .update({
            recovery_mode: false,
            recovery_started_at: null,
            consecutive_failures: 0,
          })
          .eq('id', key.id);

        await supabase
          .from('security_anomaly_events')
          .update({ resolved: true, resolved_at: new Date().toISOString() })
          .eq('service_account_key_id', key.id)
          .eq('event_type', 'credential_failure')
          .eq('resolved', false);

        await supabase
          .from('key_rotation_logs')
          .insert([{
            service_account_key_id: key.id,
            account_name: key.account_name,
            action: 'validated',
            details: { reason: 'Auto-recovery: credentials restored successfully' },
          }]);
      }

      results.push({
        accountName: key.account_name,
        status: healthStatus,
        riskScore,
        responseTimeMs: checkResult.responseTimeMs,
        error: checkResult.error,
      });
    }

    // Cleanup old health checks (keep 30 days)
    await supabase
      .from('credential_health_checks')
      .delete()
      .lt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    console.log('[CREDENTIAL-HEALTH] Health check complete:', results.length, 'keys');

    // HARDENED: minimal response — no per-account errors, credentials, project IDs
    // or Google metadata leak out to the caller. Detail lives in the DB rows.
    const healthy = results.filter(r => r.status === 'healthy').length;
    const unhealthy = results.length - healthy;
    const avgResponseMs = results.length
      ? Math.round(results.reduce((s, r) => s + (r.responseTimeMs || 0), 0) / results.length)
      : 0;

    return new Response(JSON.stringify({
      ok: true,
      checked_count: results.length,
      healthy_count: healthy,
      unhealthy_count: unhealthy,
      response_time_ms: avgResponseMs,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[CREDENTIAL-HEALTH] Error:', error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({ ok: false, error: 'internal_error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

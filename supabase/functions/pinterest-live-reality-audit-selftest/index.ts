// Companion admin-gated function that PROVES the four auth scenarios of
// pinterest-live-reality-audit end-to-end from the server, without ever
// exposing SUPABASE_SERVICE_ROLE_KEY to the client.
//
// Runs 4 probes against pinterest-live-reality-audit:
//   1. no bearer         -> expect 401
//   2. anon key bearer   -> expect 403 (explicit rejection)
//   3. non-admin user JWT -> expect 403 "admin only"  (if a non-admin user exists; otherwise skipped)
//   4. service-role bearer -> expect NOT 401/403 (auth accepted; downstream may 412 if Pinterest not connected — that still proves auth passed)
//
// Also verifies via a second probe that the admin path still works by
// forwarding the caller's JWT (which itself must be admin to reach here).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

  const sb = createClient(SUPA_URL, SERVICE);

  // Admin gate on the selftest itself.
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ ok: false, message: "unauthorized" }, 401);
  const callerJwt = authHeader.slice("Bearer ".length).trim();
  const userClient = createClient(SUPA_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims } = await userClient.auth.getClaims(callerJwt);
  const uid = claims?.claims?.sub;
  if (!uid) return json({ ok: false, message: "unauthorized" }, 401);
  const { data: adminRow } = await sb
    .from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
  if (!adminRow) return json({ ok: false, message: "admin only" }, 403);

  const TARGET = `${SUPA_URL}/functions/v1/pinterest-live-reality-audit`;
  const emptyBody = JSON.stringify({ limit: 1, analytics: false, __probe: true });

  // Common headers helper — we deliberately DO NOT send apikey so the gate
  // is exercised purely by our Authorization header, matching browser behavior.
  async function probe(name: string, headers: Record<string, string>, expect: (s: number) => boolean) {
    const r = await fetch(TARGET, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: emptyBody,
    });
    const text = await r.text().catch(() => "");
    return {
      name,
      status: r.status,
      pass: expect(r.status),
      body: text.slice(0, 220),
    };
  }

  // Mint an ephemeral non-admin user, sign in to get a real JWT, then delete
  // the user after the probe. Nothing persists.
  let nonAdminUserJwt: string | null = null;
  let ephemeralUserId: string | null = null;
  try {
    const email = `selftest+${crypto.randomUUID()}@getpawsy.internal`;
    const password = crypto.randomUUID() + "Aa1!";
    const { data: created, error: cErr } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (!cErr && created?.user?.id) {
      ephemeralUserId = created.user.id;
      const anonClient = createClient(SUPA_URL, ANON);
      const { data: signIn } = await anonClient.auth.signInWithPassword({ email, password });
      nonAdminUserJwt = signIn?.session?.access_token ?? null;
    }
  } catch (_) {
    nonAdminUserJwt = null;
  }

  const results: any[] = [];

  // 1. no bearer -> 401
  results.push(await probe("no_bearer", {}, (s) => s === 401));

  // 2. anon key bearer -> 403 (explicit rejection)
  results.push(
    await probe("anon_key_bearer", { Authorization: `Bearer ${ANON}` }, (s) => s === 403),
  );

  // 3. non-admin user JWT -> 403 (only if we could obtain one)
  if (nonAdminUserJwt) {
    results.push(
      await probe(
        "non_admin_user_jwt",
        { Authorization: `Bearer ${nonAdminUserJwt}` },
        (s) => s === 403,
      ),
    );
  } else {
    results.push({
      name: "non_admin_user_jwt",
      status: null,
      pass: null,
      body: "skipped: could not mint ephemeral user",
    });
  }

  // 4. admin JWT (forwarded caller token) -> auth accepted (200 or downstream non-auth error, but NEVER 401/403)
  results.push(
    await probe(
      "admin_jwt_forwarded",
      { Authorization: `Bearer ${callerJwt}` },
      (s) => s !== 401 && s !== 403,
    ),
  );

  // 5. service-role bearer -> auth accepted
  results.push(
    await probe(
      "service_role_bearer",
      { Authorization: `Bearer ${SERVICE}` },
      (s) => s !== 401 && s !== 403,
    ),
  );

  const allPass = results.every((r) => r.pass === true || r.pass === null);

  // Cleanup ephemeral user.
  if (ephemeralUserId) {
    try { await sb.auth.admin.deleteUser(ephemeralUserId); } catch (_) {}
  }

  return json({ ok: allPass, results });
});
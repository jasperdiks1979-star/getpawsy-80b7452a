// Triggers a fresh deploy of the Render worker via the Render REST API,
// using the existing RENDER_API_KEY secret. This bypasses the (currently
// disabled) Manual Deploy button in the Render dashboard and does NOT
// require RENDER_WORKER_DEPLOY_HOOK_URL to be configured.
//
// Why: even when edge functions hold the new RENDER_WORKER_SECRET, the
// Render container still has the OLD secret baked into its process env
// until the container restarts. POST /v1/services/{id}/deploys causes
// Render to start a new container which re-reads env vars at boot.
//
// Auth: same shape as render-worker-deploy — either x-deploy-secret
// (CI) or an admin-role Supabase JWT.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const RENDER_API = "https://api.render.com/v1";
const KEY = Deno.env.get("RENDER_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEPLOY_SECRET = Deno.env.get("RENDER_WORKER_DEPLOY_SECRET") ?? "";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function rApi(path: string, init: RequestInit = {}) {
  const r = await fetch(`${RENDER_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${KEY}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const t = await r.text();
  let body: unknown = t;
  try { body = JSON.parse(t); } catch { /* keep text */ }
  return { status: r.status, body };
}

function pickWorkerService(arr: any[]): any | null {
  const services = arr.map((s) => s.service ?? s);
  // Prefer name containing "render-worker" or "getpawsy-render-worker"
  const byName = services.find((s) =>
    typeof s?.name === "string" && /render[-_]?worker/i.test(s.name)
  );
  if (byName) return byName;
  // Fallback: any non-static, non-suspended web/worker service pointing at
  // the getpawsy-render-worker GHCR image.
  const byImage = services.find((s) => {
    const img = s?.imagePath ?? s?.serviceDetails?.image?.imagePath ?? "";
    return typeof img === "string" && /getpawsy-render-worker/i.test(img);
  });
  return byImage ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!KEY) return json(500, { ok: false, message: "RENDER_API_KEY missing" });

  // ---- AUTH ----
  const sharedSecret = req.headers.get("x-deploy-secret") ?? "";
  const isCi = !!DEPLOY_SECRET && sharedSecret === DEPLOY_SECRET;
  if (!isCi) {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json(401, { ok: false, message: "Missing auth" });
    }
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return json(401, { ok: false, message: "Invalid token" });
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) return json(403, { ok: false, message: "Admin only" });
  }

  // Optional override: ?service=srv-xxxx
  const url = new URL(req.url);
  let serviceId = url.searchParams.get("service") ?? "";

  if (!serviceId) {
    const all = await rApi("/services?limit=100");
    if (all.status >= 300) {
      return json(502, { ok: false, message: "render list failed", detail: all });
    }
    const arr = Array.isArray(all.body) ? all.body : [];
    const picked = pickWorkerService(arr);
    if (!picked) {
      return json(404, {
        ok: false,
        message: "No render-worker service found via Render API",
        candidates: arr.map((s: any) => {
          const x = s.service ?? s;
          return { id: x.id, name: x.name, image: x.imagePath ?? x.serviceDetails?.image?.imagePath };
        }),
      });
    }
    serviceId = picked.id;
  }

  // Trigger a fresh deploy. clearCache=false keeps it fast; the goal is
  // a new container so env vars (RENDER_WORKER_SECRET) are re-read.
  const deploy = await rApi(`/services/${serviceId}/deploys`, {
    method: "POST",
    body: JSON.stringify({ clearCache: "do_not_clear" }),
  });

  const ok = deploy.status >= 200 && deploy.status < 300;
  return json(ok ? 200 : 502, {
    ok,
    service_id: serviceId,
    render_status: deploy.status,
    deploy: deploy.body,
    note: ok
      ? "Deploy triggered. The new container will boot in ~30–90s and pick up the latest RENDER_WORKER_SECRET. Re-run the self-test after the heartbeats resume."
      : "Render API rejected the deploy request. Check the body above.",
  });
});
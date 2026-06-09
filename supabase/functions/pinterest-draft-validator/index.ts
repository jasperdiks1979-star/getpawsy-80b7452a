import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type DraftRow = {
  id: string;
  product_id: string | null;
  product_slug: string | null;
  pin_image_url: string | null;
  destination_link: string | null;
  board_name: string | null;
  overlay_text: string | null;
  pin_title: string | null;
  status: string;
  validation_status: string | null;
  meta: Record<string, unknown> | null;
};

async function headOk(url: string, timeoutMs = 8000): Promise<{ ok: boolean; status: number }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctrl.signal });
    if (res.status === 405 || res.status === 403) {
      // some CDNs reject HEAD — fall back to GET
      res = await fetch(url, { method: "GET", redirect: "follow", signal: ctrl.signal });
    }
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const onlyCleanup = body.onlyCleanup !== false; // default: validate cleanup replacements only

    let q = supabase
      .from("pinterest_pin_queue")
      .select("id,product_id,product_slug,pin_image_url,destination_link,board_name,overlay_text,pin_title,status,validation_status,meta")
      .eq("status", "draft")
      .limit(500);
    if (onlyCleanup) q = q.eq("meta->>origin", "cleanup_audit_replacement");

    const { data: drafts, error } = await q;
    if (error) throw error;
    const rows = (drafts ?? []) as DraftRow[];

    // 1) Dedupe by (product_id, overlay_text) — keep oldest, reject rest
    const dupSeen = new Set<string>();
    const dupRejects: string[] = [];
    for (const r of rows) {
      const key = `${r.product_id ?? ""}::${(r.overlay_text ?? "").toLowerCase().trim()}`;
      if (dupSeen.has(key)) dupRejects.push(r.id);
      else dupSeen.add(key);
    }

    // 2) Stock check via products table
    const productIds = Array.from(new Set(rows.map((r) => r.product_id).filter(Boolean))) as string[];
    const stockMap = new Map<string, { active: boolean; inStock: boolean }>();
    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from("products")
        .select("id,is_active,availability")
        .in("id", productIds);
      for (const p of products ?? []) {
        const active = (p as any).is_active !== false;
        const availability = ((p as any).availability ?? "").toString().toLowerCase();
        const inStock =
          availability.includes("in stock") ||
          availability.includes("in_stock") ||
          availability === "instock";
        stockMap.set((p as any).id, { active, inStock });
      }
    }

    // 3) Board assignment check via pinterest_boards
    const boardNames = Array.from(new Set(rows.map((r) => r.board_name).filter(Boolean))) as string[];
    const boardOk = new Set<string>();
    if (boardNames.length > 0) {
      const { data: boards } = await supabase
        .from("pinterest_boards")
        .select("name,is_sandbox,is_blacklisted,production_verified");
      for (const b of boards ?? []) {
        const name = (b as any).name as string | null;
        const enabled =
          (b as any).is_sandbox === false &&
          (b as any).is_blacklisted === false &&
          (b as any).production_verified === true;
        if (name && enabled) boardOk.add(name);
      }
    }

    const results: Array<{
      id: string;
      pass: boolean;
      reasons: string[];
      checks: Record<string, unknown>;
    }> = [];

    for (const r of rows) {
      const reasons: string[] = [];
      const checks: Record<string, unknown> = {};

      // duplicate
      if (dupRejects.includes(r.id)) reasons.push("duplicate_overlay_for_product");

      // stock
      const s = r.product_id ? stockMap.get(r.product_id) : undefined;
      checks.product_active = s?.active ?? null;
      checks.product_in_stock = s?.inStock ?? null;
      if (!s) reasons.push("product_not_found");
      else {
        if (!s.active) reasons.push("product_inactive");
        if (!s.inStock) reasons.push("product_out_of_stock");
      }

      // board
      checks.board_assigned = !!r.board_name && boardOk.has(r.board_name);
      if (!r.board_name) reasons.push("missing_board");
      else if (!boardOk.has(r.board_name)) reasons.push("board_not_enabled");

      // title/overlay presence
      if (!r.overlay_text || r.overlay_text.length < 4) reasons.push("missing_overlay");
      if (!r.pin_title || r.pin_title.length < 4) reasons.push("missing_title");

      // image fetch
      if (!r.pin_image_url) reasons.push("missing_image");
      else {
        const ic = await headOk(r.pin_image_url);
        checks.image_status = ic.status;
        if (!ic.ok) reasons.push(`image_unreachable_${ic.status}`);
      }

      // destination link
      if (!r.destination_link) reasons.push("missing_destination");
      else {
        const dc = await headOk(r.destination_link);
        checks.destination_status = dc.status;
        if (!dc.ok) reasons.push(`destination_http_${dc.status}`);
      }

      results.push({ id: r.id, pass: reasons.length === 0, reasons, checks });
    }

    // 4) Write validation status back
    const passIds = results.filter((r) => r.pass).map((r) => r.id);
    const failResults = results.filter((r) => !r.pass);

    if (passIds.length > 0) {
      await supabase
        .from("pinterest_pin_queue")
        .update({
          validation_status: "ready_for_review",
          last_validated_at: new Date().toISOString(),
          last_validation_error: null,
        })
        .in("id", passIds);
    }

    for (const f of failResults) {
      await supabase
        .from("pinterest_pin_queue")
        .update({
          validation_status: "validation_failed",
          last_validated_at: new Date().toISOString(),
          last_validation_error: f.reasons.join(", ").slice(0, 500),
        })
        .eq("id", f.id);
    }

    // 5) Log a summary action
    await supabase.from("pinterest_winner_actions_log").insert({
      action_type: "validate_draft",
      reason: `validated ${rows.length} drafts: ${passIds.length} pass, ${failResults.length} fail`,
      details: {
        total: rows.length,
        pass: passIds.length,
        fail: failResults.length,
        failure_breakdown: failResults.reduce((acc: Record<string, number>, r) => {
          for (const reason of r.reasons) acc[reason] = (acc[reason] ?? 0) + 1;
          return acc;
        }, {}),
      },
      source: "pinterest-draft-validator",
    });

    return new Response(
      JSON.stringify({
        ok: true,
        traceId,
        message: "validation_complete",
        evaluated: rows.length,
        passed: passIds.length,
        failed: failResults.length,
        sampleFailures: failResults.slice(0, 5),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[pinterest-draft-validator]", traceId, err);
    return new Response(
      JSON.stringify({ ok: false, traceId, message: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
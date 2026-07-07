import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

/**
 * Pinterest AI-Only Enforcement
 * ─────────────────────────────
 * Single-button operation invoked from the admin Pin Source Audit page.
 * Order:
 *   A) Backfill Creative Director meta on all /creative-director/ rows
 *   B) Block legacy / non-AI publishable rows (status = blocked_legacy_source)
 *   C) Set pinterest_runtime_settings.allow_legacy_product_feed = false
 *   D) Verify next publishable rows (AI-only)
 *   E) Return audit summary
 *
 * Never deletes rows. Never touches posted pins. Never alters auth/secrets.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "audit"; // "audit" | "enforce"

  try {
    if (mode === "enforce") {
      // A. Backfill
      const backfill = await sb
        .from("pinterest_pin_queue")
        .select("id, meta")
        .ilike("pin_image_url", "%/creative-director/%")
        .in("status", ["queued","approved","ready","draft","posted","scheduled","publishing"]);
      let backfilled = 0;
      for (const row of (backfill.data ?? []) as any[]) {
        const m = (row.meta ?? {}) as Record<string, unknown>;
        if ((m as any).creative_source === "creative_director_v2") continue;
        await sb.from("pinterest_pin_queue").update({
          meta: {
            ...m,
            creative_source: "creative_director_v2",
            ai_generated: true,
            generator: "pinterest-creative-director",
            quality_tier: "premium",
            legacy_feed: false,
            publish_allowed: true,
            backfilled_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        backfilled++;
      }

      // B. Block legacy publishable rows
      const legacy = await sb
        .from("pinterest_pin_queue")
        .select("id, pin_image_url, meta")
        .in("status", ["queued","scheduled"]);
      let blocked = 0;
      for (const row of (legacy.data ?? []) as any[]) {
        const url = String(row.pin_image_url ?? "");
        const m = (row.meta ?? {}) as Record<string, unknown>;
        if (url.includes("/creative-director/")) continue;
        if ((m as any).creative_source === "creative_director_v2") continue;
        const cat =
          /cjdropshipping\.com/i.test(url) ? "cj_supplier" :
          /getpawsy\.pet\/images\/products\//i.test(url) ? "product_image" :
          /res\.cloudinary\.com.*l_text/i.test(url) ? "cloudinary_template_overlay" :
          "untagged_non_creative_director";
        const csrc =
          cat === "cj_supplier" || cat === "product_image" ? "legacy_product_or_supplier_image" :
          cat === "cloudinary_template_overlay" ? "cloudinary_template_overlay" :
          ((m as any).creative_source as string) || "unknown_legacy";
        await sb.from("pinterest_pin_queue").update({
          status: "blocked_legacy_source",
          error_message: "legacy_or_non_ai_source_blocked_by_ai_only_gate",
          meta: {
            ...m,
            block_reason: "legacy_or_non_ai_source_blocked_by_ai_only_gate",
            blocked_at: new Date().toISOString(),
            source_category: cat,
            creative_source: csrc,
            legacy_feed: true,
            publish_allowed: false,
          },
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        blocked++;
      }

      // C. Disable bypass
      await sb.from("pinterest_runtime_settings").update({
        allow_legacy_product_feed: false,
        premium_engine_paused: false,
        updated_at: new Date().toISOString(),
      }).eq("id", 1);

      const audit = await runAudit(sb);
      return json({ ok: true, enforced: true, backfilled, blocked, audit });
    }

    const audit = await runAudit(sb);
    return json({ ok: true, enforced: false, audit });
  } catch (e) {
    console.error("[ai-only-enforce] error", e);
    return json({ ok: false, error: String((e as any)?.message ?? e) }, 500);
  }
});

async function runAudit(sb: any) {
  const { data: rt } = await sb
    .from("pinterest_runtime_settings")
    .select("allow_legacy_product_feed, premium_engine_paused, last_pin_publish_at, last_pin_publish_error, last_pin_external_url")
    .eq("id", 1)
    .maybeSingle();

  const countFor = async (q: any) => {
    const { count } = await q;
    return count ?? 0;
  };

  const cdStamped = await countFor(
    sb.from("pinterest_pin_queue")
      .select("id", { count: "exact", head: true })
      .filter("meta->>creative_source", "eq", "creative_director_v2"),
  );
  const cdPath = await countFor(
    sb.from("pinterest_pin_queue")
      .select("id", { count: "exact", head: true })
      .ilike("pin_image_url", "%/creative-director/%"),
  );
  // Rows with the CD path but no stamp — should be 0 after enforce
  const cdPathUnstamped = await countFor(
    sb.from("pinterest_pin_queue")
      .select("id", { count: "exact", head: true })
      .ilike("pin_image_url", "%/creative-director/%")
      .or("meta->>creative_source.is.null,meta->>creative_source.neq.creative_director_v2"),
  );
  const legacyBlocked = await countFor(
    sb.from("pinterest_pin_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "blocked_legacy_source"),
  );
  const nextPublishableAi = await countFor(
    sb.from("pinterest_pin_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued")
      .ilike("pin_image_url", "%/creative-director/%"),
  );
  const legacyStillPublishable = await countFor(
    sb.from("pinterest_pin_queue")
      .select("id", { count: "exact", head: true })
      .in("status", ["queued","scheduled"])
      .not("pin_image_url", "ilike", "%/creative-director/%"),
  );

  return {
    ai_only_gate_active: !(rt as any)?.allow_legacy_product_feed,
    allow_legacy_product_feed: !!(rt as any)?.allow_legacy_product_feed,
    premium_engine_paused: !!(rt as any)?.premium_engine_paused,
    creative_director_stamped_rows: cdStamped,
    creative_director_path_rows: cdPath,
    creative_director_path_unstamped_rows: cdPathUnstamped,
    legacy_rows_blocked: legacyBlocked,
    next_publishable_ai_rows: nextPublishableAi,
    legacy_rows_still_publishable: legacyStillPublishable,
    last_pin_publish_at: (rt as any)?.last_pin_publish_at ?? null,
    last_pin_publish_error: (rt as any)?.last_pin_publish_error ?? null,
    last_pin_external_url: (rt as any)?.last_pin_external_url ?? null,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
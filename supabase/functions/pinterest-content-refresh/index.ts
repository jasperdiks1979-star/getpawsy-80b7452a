// ─────────────────────────────────────────────────────────────────────────────
// pinterest-content-refresh
//
// Scans all pinterest_pin_queue rows for old banned overlays / banned marketing
// phrases, then for every match:
//   1. Builds new pin copy via the deterministic board templates.
//   2. Inserts a replacement draft row (status='draft', same destination_link,
//      same product, same board, references the old row via
//      replacement_for_pin_id).
//   3. Archives the outdated row (status='archived',
//      rejection_reason='content_refresh_banned_overlay').
//
// Top-performing products are processed first (pinterest_pin_performance).
// Returns a structured report: { old_pin_id, new_pin_id, board, product, status }.
// Set { dry_run: true } to preview without writing.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import {
  BANNED_PIN_PHRASES,
  buildPinCopy,
  validatePinCopy,
  type PinProductInfo,
} from "../_shared/pinterest-board-templates.ts";
import { detectNiche } from "../_shared/pinterest-style-dna.ts";

type Json = Record<string, unknown>;

interface RefreshRow {
  old_pin_id: string;
  new_pin_id: string | null;
  board: string | null;
  product: string | null;
  product_slug: string | null;
  status: "replaced" | "skipped" | "error" | "dry_run";
  reason?: string;
}

function pickBoardNiche(boardName: string | null, categoryKey: string | null): string {
  const hay = `${boardName || ""} ${categoryKey || ""}`.toLowerCase();
  if (hay.includes("litter")) return "cat_litter";
  if (hay.includes("cat tree") || hay.includes("cat_tree")) return "cat_tree";
  if (hay.includes("cat furniture") || hay.includes("cat_furniture")) return "cat_furniture";
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const traceId = crypto.randomUUID();
  const url = new URL(req.url);
  let dryRun = url.searchParams.get("dry_run") === "1";
  let limit = Number(url.searchParams.get("limit") || "100");

  if (req.method === "POST") {
    try {
      const body = (await req.json()) as Json;
      if (typeof body.dry_run === "boolean") dryRun = body.dry_run as boolean;
      if (typeof body.limit === "number") limit = body.limit as number;
    } catch (_) { /* no body */ }
  }
  if (!Number.isFinite(limit) || limit <= 0) limit = 100;
  limit = Math.min(limit, 1000);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Caller auth — admin only.
  const authHeader = req.headers.get("Authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  const isServiceCall = !!SERVICE_KEY && bearer === SERVICE_KEY;
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = isServiceCall ? { data: { user: null } } as any : await userClient.auth.getUser();
  const user = userData?.user;
  if (!user && !isServiceCall) {
    return new Response(
      JSON.stringify({ ok: false, traceId, message: "unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  if (!isServiceCall) {
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user!.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(
        JSON.stringify({ ok: false, traceId, message: "forbidden_admin_only" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  // 1. Pull every active queue row whose copy still contains a banned phrase.
  // PostgREST .or() can't handle commas inside ilike values, so run one query
  // per phrase and merge by id.
  const SELECT_COLS =
    "id, product_id, product_slug, product_name, board_id, board_name, " +
    "destination_link, pin_image_url, pin_title, pin_description, " +
    "overlay_text, category_key, hook_group, status, pinterest_pin_id, " +
    "pin_variant, hashtags";

  const merged = new Map<string, any>();
  for (const phrase of BANNED_PIN_PHRASES) {
    const like = `%${phrase}%`;
    for (const col of ["pin_title", "pin_description", "overlay_text"] as const) {
      const { data, error } = await admin
        .from("pinterest_pin_queue")
        .select(SELECT_COLS)
        .not("status", "in", "(archived,failed,rejected,deleted,error)")
        .ilike(col, like)
        .limit(limit * 4);
      if (error) {
        return new Response(
          JSON.stringify({ ok: false, traceId, message: "scan_failed", phrase, col, error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      for (const row of data ?? []) merged.set(row.id as string, row);
    }
  }
  const pool = Array.from(merged.values());
  if (pool.length === 0) {
    return new Response(
      JSON.stringify({
        ok: true, traceId, dry_run: dryRun,
        scanned: 0, replaced: 0, skipped: 0, errors: 0,
        report: [] as RefreshRow[],
        message: "no_banned_pins_found",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // 2. Rank by product performance (impressions desc, clicks desc).
  const productIds = Array.from(new Set(pool.map((r) => r.product_id).filter(Boolean))) as string[];

  const { data: perfRows } = await admin
    .from("pinterest_pin_performance")
    .select("product_id, impressions, clicks, performance_score")
    .in("product_id", productIds);

  const perfByProduct = new Map<string, number>();
  for (const p of perfRows ?? []) {
    const score =
      Number(p.performance_score || 0) * 100 +
      Number(p.clicks || 0) * 10 +
      Number(p.impressions || 0);
    perfByProduct.set(p.product_id as string, Math.max(perfByProduct.get(p.product_id as string) ?? 0, score));
  }

  const { data: prodRows } = await admin
    .from("products")
    .select("id, name, slug, category, price, benefit_angle")
    .in("id", productIds);
  const prodById = new Map<string, typeof prodRows[number]>();
  for (const p of prodRows ?? []) prodById.set(p.id, p);

  pool.sort((a, b) => (perfByProduct.get(b.product_id ?? "") ?? 0) - (perfByProduct.get(a.product_id ?? "") ?? 0));
  const work = pool.slice(0, limit);

  // 3. Regenerate + archive each row.
  const report: RefreshRow[] = [];
  let replaced = 0, skipped = 0, errors = 0;

  for (const row of work) {
    const product = prodById.get(row.product_id as string);
    const niche =
      pickBoardNiche(row.board_name as string | null, row.category_key as string | null) ||
      detectNiche({
        name: product?.name ?? row.product_name,
        slug: product?.slug ?? row.product_slug,
        category: product?.category ?? null,
      });

    const info: PinProductInfo = {
      name: product?.name ?? row.product_name ?? row.product_slug ?? "GetPawsy product",
      benefit: product?.benefit_angle ?? null,
      category: product?.category ?? null,
      price: typeof product?.price === "number" ? product?.price : null,
      niche: String(niche || ""),
    };

    const variantIndex = Math.floor(Math.random() * 4);
    const copy = buildPinCopy(info, variantIndex);
    const validation = validatePinCopy({
      title: copy.title,
      description: copy.description,
      overlay: copy.overlay,
      brandWordmark: copy.brandWordmark,
    });
    if (!validation.valid) {
      errors++;
      report.push({
        old_pin_id: row.id as string,
        new_pin_id: null,
        board: (row.board_name ?? row.board_id) as string | null,
        product: info.name,
        product_slug: row.product_slug as string | null,
        status: "error",
        reason: `validation_failed:${validation.errors.join(",")}`,
      });
      continue;
    }

    if (dryRun) {
      report.push({
        old_pin_id: row.id as string,
        new_pin_id: null,
        board: (row.board_name ?? row.board_id) as string | null,
        product: info.name,
        product_slug: row.product_slug as string | null,
        status: "dry_run",
      });
      continue;
    }

    // 3a. Insert replacement draft (same destination, same board, same image).
    const insertRow = {
      product_id: row.product_id,
      product_slug: row.product_slug,
      product_name: info.name,
      pin_variant: `refresh_v${variantIndex + 1}`,
      pin_title: copy.title,
      pin_description: copy.description,
      pin_image_url: row.pin_image_url,
      destination_link: row.destination_link,
      board_name: row.board_name,
      hashtags: row.hashtags ?? null,
      priority: "high" as const,
      status: "draft" as const,
      scheduled_at: new Date().toISOString(),
      hook_group: row.hook_group ?? null,
      category_key: row.category_key ?? null,
      overlay_text: copy.overlay,
      qa_reasons: ["content_refresh"],
    };

    const { data: inserted, error: insErr } = await admin
      .from("pinterest_pin_queue")
      .insert(insertRow)
      .select("id")
      .single();

    if (insErr || !inserted) {
      errors++;
      report.push({
        old_pin_id: row.id as string,
        new_pin_id: null,
        board: (row.board_name ?? row.board_id) as string | null,
        product: info.name,
        product_slug: row.product_slug as string | null,
        status: "error",
        reason: `insert_failed:${insErr?.message ?? "unknown"}`,
      });
      continue;
    }

    // 3b. Stamp replacement_for_pin_id on the new row (column exists on table).
    await admin
      .from("pinterest_pin_queue")
      .update({ replacement_for_pin_id: row.id })
      .eq("id", inserted.id);

    // 3c. Mark the outdated row as rejected (table CHECK doesn't allow 'archived').
    const { error: archErr } = await admin
      .from("pinterest_pin_queue")
      .update({
        status: "rejected",
        rejection_reason: "content_refresh_banned_overlay",
      })
      .eq("id", row.id);

    if (archErr) {
      errors++;
      report.push({
        old_pin_id: row.id as string,
        new_pin_id: inserted.id as string,
        board: (row.board_name ?? row.board_id) as string | null,
        product: info.name,
        product_slug: row.product_slug as string | null,
        status: "error",
        reason: `archive_failed:${archErr.message}`,
      });
      continue;
    }

    replaced++;
    report.push({
      old_pin_id: row.id as string,
      new_pin_id: inserted.id as string,
      board: (row.board_name ?? row.board_id) as string | null,
      product: info.name,
      product_slug: row.product_slug as string | null,
      status: "replaced",
    });
  }

  skipped = work.length - replaced - errors - (dryRun ? report.filter((r) => r.status === "dry_run").length : 0);

  return new Response(
    JSON.stringify({
      ok: true,
      traceId,
      dry_run: dryRun,
      banned_phrases: BANNED_PIN_PHRASES,
      scanned: pool.length,
      processed: work.length,
      replaced,
      skipped,
      errors,
      report,
      message: dryRun ? "dry_run_complete" : "refresh_complete",
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

// Note: every insert/update above also flows through the database trigger
// public.enforce_pin_copy_rules, so any regression in copy is rejected by both
// the in-function validatePinCopy() check and the database itself.
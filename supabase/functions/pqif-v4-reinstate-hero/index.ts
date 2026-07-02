// PQIF v4 — Hero SKU reinstatement (dry-run by default).
// Scores every rejected pinterest_pin_queue row for the hero product against
// the Pinterest Quality Firewall v2 (which is the pre-publish engine backing
// PQIF v4). Pins that return `decision === "pass"` are reinstated to
// `status='draft'` (rejection_reason cleared) so the human approval queue can
// pick them up. Everything else is left untouched.
//
// Body: {
//   productId?: string,                 // defaults to hero SKU
//   productSlug?: string,               // optional override
//   dryRun?: boolean,                   // default true
//   limit?: number,                     // default 500
//   includeReasons?: string[],          // optional filter on rejection_reason
// }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { evaluate, type FirewallInput } from "../_shared/pinterest-quality-firewall-v2.ts";

const HERO_PRODUCT_ID = "128e0207-8a94-4d71-b428-5b7f5002528f";

function svc() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const body = await req.json().catch(() => ({}));
  const productId: string = String(body?.productId ?? HERO_PRODUCT_ID);
  const dryRun: boolean = body?.dryRun !== false; // default true
  const limit: number = Math.max(1, Math.min(2000, Number(body?.limit ?? 500)));
  const offset: number = Math.max(0, Number(body?.offset ?? 0));
  const includeReasons: string[] | null = Array.isArray(body?.includeReasons) && body.includeReasons.length
    ? body.includeReasons.map(String)
    : null;

  const sb = svc();

  const { data: product, error: prodErr } = await sb
    .from("products")
    .select("id, slug, name, price")
    .eq("id", productId)
    .maybeSingle();
  if (prodErr || !product) {
    return new Response(
      JSON.stringify({ ok: false, error: "product_not_found", productId }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let q = sb
    .from("pinterest_pin_queue")
    .select(
      "id, product_id, product_slug, product_name, pin_title, pin_description, pin_image_url, pin_image_phash, image_hash, destination_link, external_url, creative_fingerprint, rejection_reason",
    )
    .eq("product_id", productId)
    .eq("status", "rejected")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (includeReasons) q = q.in("rejection_reason", includeReasons);

  const { data: rows, error: qErr } = await q;
  if (qErr) {
    return new Response(
      JSON.stringify({ ok: false, error: qErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const report = {
    ok: true,
    dry_run: dryRun,
    product_id: productId,
    product_slug: product.slug,
    offset,
    limit,
    scanned: rows?.length ?? 0,
    passed: 0,
    blocked: 0,
    reinstated: 0,
    pass_ids: [] as string[],
    reason_counts: {} as Record<string, number>,
    samples_passed: [] as any[],
    samples_blocked: [] as any[],
  };

  for (const r of rows ?? []) {
    const destination = String(r.destination_link ?? r.external_url ?? "");
    const input: FirewallInput = {
      queueId: r.id,
      productId,
      productSlug: product.slug,
      productName: product.name,
      title: r.pin_title ?? "",
      description: r.pin_description ?? "",
      imageUrl: r.pin_image_url ?? null,
      destinationUrl: destination,
      price: (product as any).price ?? null,
      imagePhash: r.pin_image_phash ?? null,
      imageHash: r.image_hash ?? null,
      creativeFingerprint: r.creative_fingerprint ?? null,
    };

    let verdict;
    try {
      verdict = await evaluate(sb, input, "pre_publish");
    } catch (e) {
      report.blocked++;
      const key = `evaluator_error:${(e as Error).message?.slice(0, 60)}`;
      report.reason_counts[key] = (report.reason_counts[key] ?? 0) + 1;
      continue;
    }

    if (verdict.decision === "pass") {
      report.passed++;
      report.pass_ids.push(r.id);
      if (report.samples_passed.length < 5) {
        report.samples_passed.push({
          id: r.id,
          title: r.pin_title,
          score: verdict.overallScore,
          previous_rejection: r.rejection_reason,
        });
      }
    } else {
      report.blocked++;
      for (const reason of verdict.reasons) {
        const key = reason.split(":")[0];
        report.reason_counts[key] = (report.reason_counts[key] ?? 0) + 1;
      }
      if (report.samples_blocked.length < 5) {
        report.samples_blocked.push({
          id: r.id,
          title: r.pin_title,
          score: verdict.overallScore,
          reasons: verdict.reasons.slice(0, 4),
        });
      }
    }
  }

  if (!dryRun && report.pass_ids.length > 0) {
    // Reinstate ONLY the passing rows. Everything else is left untouched.
    const { error: updErr, count } = await sb
      .from("pinterest_pin_queue")
      .update({
        status: "draft",
        rejection_reason: null,
        updated_at: new Date().toISOString(),
      }, { count: "exact" })
      .in("id", report.pass_ids);
    if (updErr) {
      return new Response(
        JSON.stringify({ ok: false, error: updErr.message, report }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    report.reinstated = count ?? report.pass_ids.length;
  }

  return new Response(JSON.stringify(report), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
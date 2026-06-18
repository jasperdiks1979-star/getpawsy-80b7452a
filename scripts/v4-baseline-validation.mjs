#!/usr/bin/env node
// V4 Baseline Validation
// Picks the 10 worst-scoring V3 videos from cinematic_v3_quality_audit,
// enqueues V4 versions via the orchestrator, and prints a comparison table.
//
// Pass criteria:
//   - at least 8/10 V4 jobs score >= 90
//   - zero safe_zone violations
//   - zero clipped captions
//   - zero supplier collages
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/v4-baseline-validation.mjs

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function pickWorstV3(n = 10) {
  const { data, error } = await sb
    .from("cinematic_v3_quality_audit")
    .select("job_id, slug, quality_score, issues, mp4_url")
    .order("quality_score", { ascending: true })
    .limit(n);
  if (error) throw error;
  return data ?? [];
}

async function enqueueV4(slug) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/cinematic-v4-orchestrator`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ slug, source: "baseline-validation" }),
  });
  const j = await res.json().catch(() => ({}));
  return { status: res.status, body: j };
}

async function pollV4(slug, timeoutMs = 1000 * 60 * 8) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await sb
      .from("cinematic_v4_jobs")
      .select("slug, status, quality_score, rejection_reasons, quality_report")
      .eq("slug", slug)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data && (data.status === "approved" || data.status === "rejected")) return data;
    await new Promise((r) => setTimeout(r, 5000));
  }
  return null;
}

async function main() {
  const worst = await pickWorstV3(10);
  if (worst.length === 0) {
    console.error("No V3 audit rows found. Run cinematic-v3-quality-audit first.");
    process.exit(2);
  }

  const rows = [];
  for (const v of worst) {
    process.stderr.write(`[v4-baseline] enqueue ${v.slug}\n`);
    await enqueueV4(v.slug);
    const result = await pollV4(v.slug);
    rows.push({
      slug: v.slug,
      v3_score: v.quality_score,
      v4_score: result?.quality_score ?? null,
      v4_status: result?.status ?? "timeout",
      issues: (result?.rejection_reasons ?? []).join(",") || "-",
    });
  }

  console.log("\n=== V4 Baseline Validation ===");
  console.log("slug | v3_score | v4_score | v4_status | issues");
  for (const r of rows) {
    console.log(`${r.slug} | ${r.v3_score} | ${r.v4_score} | ${r.v4_status} | ${r.issues}`);
  }

  const passing = rows.filter((r) => (r.v4_score ?? 0) >= 90).length;
  const safeZone = rows.filter((r) => r.issues.includes("text_exceeds_safe_zone") || r.issues.includes("safe_area")).length;
  const clipped = rows.filter((r) => r.issues.includes("caption_clipped")).length;
  const collage = rows.filter((r) => r.issues.includes("supplier_collage")).length;

  console.log(`\nPassing (>=90): ${passing}/10`);
  console.log(`Safe-zone violations: ${safeZone}`);
  console.log(`Clipped captions: ${clipped}`);
  console.log(`Supplier collages: ${collage}`);

  const ok = passing >= 8 && safeZone === 0 && clipped === 0 && collage === 0;
  console.log(`\nVERDICT: ${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
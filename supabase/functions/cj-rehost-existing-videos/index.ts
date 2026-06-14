// Manual rehost orchestrator for already-imported CJ videos.
//
// Iterates product_media rows (media_type='video', source='cj') that have NOT
// yet been rehosted (metadata.rehosted != true OR storage_url == supplier_url),
// downloads the source video from the CJ CDN, uploads it into the private
// `product-media` Supabase Storage bucket, and updates storage_url to a
// long-lived signed URL. supplier_url is preserved as the original CJ CDN
// fallback. If a download or upload fails, the row is left untouched (still
// playable via the CJ CDN URL) and counted as a failure.
//
// POST body:
//   { offset?: number, batch_size?: number (1-25), dry_run?: boolean,
//     run_id?: string, product_ids?: string[], media_ids?: string[],
//     force?: boolean }
//
// When media_ids is provided, only those product_media rows are processed
// (used by the per-row "Rehost video" button in the admin UI). Pagination
// is bypassed and `force` is implied so the row is always re-attempted.
//
// force=true reprocesses rows that are already marked rehosted (useful when a
// signed URL is close to expiry or the storage path was deleted).
//
// Returns:
//   { ok, run_id, processed, total, next_offset|null, done, totals }
//
// Auth: admin user OR x-internal-secret.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
const ADMIN_FALLBACK_EMAILS = ["jasperdiks@hotmail.com"];

const REHOST_BUCKET = "product-media";
const REHOST_MAX_BYTES = 60 * 1024 * 1024; // 60 MB
const REHOST_SIGNED_URL_TTL = 60 * 60 * 24 * 365 * 10; // 10 years

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extFromUrlOrType(url: string, contentType: string | null): string {
  const m = url.match(/\.(mp4|mov|webm|m4v)(\?|$)/i);
  if (m) return m[1].toLowerCase();
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("mp4")) return "mp4";
  if (ct.includes("webm")) return "webm";
  if (ct.includes("quicktime")) return "mov";
  return "mp4";
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type RehostResult = {
  success: boolean;
  signedUrl?: string;
  storagePath?: string;
  bytes?: number;
  contentType?: string;
  httpStatus?: number;
  attempts: number;
  error?: string;
  reason?: string;
};

async function rehostVideo(
  admin: ReturnType<typeof createClient>,
  productId: string,
  sourceUrl: string,
): Promise<RehostResult> {
  const MAX_ATTEMPTS = 3;
  let attempt = 0;
  let lastErr = "unknown";
  let lastStatus: number | undefined;
  let lastReason = "unknown";
  while (attempt < MAX_ATTEMPTS) {
    attempt++;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 45_000);
      // CJ's `download-only-api` host rejects requests without the
      // developers.cjdropshipping.com Referer (returns 403 text/html).
      // Setting it here makes the URLs fetchable server-side; the bytes
      // are then uploaded to Supabase Storage and served from there.
      const res = await fetch(sourceUrl, {
        signal: ctrl.signal,
        headers: {
          Referer: "https://developers.cjdropshipping.com",
          "User-Agent": "Mozilla/5.0 (compatible; GetPawsy-Rehoster/1.0)",
        },
      });
      clearTimeout(timer);
      lastStatus = res.status;
      if (!res.ok) {
        lastErr = `http_${res.status}`;
        lastReason = res.status === 429 ? "rate_limited" : res.status >= 500 ? "server_error" : "client_error";
        if (res.status !== 429 && res.status < 500) {
          return { success: false, attempts: attempt, httpStatus: res.status, error: lastErr, reason: lastReason };
        }
        await new Promise((r) => setTimeout(r, Math.min(8000, 1000 * 2 ** (attempt - 1)) + Math.random() * 250));
        continue;
      }
      const contentType = res.headers.get("content-type") ?? "video/mp4";
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength === 0) {
        return { success: false, attempts: attempt, httpStatus: res.status, error: "empty_body", reason: "empty_body" };
      }
      if (buf.byteLength > REHOST_MAX_BYTES) {
        return { success: false, attempts: attempt, httpStatus: res.status, error: "too_large", reason: "too_large", bytes: buf.byteLength, contentType };
      }
      const ext = extFromUrlOrType(sourceUrl, contentType);
      const hash = (await sha256Hex(sourceUrl)).slice(0, 16);
      const storagePath = `cj/${productId}/${hash}.${ext}`;
      const { error: upErr } = await admin.storage
        .from(REHOST_BUCKET)
        .upload(storagePath, buf, { contentType, upsert: true, cacheControl: "31536000" });
      if (upErr && !/exists/i.test(upErr.message)) {
        lastErr = `upload_failed:${upErr.message}`;
        lastReason = "upload_failed";
        await new Promise((r) => setTimeout(r, Math.min(8000, 1000 * 2 ** (attempt - 1)) + Math.random() * 250));
        continue;
      }
      const { data: signed, error: signErr } = await admin.storage
        .from(REHOST_BUCKET)
        .createSignedUrl(storagePath, REHOST_SIGNED_URL_TTL);
      if (signErr || !signed?.signedUrl) {
        return { success: false, attempts: attempt, httpStatus: res.status, error: `sign_failed:${signErr?.message ?? "no_url"}`, reason: "sign_failed", bytes: buf.byteLength, contentType };
      }
      return {
        success: true,
        signedUrl: signed.signedUrl,
        storagePath,
        bytes: buf.byteLength,
        contentType,
        httpStatus: res.status,
        attempts: attempt,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastErr = msg;
      lastReason = /abort|timeout/i.test(msg) ? "timeout" : "network_error";
      await new Promise((r) => setTimeout(r, Math.min(8000, 1000 * 2 ** (attempt - 1)) + Math.random() * 250));
    }
  }
  return { success: false, attempts: attempt, httpStatus: lastStatus, error: lastErr, reason: lastReason };
}

function isAdminClaims(c: Record<string, unknown> | null): boolean {
  if (!c) return false;
  if (c.role === "admin" || c.role === "director") return true;
  const email = typeof c.email === "string" ? c.email.toLowerCase().trim() : "";
  return ADMIN_FALLBACK_EMAILS.includes(email);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);

  // ---- Auth ----
  let authed = false;
  if (INTERNAL_SECRET && req.headers.get("x-internal-secret") === INTERNAL_SECRET) {
    authed = true;
  } else {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader.startsWith("Bearer ")) {
      const user = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: ures } = await user.auth.getUser();
      if (ures?.user) {
        const adminSb = createClient(SUPABASE_URL, SERVICE_KEY);
        const { data: role } = await adminSb
          .from("user_roles").select("role")
          .eq("user_id", ures.user.id).eq("role", "admin").maybeSingle();
        const email = ures.user.email ?? "";
        if (role || ADMIN_FALLBACK_EMAILS.includes(email.toLowerCase())) authed = true;
        else {
          const { data: claims } = await user.auth.getClaims(authHeader.replace("Bearer ", ""));
          if (isAdminClaims(claims?.claims ?? null)) authed = true;
        }
      }
    }
  }
  if (!authed) return json({ ok: false, traceId, message: "admin required" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const body = await req.json().catch(() => ({}));
  const offset: number = Math.max(0, Number(body?.offset ?? 0));
  const batchSize: number = Math.min(Math.max(Number(body?.batch_size ?? 10), 1), 25);
  const dryRun: boolean = !!body?.dry_run;
  const mediaIds: string[] | undefined = Array.isArray(body?.media_ids) && body.media_ids.length > 0 ? body.media_ids : undefined;
  const force: boolean = !!body?.force || !!mediaIds;
  const productIds: string[] | undefined = Array.isArray(body?.product_ids) ? body.product_ids : undefined;
  let runId: string = body?.run_id ?? "";

  if (!runId) {
    const { data: runRow } = await admin
      .from("cj_sync_runs")
      .insert({
        mode: dryRun ? "dry_run_rehost" : mediaIds ? "rehost_manual_single" : "rehost_existing_videos",
        triggered_by: "admin",
        status: "running",
      })
      .select("id")
      .single();
    runId = runRow?.id as string;
  }

  // Candidate rows: cj videos with a supplier_url. When not force, exclude
  // rows already rehosted (storage_url differs from supplier_url AND metadata
  // marks them as rehosted=true).
  const baseFilter = (q: ReturnType<typeof admin.from> extends infer T ? any : any) => {
    q = q.eq("media_type", "video").eq("source", "cj").not("supplier_url", "is", null);
    if (mediaIds?.length) q = q.in("id", mediaIds);
    if (productIds?.length) q = q.in("product_id", productIds);
    if (!force && !mediaIds) {
      // metadata->>rehosted is null OR 'false' — both treated as not yet rehosted.
      q = q.or("metadata->>rehosted.is.null,metadata->>rehosted.eq.false");
    }
    return q;
  };

  const { count: totalCount } = await baseFilter(
    admin.from("product_media").select("id", { count: "exact", head: true }),
  );
  const total = totalCount ?? 0;

  let query = baseFilter(
    admin
      .from("product_media")
      .select("id, product_id, cj_product_id, supplier_url, storage_url, metadata")
      .order("id", { ascending: true }),
  );
  if (!mediaIds) query = query.range(offset, offset + batchSize - 1);
  const { data: rows, error: rowsErr } = await query;
  if (rowsErr) return json({ ok: false, traceId, run_id: runId, message: rowsErr.message }, 500);

  const stats = {
    processed: 0,
    rehosted: 0,
    failed: 0,
    skipped_already_rehosted: 0,
    dry_run_would_rehost: 0,
  };

  for (const row of (rows ?? []) as Array<{
    id: string;
    product_id: string;
    cj_product_id: string | null;
    supplier_url: string | null;
    storage_url: string | null;
    metadata: Record<string, unknown> | null;
  }>) {
    stats.processed++;
    if (!row.supplier_url || !row.product_id) continue;
    const alreadyRehosted = row.metadata && (row.metadata as Record<string, unknown>).rehosted === true;
    if (alreadyRehosted && !force) {
      stats.skipped_already_rehosted++;
      continue;
    }
    if (dryRun) {
      stats.dry_run_would_rehost++;
      await admin.from("cj_sync_items").insert({
        run_id: runId, product_id: row.product_id, product_name: "",
        action: "video_would_rehost",
        after: { media_id: row.id, supplier_url: row.supplier_url },
      });
      continue;
    }
    const re = await rehostVideo(admin, row.product_id, row.supplier_url);
    if (!re.success) {
      stats.failed++;
      // Mark fallback metadata so the row is still tracked even though
      // storage_url remains the CJ CDN URL.
      const fbMeta: Record<string, unknown> = {
        ...(row.metadata ?? {}),
        rehosted: false,
        rehost_fallback: "cdn",
        rehost_error: re.error,
        rehost_reason: re.reason,
        rehost_attempts: re.attempts,
        rehost_http_status: re.httpStatus ?? null,
        rehost_last_attempt_at: new Date().toISOString(),
      };
      await admin.from("product_media").update({ metadata: fbMeta }).eq("id", row.id);
      await admin.from("cj_sync_items").insert({
        run_id: runId, product_id: row.product_id, product_name: "",
        action: "video_rehost_failed",
        error: re.error ?? "download_or_upload_failed",
        after: {
          media_id: row.id,
          supplier_url: row.supplier_url,
          storage_url: row.supplier_url, // CDN fallback in use
          fallback_used: true,
          reason: re.reason,
          http_status: re.httpStatus ?? null,
          attempts: re.attempts,
          file_size: re.bytes ?? null,
          content_type: re.contentType ?? null,
        },
      });
      continue;
    }
    const newMeta: Record<string, unknown> = {
      ...(row.metadata ?? {}),
      rehosted: true,
      storage_path: re.storagePath,
      bytes: re.bytes,
      content_type: re.contentType,
      signed_url_expires_at: new Date(Date.now() + REHOST_SIGNED_URL_TTL * 1000).toISOString(),
      rehosted_at: new Date().toISOString(),
      rehost_attempts: re.attempts,
      rehost_http_status: re.httpStatus ?? null,
      rehost_error: null,
      rehost_reason: null,
    };
    const { error: updErr } = await admin
      .from("product_media")
      .update({ storage_url: re.signedUrl!, metadata: newMeta })
      .eq("id", row.id);
    if (updErr) {
      stats.failed++;
      await admin.from("cj_sync_items").insert({
        run_id: runId, product_id: row.product_id, product_name: "",
        action: "video_rehost_update_failed",
        error: updErr.message,
        after: { media_id: row.id },
      });
      continue;
    }
    stats.rehosted++;
    await admin.from("cj_sync_items").insert({
      run_id: runId, product_id: row.product_id, product_name: "",
      action: "video_rehosted",
      after: {
        media_id: row.id,
        storage_path: re.storagePath,
        storage_url: re.signedUrl,
        supplier_url: row.supplier_url,
        fallback_used: false,
        file_size: re.bytes,
        content_type: re.contentType,
        http_status: re.httpStatus ?? null,
        attempts: re.attempts,
        reason: "ok",
      },
    });
  }

  const nextOffset = offset + (rows?.length ?? 0);
  const done = !!mediaIds || !rows || rows.length < batchSize || nextOffset >= total;

  if (done) {
    await admin.from("cj_sync_runs").update({
      status: "completed",
      finished_at: new Date().toISOString(),
      totals: { ...stats, total },
    }).eq("id", runId);
  }

  return json({
    ok: true,
    traceId,
    run_id: runId,
    processed: stats.processed,
    total,
    next_offset: done ? null : nextOffset,
    done,
    totals: stats,
  });
});
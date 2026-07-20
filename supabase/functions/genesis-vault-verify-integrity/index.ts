// Genesis Vault — SHA-256 integrity verification
//
// Re-hashes the stored payload of one or more genesis_documents rows and
// compares against the stored `sha256`. Updates `integrity_verified` +
// `last_verified` per row, and raises a monitoring_alert on mismatch.
//
// Request body:
//   { document_id?: string, limit?: number, only_unverified?: boolean }
//
// Response:
//   { checked, verified, mismatched, missing_hash, missing_payload,
//     errors, results: [...] }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

type DocRow = {
  id: string;
  title: string;
  sha256: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  category: string;
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyOne(doc: DocRow) {
  const base = {
    id: doc.id,
    title: doc.title,
    stored_sha256: doc.sha256,
  };

  if (!doc.storage_bucket || !doc.storage_path) {
    return { ...base, status: "missing_payload" as const };
  }
  if (!doc.sha256) {
    return { ...base, status: "missing_hash" as const };
  }

  const { data, error } = await admin
    .storage
    .from(doc.storage_bucket)
    .download(doc.storage_path);

  if (error || !data) {
    return { ...base, status: "download_failed" as const, error: error?.message ?? "no data" };
  }

  const bytes = new Uint8Array(await data.arrayBuffer());
  const computed = await sha256Hex(bytes);
  const ok = computed.toLowerCase() === doc.sha256.toLowerCase();

  await admin
    .from("genesis_documents")
    .update({
      integrity_verified: ok,
      last_verified: new Date().toISOString(),
    })
    .eq("id", doc.id);

  if (!ok) {
    await admin.from("monitoring_alerts").insert({
      alert_type: "genesis_vault_integrity_mismatch",
      severity: "critical",
      status: "active",
      title: `SHA-256 mismatch: ${doc.title}`,
      message: `Stored ${doc.sha256} vs computed ${computed} for ${doc.storage_bucket}/${doc.storage_path}`,
      metadata: {
        document_id: doc.id,
        category: doc.category,
        storage_bucket: doc.storage_bucket,
        storage_path: doc.storage_path,
        stored_sha256: doc.sha256,
        computed_sha256: computed,
      },
    });
  }

  return { ...base, status: ok ? ("verified" as const) : ("mismatch" as const), computed_sha256: computed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const documentId: string | undefined = body?.document_id;
    const limit = Math.max(1, Math.min(500, Number(body?.limit) || 100));
    const onlyUnverified = Boolean(body?.only_unverified);

    let query = admin
      .from("genesis_documents")
      .select("id, title, sha256, storage_bucket, storage_path, category")
      .eq("is_archived", false)
      .order("created_at", { ascending: false });

    if (documentId) {
      query = query.eq("id", documentId);
    } else {
      query = query.limit(limit);
      if (onlyUnverified) query = query.eq("integrity_verified", false);
    }

    const { data: docs, error } = await query;
    if (error) throw error;

    const results = [];
    const counts = {
      checked: 0,
      verified: 0,
      mismatched: 0,
      missing_hash: 0,
      missing_payload: 0,
      errors: 0,
    };

    for (const d of (docs ?? []) as DocRow[]) {
      counts.checked++;
      try {
        const r = await verifyOne(d);
        results.push(r);
        if (r.status === "verified") counts.verified++;
        else if (r.status === "mismatch") counts.mismatched++;
        else if (r.status === "missing_hash") counts.missing_hash++;
        else if (r.status === "missing_payload") counts.missing_payload++;
        else counts.errors++;
      } catch (e) {
        counts.errors++;
        results.push({ id: d.id, title: d.title, status: "error", error: (e as Error).message });
      }
    }

    return new Response(JSON.stringify({ ok: true, ...counts, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
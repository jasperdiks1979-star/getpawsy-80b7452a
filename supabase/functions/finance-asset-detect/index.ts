// GENESIS V14 — finance-asset-detect
// Given an evidence_document_id, use Gemini 2.5 Flash to decide whether the
// document represents a durable business asset (phone, laptop, camera, etc.)
// and return a suggested category + intake prompts. Never writes an asset;
// the UI confirms first via AssetIntakeDialog.

import { createClient } from "npm:@supabase/supabase-js@2";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireInternalOrAdmin(req);
  if (guard) return guard;

  try {
    const { evidence_document_id } = await req.json();
    if (!evidence_document_id || typeof evidence_document_id !== "string") {
      return json({ ok: false, error: "evidence_document_id required" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: doc, error } = await admin
      .from("evidence_documents")
      .select("id,supplier_id,ocr_text,extracted_metadata,filename,total_minor,currency,invoice_date")
      .eq("id", evidence_document_id)
      .maybeSingle();
    if (error || !doc) return json({ ok: false, error: "document_not_found" }, 404);

    // Heuristic fallback when Gemini is unavailable.
    const text = `${doc.filename ?? ""} ${doc.ocr_text ?? ""}`.toLowerCase();
    const heuristic = classifyHeuristic(text);

    let ai: null | { is_asset: boolean; category: string; suggested_name: string; confidence: number; rationale: string } = null;
    if (LOVABLE_API_KEY) {
      try {
        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: "Classify invoices as durable business assets. Reply JSON: {is_asset:bool, category:one of phone|laptop|desktop|tablet|monitor|server|network|printer|furniture|vehicle|camera|audio|storage|dev|other, suggested_name:string, confidence:0-1, rationale:string}. Consumables (paper, ink cartridges, cables) are NOT assets. Software subscriptions are NOT assets." },
              { role: "user", content: `Filename: ${doc.filename ?? "?"}\nAmount: ${doc.total_minor ?? "?"} ${doc.currency ?? ""}\nOCR:\n${(doc.ocr_text ?? "").slice(0, 4000)}` },
            ],
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const content = data?.choices?.[0]?.message?.content;
          if (content) ai = JSON.parse(content);
        }
      } catch (e) {
        console.warn("[finance-asset-detect] AI call failed", (e as Error)?.message);
      }
    }

    const suggestion = ai ?? {
      is_asset: heuristic.category !== null,
      category: heuristic.category ?? "other",
      suggested_name: heuristic.name ?? doc.filename ?? "New asset",
      confidence: heuristic.category ? 0.55 : 0.2,
      rationale: "heuristic",
    };

    return json({ ok: true, suggestion, document: doc });
  } catch (e) {
    console.error("[finance-asset-detect]", e);
    return json({ ok: false, error: (e as Error)?.message ?? "error" }, 500);
  }
});

function classifyHeuristic(t: string): { category: string | null; name: string | null } {
  const rules: Array<[RegExp, string, string]> = [
    [/iphone|pixel|galaxy s\d+/i, "phone", "Smartphone"],
    [/macbook|thinkpad|xps 13|xps 15|laptop/i, "laptop", "Laptop"],
    [/imac|mac mini|mac pro|desktop pc/i, "desktop", "Desktop"],
    [/ipad|galaxy tab|surface pro/i, "tablet", "Tablet"],
    [/monitor|display|studio display|lg ultrafine/i, "monitor", "Monitor"],
    [/synology|nas|qnap|drobo/i, "storage", "NAS / Storage"],
    [/canon|sony a7|nikon z|lens|camera/i, "camera", "Camera"],
    [/microphone|shure|rode|blue yeti|sennheiser/i, "audio", "Microphone"],
    [/router|switch|access point|ubiquiti|unifi/i, "network", "Network gear"],
    [/printer|laserjet|deskjet/i, "printer", "Printer"],
    [/chair|desk|bureau|table/i, "furniture", "Furniture"],
    [/vehicle|car|tesla|volkswagen/i, "vehicle", "Vehicle"],
  ];
  for (const [re, cat, name] of rules) if (re.test(t)) return { category: cat, name };
  return { category: null, name: null };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

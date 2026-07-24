// AILUROVA — Horizon-native rebuild of the UNPUBLISHED draft theme only.
//
// Safety contract:
//   - Reads/writes ONLY draft theme gid://shopify/OnlineStoreTheme/202425401676.
//   - Live theme gid://shopify/OnlineStoreTheme/201779872076 must remain untouched
//     (role MAIN, updatedAt unchanged before/after).
//   - Zero product / price / inventory / publication / market / policy / shipping /
//     payment / collection mutations — the only Shopify write is themeFilesUpsert
//     on the draft theme.
//
// Modes:
//   mode:"shape-audit"      — Phase 1 read-only forensic + Horizon shape library.
//   mode:"execute-*"        — Intentionally gated: refuses until the shape library
//                             is reviewed. Horizon block schemas cannot be guessed.
//
// This function extracts EXACT shapes from the currently-rendering draft theme
// and never fabricates Horizon setting keys.

import { shopifyAdminFetch, shopifyAdminRest } from "../_shared/shopify-token-provider.ts";
import { corsHeaders } from "../_shared/cors.ts";

const TARGET_THEME_GID = "gid://shopify/OnlineStoreTheme/202425401676";
const LIVE_THEME_GID   = "gid://shopify/OnlineStoreTheme/201779872076";
const PRODUCT_HANDLE   = "ailurova-xl-stainless-steel-enclosed-cat-litter-box-for-large-cats";
const PRODUCT_GID      = "gid://shopify/Product/15889810194764";
const CONFIRM_TOKEN    = "CONFIRM_AILUROVA_HORIZON_REBUILD";

// Approved Horizon shapes for the rebuild. These MUST be verified as present
// in the draft (either as an existing section instance we can shape-clone, or
// as a sections/<type>.liquid file whose {% schema %} we can parse) before any
// themeFilesUpsert is attempted. Guessing schemas is a contract violation.
const APPROVED_SECTION_TYPES = [
  "hero",
  "product-information",
  "group",
  "email-signup",
  "header",
  "footer",
] as const;

const APPROVED_BLOCK_TYPES = [
  "group", "text", "button", "product-title", "price", "variant-picker",
  "quantity", "add-to-cart", "buy-buttons", "accelerated-checkout",
  "product-details", "disclosures", "product-media-gallery",
  "header-announcements", "footer-utilities", "footer-copyright",
  "footer-policy-list", "social-links",
] as const;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripJsonc(src: string): string {
  let out = ""; let i = 0; const n = src.length; let inStr = false; let strCh = "";
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (inStr) {
      out += c;
      if (c === "\\" && i + 1 < n) { out += c2; i += 2; continue; }
      if (c === strCh) inStr = false;
      i++; continue;
    }
    if (c === '"' || c === "'") { inStr = true; strCh = c; out += c; i++; continue; }
    if (c === "/" && c2 === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && c2 === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    out += c; i++;
  }
  return out;
}

function decodeBody(body: any): string | null {
  if (!body) return null;
  if (typeof body.content === "string") return body.content;
  if (typeof body.contentBase64 === "string") {
    try { return new TextDecoder().decode(Uint8Array.from(atob(body.contentBase64), c => c.charCodeAt(0))); }
    catch { return null; }
  }
  return null;
}

async function themeMeta(themeGid: string) {
  const numeric = themeGid.split("/").pop();
  const r = await shopifyAdminRest<{ theme: any }>(`themes/${numeric}.json`);
  const t = r.data?.theme;
  return t ? { id: `gid://shopify/OnlineStoreTheme/${t.id}`, role: String(t.role ?? "").toUpperCase(), name: t.name, updatedAt: t.updated_at } : null;
}

async function readThemeFiles(themeGid: string, filenames: string[]) {
  const q = `query($id: ID!, $filenames: [String!]) {
    theme(id: $id) {
      id role name updatedAt
      files(filenames: $filenames, first: 50) {
        nodes { filename size body { ... on OnlineStoreThemeFileBodyText { content } ... on OnlineStoreThemeFileBodyBase64 { contentBase64 } } }
      }
    }
  }`;
  return await shopifyAdminFetch<any>(q, { id: themeGid, filenames });
}

function shapeOf(node: any): any {
  if (node == null) return null;
  if (Array.isArray(node)) return node.length ? [shapeOf(node[0])] : [];
  if (typeof node !== "object") return typeof node;
  const out: any = {};
  for (const [k, v] of Object.entries(node)) out[k] = shapeOf(v);
  return out;
}

function typesReferenced(obj: any): string[] {
  const out = new Set<string>();
  const walk = (n: any) => {
    if (!n || typeof n !== "object") return;
    if (typeof (n as any).type === "string") out.add((n as any).type);
    const anyN = n as any;
    if (anyN.blocks && typeof anyN.blocks === "object") for (const b of Object.values(anyN.blocks)) walk(b);
    if (anyN.sections && typeof anyN.sections === "object") for (const s of Object.values(anyN.sections)) walk(s);
  };
  walk(obj);
  return [...out];
}

async function shapeAudit() {
  const startedAt = new Date().toISOString();

  const [target, live] = await Promise.all([themeMeta(TARGET_THEME_GID), themeMeta(LIVE_THEME_GID)]);
  if (!target || target.role !== "UNPUBLISHED") {
    return { verdict: "LIVE_THEME_SAFETY_FAILURE", reason: "target not UNPUBLISHED", themes: { target, live } };
  }
  if (!live || live.role !== "MAIN") {
    return { verdict: "LIVE_THEME_SAFETY_FAILURE", reason: "live not MAIN", themes: { target, live } };
  }

  const rootFiles = [
    "templates/index.json",
    "templates/product.json",
    "sections/header-group.json",
    "sections/footer-group.json",
  ];
  const r1 = await readThemeFiles(TARGET_THEME_GID, rootFiles);
  const nodes = r1.data?.theme?.files?.nodes ?? [];
  const filesMap: Record<string, string> = {};
  for (const n of nodes) {
    const c = decodeBody(n.body);
    if (c != null) filesMap[n.filename] = c;
  }

  const parsed: Record<string, any> = {};
  const parseIssues: Record<string, string> = {};
  for (const [fn, raw] of Object.entries(filesMap)) {
    try { parsed[fn] = JSON.parse(stripJsonc(raw)); }
    catch (e: any) { parseIssues[fn] = String(e?.message ?? e); }
  }

  const allTypes = new Set<string>();
  for (const obj of Object.values(parsed)) typesReferenced(obj).forEach(t => allTypes.add(t));
  const currentTypes = [...allTypes].sort();

  const secFilenames = currentTypes.flatMap(t => [`sections/${t}.liquid`, `sections/${t}.json`]);
  const r2 = secFilenames.length ? await readThemeFiles(TARGET_THEME_GID, secFilenames) : { data: { theme: { files: { nodes: [] } } } } as any;
  const secNodes = r2.data?.theme?.files?.nodes ?? [];
  const sectionFilesFound: string[] = secNodes.map((n: any) => n.filename).sort();

  const shapeLibrary: Record<string, any> = {};
  const seenExample: Record<string, { source: string; sectionId: string; example: any }> = {};
  for (const [fn, obj] of Object.entries(parsed)) {
    const secs = (obj as any)?.sections;
    if (!secs || typeof secs !== "object") continue;
    for (const [sid, sec] of Object.entries<any>(secs)) {
      const t = sec?.type;
      if (typeof t !== "string") continue;
      if (!seenExample[t]) {
        seenExample[t] = { source: fn, sectionId: sid, example: sec };
        shapeLibrary[t] = shapeOf(sec);
      }
    }
  }

  const requirements: Record<string, { need: string[]; have: string | null }> = {
    hero:              { need: ["hero", "image-banner", "banner", "media-with-content"],       have: null },
    product_purchase:  { need: ["product-information", "featured-product", "buy-buttons"],     have: null },
    text_or_heading:   { need: ["rich-text", "text", "heading"],                                have: null },
    faq_or_accordion:  { need: ["collapsible-content", "faq", "accordion"],                     have: null },
    email_signup:      { need: ["email-signup", "newsletter"],                                  have: null },
    header:            { need: ["header"],                                                      have: null },
    footer:            { need: ["footer"],                                                      have: null },
  };
  const available = new Set(currentTypes);
  let missing = 0;
  for (const k of Object.keys(requirements)) {
    const hit = requirements[k].need.find(o => available.has(o)) ?? null;
    requirements[k].have = hit;
    if (!hit) missing++;
  }

  const shapeIncomplete = missing > 0 || Object.keys(shapeLibrary).length === 0;

  // Deep probe: pull sections/<type>.liquid for every approved section shape,
  // and extract its {% schema %} block so block/setting keys are verified —
  // not guessed.
  const probeFilenames = APPROVED_SECTION_TYPES.map(t => `sections/${t}.liquid`);
  const r3 = await readThemeFiles(TARGET_THEME_GID, probeFilenames);
  const probeNodes = r3.data?.theme?.files?.nodes ?? [];
  const approvedShapeProbe: Record<string, {
    present: boolean;
    schemaFound: boolean;
    blockTypes: string[];
    settingKeys: string[];
  }> = {};
  for (const t of APPROVED_SECTION_TYPES) {
    approvedShapeProbe[t] = { present: false, schemaFound: false, blockTypes: [], settingKeys: [] };
  }
  for (const n of probeNodes) {
    const fn = String(n.filename ?? "");
    const t = fn.replace(/^sections\//, "").replace(/\.liquid$/, "");
    if (!(t in approvedShapeProbe)) continue;
    const src = decodeBody(n.body);
    if (src == null) continue;
    approvedShapeProbe[t].present = true;
    const m = src.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/);
    if (m) {
      try {
        const schema = JSON.parse(stripJsonc(m[1]));
        approvedShapeProbe[t].schemaFound = true;
        const blocks = Array.isArray(schema?.blocks) ? schema.blocks : [];
        approvedShapeProbe[t].blockTypes = blocks
          .map((b: any) => (typeof b?.type === "string" ? b.type : null))
          .filter(Boolean);
        const settings = Array.isArray(schema?.settings) ? schema.settings : [];
        approvedShapeProbe[t].settingKeys = settings
          .map((s: any) => (typeof s?.id === "string" ? s.id : null))
          .filter(Boolean);
      } catch {/* leave schemaFound=false */}
    }
  }

  // Also probe approved block-level types that ship as their own liquid file
  // (Horizon exposes many blocks under `blocks/<type>.liquid`).
  const blockProbeNames = APPROVED_BLOCK_TYPES.map(t => `blocks/${t}.liquid`);
  const r4 = await readThemeFiles(TARGET_THEME_GID, blockProbeNames);
  const blockNodes = r4.data?.theme?.files?.nodes ?? [];
  const approvedBlockProbe: Record<string, { present: boolean; settingKeys: string[] }> = {};
  for (const t of APPROVED_BLOCK_TYPES) approvedBlockProbe[t] = { present: false, settingKeys: [] };
  for (const n of blockNodes) {
    const fn = String(n.filename ?? "");
    const t = fn.replace(/^blocks\//, "").replace(/\.liquid$/, "");
    if (!(t in approvedBlockProbe)) continue;
    const src = decodeBody(n.body);
    if (src == null) continue;
    approvedBlockProbe[t].present = true;
    const m = src.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/);
    if (m) {
      try {
        const schema = JSON.parse(stripJsonc(m[1]));
        const settings = Array.isArray(schema?.settings) ? schema.settings : [];
        approvedBlockProbe[t].settingKeys = settings
          .map((s: any) => (typeof s?.id === "string" ? s.id : null))
          .filter(Boolean);
      } catch {/* ignore */}
    }
  }

  const missingApprovedSections = Object.entries(approvedShapeProbe)
    .filter(([, v]) => !v.present || !v.schemaFound).map(([k]) => k);
  const missingApprovedBlocks = Object.entries(approvedBlockProbe)
    .filter(([, v]) => !v.present).map(([k]) => k);

  const fullyReady =
    !shapeIncomplete &&
    missingApprovedSections.length === 0 &&
    missingApprovedBlocks.length === 0;

  const verdict = fullyReady
    ? "HORIZON_SHAPE_LIBRARY_READY"
    : "HORIZON_SHAPE_LIBRARY_INCOMPLETE";

  return {
    verdict,
    mode: "shape-audit",
    startedAt,
    finishedAt: new Date().toISOString(),
    protectedProduct: { gid: PRODUCT_GID, handle: PRODUCT_HANDLE },
    themes: { target, live },
    summary: {
      rootFilesRead: Object.keys(filesMap),
      parseIssues,
      currentSectionTypes: currentTypes,
      sectionFilesFound,
      requirements,
      shapeTypes: Object.keys(shapeLibrary).sort(),
      approvedSectionProbe: approvedShapeProbe,
      approvedBlockProbe,
      missingApprovedSections,
      missingApprovedBlocks,
    },
    shapeLibrary,
    shapeExamples: seenExample,
    rawFiles: filesMap,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: any = {};
  try { body = req.method === "POST" ? await req.json() : {}; } catch {}
  const mode = (body?.mode ?? "shape-audit") as string;

  try {
    if (mode === "shape-audit") return json(await shapeAudit());
    if (mode.startsWith("execute-")) {
      if (body?.confirm !== CONFIRM_TOKEN) {
        return json({
          verdict: "HORIZON_TEMPLATE_MUTATION_FAILED",
          reason: "missing confirm token",
          expectedConfirm: CONFIRM_TOKEN,
        }, 400);
      }
      return json({
        verdict: "HORIZON_TEMPLATE_MUTATION_FAILED",
        reason:
          "execute-* modes are intentionally gated until the shape-audit shapeLibrary is reviewed. " +
          "Horizon block schemas cannot be guessed; Phase 1 must be signed off before any themeFilesUpsert.",
      }, 409);
    }
    return json({ verdict: "HORIZON_TEMPLATE_MUTATION_FAILED", reason: `unknown mode: ${mode}` }, 400);
  } catch (e: any) {
    return json({ verdict: "HORIZON_TEMPLATE_MUTATION_FAILED", error: String(e?.message ?? e) }, 500);
  }
});

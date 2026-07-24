// AILUROVA CORE THEME FILE PATCH — surgical themeFilesUpsert to the UNPUBLISHED draft only.
// Live theme is protected. Only 3 files, only 7 values. Read-back + preview verification.
import { getShopifyConfig, shopifyAdminFetch, shopifyAdminRest } from "../_shared/shopify-token-provider.ts";
import { corsHeaders } from "../_shared/cors.ts";

const TARGET_THEME_GID = "gid://shopify/OnlineStoreTheme/202425401676";
const LIVE_THEME_GID   = "gid://shopify/OnlineStoreTheme/201779872076";
const ALLOWED_FILES = [
  "templates/index.json",
  "sections/header-group.json",
  "sections/footer-group.json",
] as const;

type FileName = typeof ALLOWED_FILES[number];

const EXPECTED_BEFORE = {
  "sections/header-group.json": [
    { path: ["sections","header_announcements_9jGBFp","blocks","announcement_BxgCk9","settings","text"], value: "Welcome to our store", newValue: "Designed for a cleaner, easier litter routine." },
  ],
  "templates/index.json": [
    { path: ["sections","hero_jVaWmY","blocks","text_YLPk4p","settings","text"], value: "<p>Browse our latest products</p>", newValue: "<p>A Cleaner, Smarter Litter Setup</p>" },
    { path: ["sections","hero_jVaWmY","blocks","button_H9gpTf","settings","label"], value: "Shop all", newValue: "Explore the Litter Box" },
    { path: ["sections","hero_jVaWmY","blocks","button_H9gpTf","settings","link"], value: "shopify://collections/all", newValue: "/products/ailurova-xl-stainless-steel-enclosed-cat-litter-box-for-large-cats" },
    { path: ["sections","product_list_fa6P9H","settings","max_products"], value: 8, newValue: 1 },
  ],
  "sections/footer-group.json": [
    { path: ["sections","footer_m9NzUG","blocks","group_H6VpwJ","blocks","text_LWt8Pz","settings","text"], value: "<h2>Join our email list</h2>", newValue: "<h2>Join the Ailurova List</h2>" },
    { path: ["sections","footer_m9NzUG","blocks","group_H6VpwJ","blocks","text_f9CFLH","settings","text"], value: "<p>Get exclusive deals and early access to new products.</p>", newValue: "<p>Get product updates, care tips and occasional offers.</p>" },
  ],
} as const;

function getAt(obj: any, path: readonly string[]): any {
  let cur = obj;
  for (const k of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[k];
  }
  return cur;
}
function setAt(obj: any, path: readonly string[], value: any): boolean {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    if (cur == null || typeof cur !== "object" || !(path[i] in cur)) return false;
    cur = cur[path[i]];
  }
  const last = path[path.length - 1];
  if (cur == null || typeof cur !== "object" || !(last in cur)) return false;
  cur[last] = value;
  return true;
}

// Some Shopify theme JSONs use flat "sections" + top-level "order" keys.
// The provided path descriptors treat blocks nested under sections. Handle either JSON containing a top-level "sections" key OR the section as top-level key.
function resolvePath(json: any, path: readonly string[]): readonly string[] | null {
  // Try as-given
  if (getAt(json, path) !== undefined) return path;
  // Try stripping leading "sections"
  if (path[0] === "sections") {
    const p2 = path.slice(1);
    if (getAt(json, p2) !== undefined) return p2;
  }
  // Try prefixing "sections"
  const p3 = ["sections", ...path];
  if (getAt(json, p3) !== undefined) return p3;
  return null;
}

async function readThemeFiles(themeGid: string, filenames: readonly string[]) {
  const q = `query($id: ID!, $filenames: [String!]) {
    theme(id: $id) {
      id role name updatedAt
      files(filenames: $filenames, first: 10) {
        nodes { filename size body { ... on OnlineStoreThemeFileBodyText { content } ... on OnlineStoreThemeFileBodyBase64 { contentBase64 } } }
      }
    }
  }`;
  const r = await shopifyAdminFetch<any>(q, { id: themeGid, filenames });
  return r;
}

async function themeMeta(themeGid: string) {
  const q = `query($id: ID!) { theme(id: $id) { id role name updatedAt previewable } }`;
  return await shopifyAdminFetch<any>(q, { id: themeGid });
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const ledger = {
    themeFilesUpsert_calls: 0,
    files_written: 0,
    live_theme_writes: 0,
    product_mutations: 0,
    collection_mutations: 0,
    locale_mutations: 0,
    other_mutations: 0,
  };
  const report: any = { verdict: "", phases: {}, mutation_ledger: ledger };

  try {
    const { domain, apiVersion } = getShopifyConfig();
    report.target_theme_gid = TARGET_THEME_GID;
    report.live_theme_gid = LIVE_THEME_GID;
    report.api_version = apiVersion;
    report.store_domain = domain;

    // GraphQL "themes" is not exposed; enumerate via REST and normalize to GID form.
    const themesRest = await shopifyAdminRest<{ themes: any[] }>("themes.json");
    const allThemes = (themesRest.data?.themes ?? []).map((t: any) => ({
      id: `gid://shopify/OnlineStoreTheme/${t.id}`,
      role: String(t.role ?? "").toUpperCase(),
      name: t.name,
      updatedAt: t.updated_at,
      previewable: t.previewable,
      processing: t.processing,
    }));
    report.all_themes = allThemes;

    // -------- PHASE 1: capability check --------
    const scopesQ = `query { currentAppInstallation { accessScopes { handle } } }`;
    const scopesR = await shopifyAdminFetch<any>(scopesQ);
    const scopes = (scopesR.data?.currentAppInstallation?.accessScopes ?? []).map((s: any) => s.handle);
    const themeScopes = scopes.filter((s: string) => s.includes("themes"));
    const hasRead = scopes.includes("read_themes");
    const hasWrite = scopes.includes("write_themes");

    const tgtMeta = await themeMeta(TARGET_THEME_GID);
    const liveMeta = await themeMeta(LIVE_THEME_GID);
    const tgt = tgtMeta.data?.theme ?? allThemes.find((t: any) => t.id === TARGET_THEME_GID);
    const live = liveMeta.data?.theme ?? allThemes.find((t: any) => t.id === LIVE_THEME_GID) ?? allThemes.find((t: any) => t.role === "MAIN");

    report.phases.phase1 = {
      granted_theme_scopes: themeScopes,
      has_read_themes: hasRead,
      has_write_themes: hasWrite,
      target_theme: tgt,
      live_theme: live,
      themeFilesUpsert_available_in_api: apiVersion >= "2024-04",
    };

    if (!tgt) { report.verdict = "THEME_FILE_STRUCTURE_MISMATCH"; report.error = "target theme not found"; return json(report); }
    if (tgt.role !== "UNPUBLISHED") { report.verdict = "LIVE_THEME_SAFETY_FAILURE"; report.error = `target theme role=${tgt.role}`; return json(report); }
    if (!live || live.role !== "MAIN") { report.verdict = "LIVE_THEME_SAFETY_FAILURE"; report.error = `live theme role=${live?.role}`; return json(report); }
    if (tgt.id === live.id) { report.verdict = "LIVE_THEME_SAFETY_FAILURE"; report.error = "target === live"; return json(report); }
    if (!hasWrite) { report.verdict = "THEME_FILE_WRITE_ACCESS_DENIED"; return json(report); }

    const liveUpdatedBefore = live.updatedAt;
    const tgtUpdatedBefore = tgt.updatedAt;

    // -------- PHASE 2: read current files --------
    const readR = await readThemeFiles(TARGET_THEME_GID, ALLOWED_FILES as unknown as string[]);
    if (readR.errors) { report.verdict = "THEME_FILE_STRUCTURE_MISMATCH"; report.phase2_errors = readR.errors; return json(report); }
    const nodes: any[] = readR.data?.theme?.files?.nodes ?? [];
    const byName: Record<string, { raw: string; json: any }> = {};
    for (const fn of ALLOWED_FILES) {
      const node = nodes.find(n => n.filename === fn);
      if (!node) { report.verdict = "THEME_FILE_STRUCTURE_MISMATCH"; report.error = `missing file ${fn}`; return json(report); }
      const raw = decodeBody(node.body);
      if (raw == null) { report.verdict = "THEME_FILE_STRUCTURE_MISMATCH"; report.error = `undecodable ${fn}`; return json(report); }
      let parsed: any;
      try { parsed = JSON.parse(raw); } catch (e) { report.verdict = "THEME_FILE_STRUCTURE_MISMATCH"; report.error = `parse ${fn}: ${e}`; return json(report); }
      byName[fn] = { raw, json: parsed };
    }

    // Verify expected before values
    const beforeAfter: any[] = [];
    for (const [fn, patches] of Object.entries(EXPECTED_BEFORE)) {
      for (const p of patches) {
        const resolved = resolvePath(byName[fn].json, p.path);
        if (!resolved) { report.verdict = "THEME_FILE_STRUCTURE_MISMATCH"; report.error = `path not found in ${fn}: ${p.path.join(".")}`; return json(report); }
        const actual = getAt(byName[fn].json, resolved);
        if (actual !== p.value) {
          report.verdict = "THEME_FILE_STRUCTURE_MISMATCH";
          report.error = `${fn} @ ${resolved.join(".")}: expected ${JSON.stringify(p.value)} got ${JSON.stringify(actual)}`;
          return json(report);
        }
        beforeAfter.push({ file: fn, path: resolved.join("."), before: p.value, after: p.newValue });
      }
    }
    report.phases.phase2 = { files_read: ALLOWED_FILES, before_after_planned: beforeAfter };

    // -------- PHASE 3: patch in-memory --------
    const patchedRaw: Record<FileName, string> = {} as any;
    for (const [fn, patches] of Object.entries(EXPECTED_BEFORE)) {
      const obj = byName[fn].json;
      for (const p of patches) {
        const resolved = resolvePath(obj, p.path)!;
        const ok = setAt(obj, resolved, p.newValue);
        if (!ok) { report.verdict = "UNEXPECTED_THEME_DIFF"; report.error = `setAt failed ${fn} ${resolved.join(".")}`; return json(report); }
      }
      patchedRaw[fn as FileName] = JSON.stringify(obj, null, 2);
    }

    // -------- PHASE 4: diff validation --------
    const diffs: any[] = [];
    for (const fn of ALLOWED_FILES) {
      const before = JSON.parse(byName[fn].raw);
      const after = JSON.parse(patchedRaw[fn]);
      const fileDiffs = deepDiff(before, after, []);
      diffs.push(...fileDiffs.map(d => ({ file: fn, ...d })));
    }
    const valueChanges = diffs.filter(d => d.kind === "change");
    const structural = diffs.filter(d => d.kind !== "change");
    if (structural.length !== 0 || valueChanges.length !== 7) {
      report.verdict = "UNEXPECTED_THEME_DIFF";
      report.phases.phase4 = { total_diffs: diffs.length, value_changes: valueChanges.length, structural: structural, all: diffs };
      return json(report);
    }
    report.phases.phase4 = { total_value_changes: valueChanges.length, structural_changes: 0, diffs: valueChanges };

    // -------- PHASE 5: themeFilesUpsert --------
    const mutation = `mutation($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message code filename }
      }
    }`;
    const filesInput = ALLOWED_FILES.map(fn => ({
      filename: fn,
      body: { type: "TEXT", value: patchedRaw[fn] },
    }));
    const upR = await shopifyAdminFetch<any>(mutation, { themeId: TARGET_THEME_GID, files: filesInput });
    ledger.themeFilesUpsert_calls = 1;
    const upErrs = upR.data?.themeFilesUpsert?.userErrors ?? [];
    if (upR.errors || upErrs.length > 0) {
      report.verdict = "THEME_FILE_MUTATION_FAILED";
      report.phases.phase5 = { gql_errors: upR.errors ?? null, user_errors: upErrs, response: upR.data };
      return json(report);
    }
    const upserted = upR.data?.themeFilesUpsert?.upsertedThemeFiles ?? [];
    ledger.files_written = upserted.length;
    if (upserted.length !== 3) {
      report.verdict = "THEME_FILE_MUTATION_FAILED";
      report.phases.phase5 = { note: "expected 3 upserted", upserted };
      return json(report);
    }
    report.phases.phase5 = { upserted_files: upserted.map((x: any) => x.filename) };

    // -------- PHASE 6: independent read-back --------
    const rb = await readThemeFiles(TARGET_THEME_GID, ALLOWED_FILES as unknown as string[]);
    const rbNodes: any[] = rb.data?.theme?.files?.nodes ?? [];
    const readBack: any[] = [];
    let persistOk = true;
    for (const [fn, patches] of Object.entries(EXPECTED_BEFORE)) {
      const node = rbNodes.find(n => n.filename === fn);
      const raw = node ? decodeBody(node.body) : null;
      let parsed: any = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { /**/ }
      for (const p of patches) {
        const resolved = parsed ? resolvePath(parsed, p.path) : null;
        const actual = resolved ? getAt(parsed, resolved) : undefined;
        const ok = actual === p.newValue;
        if (!ok) persistOk = false;
        readBack.push({ file: fn, path: p.path.join("."), expected_new: p.newValue, actual, absent_old: actual !== p.value });
      }
    }
    const tgtMeta2 = await themeMeta(TARGET_THEME_GID);
    const liveMeta2 = await themeMeta(LIVE_THEME_GID);
    const tgtUpdatedAfter = tgtMeta2.data?.theme?.updatedAt;
    const liveUpdatedAfter = liveMeta2.data?.theme?.updatedAt;
    const liveSafe = liveUpdatedAfter === liveUpdatedBefore;
    const targetAdvanced = tgtUpdatedAfter !== tgtUpdatedBefore;
    const targetStillUnpublished = tgtMeta2.data?.theme?.role === "UNPUBLISHED";

    report.phases.phase6 = {
      read_back: readBack,
      persist_ok: persistOk,
      target_updated_before: tgtUpdatedBefore,
      target_updated_after: tgtUpdatedAfter,
      target_advanced: targetAdvanced,
      target_still_unpublished: targetStillUnpublished,
      live_updated_before: liveUpdatedBefore,
      live_updated_after: liveUpdatedAfter,
      live_untouched: liveSafe,
    };

    if (!liveSafe) { report.verdict = "LIVE_THEME_SAFETY_FAILURE"; return json(report); }
    if (!persistOk || !targetAdvanced) { report.verdict = "THEME_FILE_WRITE_NOT_PERSISTED"; return json(report); }

    // -------- PHASE 7: preview verification --------
    const themeNumeric = TARGET_THEME_GID.split("/").pop();
    const previewUrl = `https://${domain}/?preview_theme_id=${themeNumeric}`;
    let previewResult: any = { attempted_url: previewUrl };
    let previewVerified = false;
    try {
      const pr = await fetch(previewUrl, { redirect: "follow" });
      const html = await pr.text();
      const mustHave = [
        "Designed for a cleaner, easier litter routine.",
        "A Cleaner, Smarter Litter Setup",
        "Explore the Litter Box",
        "Join the Ailurova List",
        "Get product updates, care tips and occasional offers.",
      ];
      const mustAbsent = [
        "Welcome to our store",
        "Browse our latest products",
        "Shop all",
        "Join our email list",
        "Get exclusive deals and early access to new products.",
      ];
      const presence = Object.fromEntries(mustHave.map(s => [s, html.includes(s)]));
      const absence = Object.fromEntries(mustAbsent.map(s => [s, !html.includes(s)]));
      const productCardCount = (html.match(/product-card|card--product|productCard/gi) ?? []).length;
      previewResult = { attempted_url: previewUrl, http_status: pr.status, presence, absence, product_card_matches: productCardCount };
      previewVerified = Object.values(presence).every(Boolean) && Object.values(absence).every(Boolean);
    } catch (e) {
      previewResult.fetch_error = String(e?.message ?? e);
    }
    report.phases.phase7 = previewResult;

    report.verdict = previewVerified
      ? "AILUROVA_CORE_THEME_FILES_PERSISTED_AND_VERIFIED"
      : "CORE_FILES_PERSISTED_PREVIEW_UNVERIFIED";

    return json(report);
  } catch (e) {
    report.verdict = report.verdict || "THEME_FILE_MUTATION_FAILED";
    report.error = String(e?.message ?? e);
    return json(report);
  }
});

function json(payload: any, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function deepDiff(a: any, b: any, path: string[]): { path: string; kind: "change" | "add" | "remove"; before?: any; after?: any }[] {
  const out: any[] = [];
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) { out.push({ path: path.join("."), kind: "change", before: a, after: b }); return out; }
    for (let i = 0; i < a.length; i++) out.push(...deepDiff(a[i], b[i], [...path, String(i)]));
    return out;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (!(k in a)) out.push({ path: [...path, k].join("."), kind: "add", after: b[k] });
      else if (!(k in b)) out.push({ path: [...path, k].join("."), kind: "remove", before: a[k] });
      else out.push(...deepDiff(a[k], b[k], [...path, k]));
    }
    return out;
  }
  if (a !== b) out.push({ path: path.join("."), kind: "change", before: a, after: b });
  return out;
}
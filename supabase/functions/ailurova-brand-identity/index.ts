// AILUROVA — BRAND IDENTITY FINALIZATION (v1)
//
// Deploys the newly designed Ailurova brand identity to the live Shopify theme:
//  1. Uploads the geometric wordmark + monogram SVGs to the theme's assets/.
//  2. Uploads the full favicon package (16/32/48/180/192/512 PNG + ICO + Apple).
//  3. Patches config/settings_data.json to point the header logo AND the
//     browser-tab favicon at the new assets. A timestamped .bak of
//     settings_data.json is written to the same theme first (rollback path).
//
// Scope guard: no product / price / inventory / market / policy / publication
// mutations. Only theme asset upserts + one settings_data.json rewrite on the
// current MAIN online-store theme.

import { shopifyAdminFetch, shopifyAdminRest } from "../_shared/shopify-token-provider.ts";
import { corsHeaders } from "../_shared/cors.ts";
import ASSETS from "./assets.json" with { type: "json" };

const CONFIRM = "CONFIRM_AILUROVA_BRAND_IDENTITY";

type AssetBody = { type: "TEXT"; value: string } | { type: "BASE64"; value: string };
type AssetMap = Record<string, AssetBody>;
const ASSET_MAP = ASSETS as AssetMap;

// Filename → theme path mapping (all live under assets/ in Horizon).
const ASSET_PATHS: Record<string, string> = {
  "logo-mark.svg":              "assets/ailurova-logo-mark.svg",
  "logo-mark-light.svg":        "assets/ailurova-logo-mark-light.svg",
  "logo-horizontal-dark.svg":   "assets/ailurova-logo.svg",
  "logo-horizontal-light.svg":  "assets/ailurova-logo-light.svg",
  "favicon.ico":                "assets/ailurova-favicon.ico",
  "apple-touch-icon.png":       "assets/ailurova-apple-touch-icon.png",
  "favicon-16.png":             "assets/ailurova-favicon-16.png",
  "favicon-32.png":             "assets/ailurova-favicon-32.png",
  "favicon-48.png":             "assets/ailurova-favicon-48.png",
  "favicon-180.png":            "assets/ailurova-favicon-180.png",
  "favicon-192.png":            "assets/ailurova-favicon-192.png",
  "favicon-512.png":            "assets/ailurova-favicon-512.png",
  "og-image.png":               "assets/ailurova-og-image.png",
};

// The Shopify header setting expects a filename (bare, no assets/ prefix) that
// resolves via `{{ 'foo.svg' | asset_url }}` on the storefront.
const HEADER_LOGO_FILENAME = "ailurova-logo.svg";
const FAVICON_FILENAME     = "ailurova-favicon-512.png";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function listThemes() {
  const r = await shopifyAdminRest<{ themes: any[] }>("themes.json?fields=id,name,role,updated_at");
  return (r.data?.themes ?? []) as Array<{ id: number; name: string; role: string; updated_at: string }>;
}

async function readFile(themeGid: string, filename: string) {
  const q = `query($id: ID!, $filenames: [String!]) {
    theme(id: $id) {
      files(filenames: $filenames, first: 5) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`;
  const r = await shopifyAdminFetch<any>(q, { id: themeGid, filenames: [filename] });
  const node = r.data?.theme?.files?.nodes?.[0];
  return node?.body?.content ?? null;
}

async function upsertFiles(themeGid: string, files: Array<{ filename: string; body: AssetBody }>) {
  // themeFilesUpsert accepts TEXT (value) or BASE64 (value) bodies. We batch
  // in chunks of 5 to stay well under any request size limits.
  const results: any[] = [];
  for (let i = 0; i < files.length; i += 5) {
    const chunk = files.slice(i, i + 5).map(f => ({
      filename: f.filename,
      body: f.body.type === "TEXT"
        ? { type: "TEXT", value: f.body.value }
        : { type: "BASE64", value: f.body.value },
    }));
    const m = `mutation($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename size }
        userErrors { field message code filename }
      }
    }`;
    const r = await shopifyAdminFetch<any>(m, { themeId: themeGid, files: chunk });
    results.push(r.data?.themeFilesUpsert ?? { userErrors: [{ message: "no response" }] });
  }
  return results;
}

function patchSettingsData(raw: string): { patched: string; changes: Record<string, unknown> } {
  const doc = JSON.parse(raw);
  const changes: Record<string, unknown> = {};

  // Horizon / Dawn / Refresh all store theme-level settings under current.
  // "current" can be a string (preset name) OR an object.
  const current = typeof doc.current === "object" && doc.current ? doc.current : null;
  if (current) {
    const before = { favicon: current.favicon, logo: current.logo };
    current.favicon = FAVICON_FILENAME;
    // Some themes read `logo` as a top-level setting for header fallback.
    if ("logo" in current) current.logo = HEADER_LOGO_FILENAME;
    changes.current = { before, after: { favicon: current.favicon, logo: current.logo } };

    // Walk sections.*.settings and set logo / favicon if the key exists.
    const sections = current.sections;
    if (sections && typeof sections === "object") {
      for (const [sid, sec] of Object.entries<any>(sections)) {
        if (!sec || typeof sec !== "object" || !sec.settings) continue;
        const s = sec.settings;
        const patched: Record<string, unknown> = {};
        for (const key of ["logo", "header_logo", "logo_image", "brand_logo", "site_logo"]) {
          if (key in s) {
            patched[key] = { before: s[key], after: HEADER_LOGO_FILENAME };
            s[key] = HEADER_LOGO_FILENAME;
          }
        }
        for (const key of ["favicon", "site_favicon"]) {
          if (key in s) {
            patched[key] = { before: s[key], after: FAVICON_FILENAME };
            s[key] = FAVICON_FILENAME;
          }
        }
        if (Object.keys(patched).length) {
          (changes.sections ??= {} as any)[sid] = { type: sec.type, patched };
        }
      }
    }
  } else {
    changes.warning = "settings_data.current is not an object; skipped section walk";
  }

  return { patched: JSON.stringify(doc, null, 2), changes };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const confirm = body.confirm ?? new URL(req.url).searchParams.get("confirm");
    const dry = Boolean(body.dry_run ?? new URL(req.url).searchParams.get("dry_run"));

    if (confirm !== CONFIRM) {
      return json({
        verdict: "AWAITING_CONFIRMATION",
        required_confirm_token: CONFIRM,
        asset_plan: ASSET_PATHS,
        header_logo_filename: HEADER_LOGO_FILENAME,
        favicon_filename: FAVICON_FILENAME,
      }, 400);
    }

    const themes = await listThemes();
    const main = themes.find(t => t.role === "main");
    if (!main) return json({ verdict: "NO_MAIN_THEME" }, 500);
    const themeGid = `gid://shopify/OnlineStoreTheme/${main.id}`;

    // 1) Read current settings_data.json (source of truth for logo + favicon)
    const settingsPath = "config/settings_data.json";
    const settingsRaw = await readFile(themeGid, settingsPath);
    if (!settingsRaw) return json({ verdict: "SETTINGS_DATA_NOT_FOUND", theme: main }, 500);

    // 2) Build the file batch: brand assets + settings_data patch + backup
    const brandFiles = Object.entries(ASSET_PATHS).map(([srcName, themePath]) => ({
      filename: themePath,
      body: ASSET_MAP[srcName]!,
    }));

    const { patched: settingsPatched, changes: settingsChanges } = patchSettingsData(settingsRaw);

    const backupPath = `assets/ailurova-settings-backup-${Date.now()}.txt`;
    const backupFile = {
      filename: backupPath,
      body: { type: "TEXT" as const, value: settingsRaw },
    };

    if (dry) {
      return json({
        verdict: "DRY_RUN",
        theme: main,
        will_upload: brandFiles.map(f => ({ filename: f.filename, kind: f.body.type })),
        settings_backup_path: backupPath,
        settings_changes: settingsChanges,
      });
    }

    // 3) Upload brand assets + backup first, THEN patched settings_data last so
    //    the file references resolve at read time.
    const brandResults = await upsertFiles(themeGid, [...brandFiles, backupFile]);

    const settingsResult = await upsertFiles(themeGid, [{
      filename: settingsPath,
      body: { type: "TEXT", value: settingsPatched },
    }]);

    const allErrors = [
      ...brandResults.flatMap((r: any) => r.userErrors ?? []),
      ...settingsResult.flatMap((r: any) => r.userErrors ?? []),
    ];

    return json({
      verdict: allErrors.length ? "AILUROVA_BRAND_IDENTITY_PARTIAL" : "AILUROVA_BRAND_IDENTITY_LIVE",
      theme: { id: main.id, name: main.name, role: main.role },
      uploaded_assets: brandFiles.map(f => f.filename),
      settings_backup: backupPath,
      settings_changes: settingsChanges,
      user_errors: allErrors,
      mutation_ledger: [
        ...brandFiles.map(f => ({ op: "themeFilesUpsert", filename: f.filename })),
        { op: "themeFilesUpsert", filename: backupPath },
        { op: "themeFilesUpsert", filename: settingsPath },
      ],
    });
  } catch (e) {
    return json({ verdict: "AILUROVA_BRAND_IDENTITY_ERROR", error: String((e as any)?.message || e) }, 500);
  }
});
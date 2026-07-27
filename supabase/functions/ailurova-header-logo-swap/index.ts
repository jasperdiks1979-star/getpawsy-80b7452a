// AILUROVA — HEADER LOGO SWAP (v1)
//
// Replaces the text-only "AILUROVA" wordmark in the storefront header with
// the uploaded ailurova-logo.svg (dark variant, for the ivory header
// background). Falls back to ailurova-logo-light.svg if the header uses a
// dark background theme setting.
//
// Strategy
// --------
// The user reports the header lives in sections/ailurova-one-product-store.liquid,
// but Horizon typically renders the header from sections/header.liquid. We
// probe BOTH files, detect where a literal "AILUROVA" text wordmark is
// rendered as a link to "/", and inject a marker-guarded <img> replacement
// there. Idempotent via AILUROVA_HEADER_LOGO_START/END markers so a re-run
// simply refreshes the block in place.
//
// Scope guard: only header markup is touched. No product / price / market /
// policy / inventory / publication / hero / PDP / checkout mutation.
//
// Endpoints
//   POST { probe: true }                    → read both files, report findings, no writes.
//   POST { confirm: "CONFIRM_HEADER_LOGO" } → back up + patch whichever file contains the wordmark.

import { shopifyAdminFetch, shopifyAdminRest } from "../_shared/shopify-token-provider.ts";
import { corsHeaders } from "../_shared/cors.ts";

const CONFIRM = "CONFIRM_HEADER_LOGO";

const LOGO_FILENAME       = "ailurova-logo.svg";        // dark ink on transparent — use on light bg
const LOGO_LIGHT_FILENAME = "ailurova-logo-light.svg";  // light ink — use on dark bg

const MARK_OPEN  = "<!-- AILUROVA_HEADER_LOGO_START -->";
const MARK_CLOSE = "<!-- AILUROVA_HEADER_LOGO_END -->";

// Horizon renders the header logo via a private `_header-logo` block, so the
// wordmark text is not in any theme file. Instead we inject a CSS override
// into layout/theme.liquid's <head>: it hides the native text wordmark and
// paints our SVG via `background-image`, preserving Horizon's layout,
// spacing, transparency states, and screen-reader accessibility (the text
// stays in the DOM, only visually hidden).
const TARGET_FILE = "layout/theme.liquid";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function listThemes() {
  const r = await shopifyAdminRest<{ themes: any[] }>("themes.json?fields=id,name,role,updated_at");
  return (r.data?.themes ?? []) as Array<{ id: number; name: string; role: string }>;
}

async function readFile(themeGid: string, filename: string): Promise<string | null> {
  const q = `query($id: ID!, $filenames: [String!]) {
    theme(id: $id) {
      files(filenames: $filenames, first: 5) {
        nodes { filename body {
          ... on OnlineStoreThemeFileBodyText   { content }
          ... on OnlineStoreThemeFileBodyBase64 { contentBase64 }
        } }
      }
    }
  }`;
  const r = await shopifyAdminFetch<any>(q, { id: themeGid, filenames: [filename] });
  const node = r.data?.theme?.files?.nodes?.[0];
  if (!node) return null;
  if (typeof node.body?.content === "string") return node.body.content;
  if (typeof node.body?.contentBase64 === "string") {
    try { return new TextDecoder().decode(Uint8Array.from(atob(node.body.contentBase64), c => c.charCodeAt(0))); }
    catch { return null; }
  }
  return null;
}

async function upsertFile(themeGid: string, filename: string, content: string) {
  const m = `mutation($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename size }
      userErrors { field message code filename }
    }
  }`;
  return await shopifyAdminFetch<any>(m, {
    themeId: themeGid,
    files: [{ filename, body: { type: "TEXT", value: content } }],
  });
}

// The replacement markup. Uses `{{ 'ailurova-logo.svg' | asset_url }}`
// (Shopify serves SVGs from theme assets with the correct Content-Type +
// aggressive CDN caching). Reserved intrinsic box prevents CLS. Scales
// via CSS from desktop 168px → mobile 132px width. `alt="Ailurova"` for
// accessibility, `aria-label` on the link, `<a href="/">` for homepage.
function buildLogoBlock(): string {
  // Horizon's `_header-logo` block renders either an <a class="header-logo">
  // wrapping an <img class="header__heading-logo"> (when settings.logo is
  // set) or an <a class="header-logo"> wrapping a <span class="header__heading-logo header__heading-logo--text">
  // (when it isn't). We target the anchor itself: reserve dimensions,
  // paint our SVG as background, and visually hide any child text/img so
  // both fallbacks render the same brand mark. Screen readers still read
  // the "Ailurova" text node.
  return [
    MARK_OPEN,
    `<style id="ail-header-logo-style">`,
    `  .header-logo a,`,
    `  a.header-logo,`,
    `  .header__heading-link{`,
    `    display:inline-flex;align-items:center;justify-content:center;`,
    `    width:168px;height:32px;`,
    `    background-image:url({{ 'ailurova-logo.svg' | asset_url }});`,
    `    background-repeat:no-repeat;background-position:center center;`,
    `    background-size:contain;`,
    `    text-decoration:none;line-height:0;`,
    `  }`,
    `  /* Hide the native text/image node without removing it from the a11y tree. */`,
    `  .header-logo a > *,`,
    `  a.header-logo > *,`,
    `  .header__heading-link > *{`,
    `    position:absolute!important;width:1px!important;height:1px!important;`,
    `    padding:0!important;margin:-1px!important;overflow:hidden!important;`,
    `    clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important;`,
    `  }`,
    `  /* Dark-mode / transparent-header inverse: swap to the light logo. */`,
    `  header-component[transparent]:not([data-sticky-state='active']) .header-logo a,`,
    `  header-component[transparent]:not([data-sticky-state='active']) a.header-logo,`,
    `  header-component[transparent]:not([data-sticky-state='active']) .header__heading-link{`,
    `    background-image:url({{ 'ailurova-logo-light.svg' | asset_url }});`,
    `  }`,
    `  @media (max-width: 749px){`,
    `    .header-logo a,`,
    `    a.header-logo,`,
    `    .header__heading-link{width:132px;height:28px}`,
    `  }`,
    `</style>`,
    MARK_CLOSE,
  ].join("\n");
}

// Detect a text-based "AILUROVA" wordmark rendered as an <a href="/"> link
// (Horizon `sections/header.liquid` uses this pattern when no logo image is
// set). Also matches the compact `<a class="header__heading-link" ...>` and
// generic wordmark spans.
//
// Returns { pattern, snippet } describing what was found, or null.
function patchLayoutHead(raw: string): { patched: string; kind: string } {
  const block = buildLogoBlock();
  const re = new RegExp(`${MARK_OPEN}[\\s\\S]*?${MARK_CLOSE}`, "m");
  if (re.test(raw)) return { patched: raw.replace(re, block), kind: "replaced_in_place" };
  if (/<\/head>/i.test(raw)) return { patched: raw.replace(/<\/head>/i, `${block}\n</head>`), kind: "injected_before_head_close" };
  return { patched: `${block}\n${raw}`, kind: "prepended_no_head_close" };
}

function ymdhms(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const probe = Boolean(body.probe);
    const confirm = body.confirm;
    const dumpFile: string | undefined = body.dump;
    const dumpPattern: string | undefined = body.grep;

    const themes = await listThemes();
    const main = themes.find(t => t.role === "main");
    if (!main) return json({ ok: false, error: "No MAIN theme found" }, 404);
    const themeGid = `gid://shopify/OnlineStoreTheme/${main.id}`;

    // Dump mode: return excerpts around a regex from a specific file.
    if (dumpFile) {
      const raw = await readFile(themeGid, dumpFile);
      if (raw == null) return json({ ok: false, error: "file_not_found", file: dumpFile });
      const re = new RegExp(dumpPattern ?? "logo|shop_name|heading|wordmark|brand|AILUROVA", "gi");
      const hits: Array<{ index: number; excerpt: string }> = [];
      for (const m of raw.matchAll(re)) {
        const i = m.index ?? 0;
        hits.push({ index: i, excerpt: raw.slice(Math.max(0, i - 200), i + 400) });
        if (hits.length >= 15) break;
      }
      return json({ ok: true, file: dumpFile, length: raw.length, hitCount: hits.length, hits });
    }

    // Probe target file.
    const raw = await readFile(themeGid, TARGET_FILE);
    if (raw == null) return json({ ok: false, error: "target_file_not_found", file: TARGET_FILE });
    const hasMarker = raw.includes(MARK_OPEN);
    const hasHeadClose = /<\/head>/i.test(raw);

    if (probe || confirm !== CONFIRM) {
      return json({
        ok: true,
        mode: probe ? "probe" : "no_confirm",
        theme: { id: main.id, name: main.name, role: main.role },
        target: TARGET_FILE,
        length: raw.length,
        hasMarker,
        hasHeadClose,
        needConfirm: !probe ? `POST { "confirm": "${CONFIRM}" } to apply` : undefined,
      });
    }

    // Backup first.
    const backupName = TARGET_FILE.replace(/\.liquid$/, `.backup-${ymdhms()}.liquid`);
    const backupRes = await upsertFile(themeGid, backupName, raw);
    const backupErrors = backupRes.data?.themeFilesUpsert?.userErrors ?? [];
    if (backupErrors.length) {
      return json({ ok: false, error: "backup_failed", backupName, backupErrors });
    }

    // Patch.
    const result = patchLayoutHead(raw);
    const upRes = await upsertFile(themeGid, TARGET_FILE, result.patched);
    const userErrors = upRes.data?.themeFilesUpsert?.userErrors ?? [];

    return json({
      ok: userErrors.length === 0,
      mutation_performed: userErrors.length === 0 ? "YES" : "NO",
      theme: { id: main.id, name: main.name },
      file_modified: TARGET_FILE,
      backup_path: backupName,
      asset_used_light_bg: LOGO_FILENAME,
      asset_used_dark_bg: LOGO_LIGHT_FILENAME,
      desktop_width_px: 168,
      mobile_width_px: 132,
      patch_kind: result.kind,
      after_length: result.patched.length,
      before_length: raw.length,
      userErrors,
    });
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message ?? e) }, 500);
  }
});
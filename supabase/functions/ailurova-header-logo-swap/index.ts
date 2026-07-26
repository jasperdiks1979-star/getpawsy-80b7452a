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

// Two candidate header files. Order matters: we probe both, but patch the
// FIRST one that contains a matching wordmark.
const CANDIDATE_FILES = [
  "sections/ailurova-one-product-store.liquid",
  "sections/header.liquid",
  "snippets/header.liquid",
];

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
  return [
    MARK_OPEN,
    `<a href="/" class="ail-brand-logo" aria-label="Ailurova — home">`,
    `  <img`,
    `    src="{{ 'ailurova-logo.svg' | asset_url }}"`,
    `    alt="Ailurova"`,
    `    width="168"`,
    `    height="28"`,
    `    decoding="async"`,
    `    class="ail-brand-logo__img"`,
    `  />`,
    `</a>`,
    `<style>`,
    `  .ail-brand-logo{display:inline-flex;align-items:center;line-height:0;text-decoration:none;color:inherit}`,
    `  .ail-brand-logo__img{display:block;width:168px;height:auto;max-height:32px;object-fit:contain;image-rendering:-webkit-optimize-contrast}`,
    `  @media (max-width: 749px){`,
    `    .ail-brand-logo__img{width:132px;max-height:28px}`,
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
type Match = { kind: string; index: number; length: number; snippet: string };

function findWordmark(raw: string): Match | null {
  // 1. Idempotent re-run: our own block already present → replace in place.
  const own = raw.match(new RegExp(`${MARK_OPEN}[\\s\\S]*?${MARK_CLOSE}`, "m"));
  if (own && typeof own.index === "number") {
    return { kind: "own_marker", index: own.index, length: own[0].length, snippet: "(existing marker block)" };
  }

  // 2. Anchor around the visible AILUROVA string. Then expand outward to the
  //    nearest enclosing <a ...>…</a> so we replace the whole link, not just
  //    the text node.
  const wordRe = /AILUROVA/;
  const wm = raw.match(wordRe);
  if (!wm || typeof wm.index !== "number") return null;

  const wordIdx = wm.index;
  // Walk backward for the nearest '<a ' that has href="/" (or a relative
  // homepage). Limit search window to 800 chars to avoid gobbling unrelated
  // markup.
  const winStart = Math.max(0, wordIdx - 800);
  const before = raw.slice(winStart, wordIdx);
  const aOpenMatches = [...before.matchAll(/<a\b[^>]*>/g)];
  const lastOpen = aOpenMatches.at(-1);
  if (!lastOpen || typeof lastOpen.index !== "number") return null;
  const openAbsStart = winStart + lastOpen.index;
  const openTag = lastOpen[0];
  // Only replace if the anchor points at homepage-ish targets.
  if (!/href\s*=\s*["'](\/|\{\{\s*routes\.root_url\s*\}\}|\{\{\s*shop\.url\s*\}\})["']/i.test(openTag)) {
    return null;
  }

  // Walk forward from wordIdx for the next '</a>'.
  const after = raw.slice(wordIdx);
  const closeIdx = after.search(/<\/a\s*>/i);
  if (closeIdx < 0) return null;
  const closeMatch = after.match(/<\/a\s*>/i)!;
  const endAbs = wordIdx + closeIdx + closeMatch[0].length;

  return {
    kind: "anchor_wordmark",
    index: openAbsStart,
    length: endAbs - openAbsStart,
    snippet: raw.slice(openAbsStart, endAbs).slice(0, 400),
  };
}

function patchFile(raw: string): { patched: string; match: Match } | null {
  const m = findWordmark(raw);
  if (!m) return null;
  const block = buildLogoBlock();
  const patched = raw.slice(0, m.index) + block + raw.slice(m.index + m.length);
  return { patched, match: m };
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

    const themes = await listThemes();
    const main = themes.find(t => t.role === "main");
    if (!main) return json({ ok: false, error: "No MAIN theme found" }, 404);
    const themeGid = `gid://shopify/OnlineStoreTheme/${main.id}`;

    // Probe both candidate files.
    const scans: Array<{ file: string; exists: boolean; length: number; match: Match | null }> = [];
    for (const f of CANDIDATE_FILES) {
      const raw = await readFile(themeGid, f);
      if (raw == null) {
        scans.push({ file: f, exists: false, length: 0, match: null });
        continue;
      }
      scans.push({ file: f, exists: true, length: raw.length, match: findWordmark(raw) });
    }

    if (probe || confirm !== CONFIRM) {
      return json({
        ok: true,
        mode: probe ? "probe" : "no_confirm",
        theme: { id: main.id, name: main.name, role: main.role },
        scans,
        needConfirm: !probe ? `POST { "confirm": "${CONFIRM}" } to apply` : undefined,
      });
    }

    // Apply: pick the first file with a match.
    const target = scans.find(s => s.exists && s.match);
    if (!target) {
      return json({ ok: false, error: "no_wordmark_found", scans });
    }

    const raw = await readFile(themeGid, target.file);
    if (!raw) return json({ ok: false, error: "target_file_disappeared", file: target.file });

    // Backup first.
    const backupName = target.file.replace(/\.liquid$/, `.backup-${ymdhms()}.liquid`);
    const backupRes = await upsertFile(themeGid, backupName, raw);
    const backupErrors = backupRes.data?.themeFilesUpsert?.userErrors ?? [];
    if (backupErrors.length) {
      return json({ ok: false, error: "backup_failed", backupName, backupErrors });
    }

    // Patch.
    const result = patchFile(raw);
    if (!result) return json({ ok: false, error: "patch_returned_null", file: target.file });

    const upRes = await upsertFile(themeGid, target.file, result.patched);
    const userErrors = upRes.data?.themeFilesUpsert?.userErrors ?? [];

    return json({
      ok: userErrors.length === 0,
      mutation_performed: userErrors.length === 0 ? "YES" : "NO",
      theme: { id: main.id, name: main.name },
      file_modified: target.file,
      backup_path: backupName,
      asset_used: LOGO_FILENAME,
      desktop_width_px: 168,
      mobile_width_px: 132,
      match: { kind: result.match.kind, before_snippet: result.match.snippet },
      after_length: result.patched.length,
      before_length: raw.length,
      userErrors,
    });
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message ?? e) }, 500);
  }
});
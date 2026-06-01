/**
 * safari-playback-check
 *
 * Verifies that a rendered MP4 URL will play inline on iPhone Safari without
 * CORS or mime issues. Run after every render/trim callback before we hand
 * the asset to validation or publishing.
 *
 * Checks performed against the public URL:
 *   1. URL hygiene        — no `//storage` double-slash (Safari sometimes
 *                           refuses cached responses on these paths).
 *   2. HEAD 200           — object exists and is reachable.
 *   3. Content-Type       — must be `video/mp4` (Safari refuses
 *                           `application/octet-stream` for inline <video>).
 *   4. Accept-Ranges      — server must advertise `bytes` so Safari can do
 *                           the partial-content seek it requires before play.
 *   5. Range 206          — `Range: bytes=0-1023` returns 206 Partial Content.
 *   6. moov atom present  — first 1KB contains the `moov` box, i.e. the file
 *                           was muxed with `+faststart`. Without this Safari
 *                           buffers the whole file before playback starts and
 *                           often gives up on cellular.
 *   7. CORS               — preflight-like GET from an `Origin:` header
 *                           returns `Access-Control-Allow-Origin: *` (or echo)
 *                           so Safari's media element does not block the
 *                           stream when embedded in our admin preview.
 *
 * Returns a structured report with `passed: boolean` plus per-check detail
 * for forensics in the job row. Never throws — network errors are reported
 * as failed checks.
 */

export interface SafariCheckItem {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface SafariPlaybackReport {
  url: string;
  passed: boolean;
  checked_at: string;
  checks: SafariCheckItem[];
  content_type: string | null;
  content_length: number | null;
  accept_ranges: string | null;
  cors_origin: string | null;
  has_double_slash: boolean;
  has_faststart: boolean | null;
  http_head_status: number | null;
  http_range_status: number | null;
  error?: string;
}

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

function check(name: string, passed: boolean, detail?: string): SafariCheckItem {
  return { name, passed, detail };
}

function hasDoubleSlashAfterHost(url: string): boolean {
  try {
    const u = new URL(url);
    return u.pathname.includes("//");
  } catch {
    return false;
  }
}

function containsMoovAtom(buf: Uint8Array): boolean {
  // moov box header is the ASCII string "moov" preceded by a 4-byte size.
  for (let i = 0; i < buf.length - 4; i++) {
    if (buf[i] === 0x6d && buf[i + 1] === 0x6f && buf[i + 2] === 0x6f && buf[i + 3] === 0x76) {
      return true;
    }
  }
  return false;
}

export async function verifySafariPlayback(
  url: string,
  opts: { origin?: string; timeoutMs?: number } = {},
): Promise<SafariPlaybackReport> {
  const checks: SafariCheckItem[] = [];
  const report: SafariPlaybackReport = {
    url,
    passed: false,
    checked_at: new Date().toISOString(),
    checks,
    content_type: null,
    content_length: null,
    accept_ranges: null,
    cors_origin: null,
    has_double_slash: false,
    has_faststart: null,
    http_head_status: null,
    http_range_status: null,
  };

  if (!url || !/^https?:\/\//i.test(url)) {
    checks.push(check("url_valid", false, `not an http(s) url: ${url}`));
    return report;
  }

  // 1. URL hygiene
  const dbl = hasDoubleSlashAfterHost(url);
  report.has_double_slash = dbl;
  checks.push(check("url_no_double_slash", !dbl, dbl ? "url contains '//' in path" : undefined));

  const origin = opts.origin ?? "https://getpawsy.pet";
  const timeoutMs = opts.timeoutMs ?? 8000;

  // 2. HEAD
  let headRes: Response | null = null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    headRes = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": IPHONE_UA, Origin: origin },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    report.http_head_status = headRes.status;
    checks.push(check("head_200", headRes.ok, `HTTP ${headRes.status}`));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    report.error = msg;
    checks.push(check("head_200", false, `network: ${msg}`));
    return report;
  }

  // 3. Content-Type
  const ct = headRes.headers.get("content-type");
  report.content_type = ct;
  const ctOk = !!ct && /^video\/mp4(\b|;)/i.test(ct);
  checks.push(check("content_type_video_mp4", ctOk, ct ?? "missing"));

  const clHeader = headRes.headers.get("content-length");
  report.content_length = clHeader ? Number(clHeader) : null;

  // 4. Accept-Ranges advertised
  const ar = headRes.headers.get("accept-ranges");
  report.accept_ranges = ar;
  const arOk = !!ar && /bytes/i.test(ar);
  checks.push(check("accept_ranges_bytes", arOk, ar ?? "missing"));

  // 5 + 6 + 7. Range request — verifies 206, CORS, and faststart.
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const rangeRes = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": IPHONE_UA,
        Origin: origin,
        Range: "bytes=0-1023",
      },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    report.http_range_status = rangeRes.status;
    checks.push(check("range_206", rangeRes.status === 206, `HTTP ${rangeRes.status}`));

    const cors = rangeRes.headers.get("access-control-allow-origin");
    report.cors_origin = cors;
    const corsOk = cors === "*" || (cors !== null && cors === origin);
    checks.push(check("cors_allow_origin", corsOk, cors ?? "missing"));

    const buf = new Uint8Array(await rangeRes.arrayBuffer());
    const moov = containsMoovAtom(buf);
    report.has_faststart = moov;
    checks.push(check("faststart_moov_atom", moov, moov ? undefined : "moov not in first 1KB"));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    report.error = report.error ?? msg;
    checks.push(check("range_206", false, `network: ${msg}`));
    checks.push(check("cors_allow_origin", false, "skipped — range failed"));
    checks.push(check("faststart_moov_atom", false, "skipped — range failed"));
  }

  // Pass criteria: every hard check passes. faststart and cors are warnings
  // (still considered required for Safari, so treated as blocking).
  report.passed = checks.every((c) => c.passed);
  return report;
}
// End-to-end Pinterest publish verification.
// Reused by `pinterest-cron-worker` (inline first pass) and
// `pinterest-verify-worker` (background reconciliation + hourly sample).
//
// Contract: given a `pinterest_pin_queue` row that already has a
// `pinterest_pin_id`, query Pinterest /v5/pins/{id} and confirm that what we
// asked for is what Pinterest published. Returns a deterministic check list,
// 0-100 score and one of three states.

export type VerificationState =
  | "waiting_verification"
  | "verified_success"
  | "verification_failed";

export interface VerificationCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface VerificationResult {
  state: VerificationState;
  score: number; // 0..100
  checks: VerificationCheck[];
  failureReason: string | null;
  warningReason?: string | null;
  pinterestPayload?: unknown;
  httpStatus?: number;
}

const normalizeUrl = (u: string | null | undefined): string => {
  if (!u) return "";
  try {
    const url = new URL(u.trim());
    // Strip trailing slash + lowercased host for comparison.
    return `${url.protocol}//${url.host.toLowerCase()}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return (u || "").trim().toLowerCase();
  }
};

const normalizeText = (t: string | null | undefined): string =>
  (t || "").replace(/\s+/g, " ").trim().toLowerCase();

export async function verifyPinFull(
  accessToken: string,
  apiBase: string,
  pin: {
    id: string;
    pinterest_pin_id?: string | null;
    pin_title?: string | null;
    pin_description?: string | null;
    pin_image_url?: string | null;
    destination_link?: string | null;
    final_resolved_url?: string | null;
    board_id?: string | null;
    board_name?: string | null;
    alt_text?: string | null;
  },
): Promise<VerificationResult> {
  const checks: VerificationCheck[] = [];
  const expectedPinId = pin.pinterest_pin_id;
  if (!expectedPinId) {
    return {
      state: "verification_failed",
      score: 0,
      checks: [{ name: "pin_id_present", ok: false, detail: "no pinterest_pin_id on queue row" }],
      failureReason: "missing_pin_id",
    };
  }

  let res: Response;
  try {
    res = await fetch(
      `${apiBase}/pins/${expectedPinId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
  } catch (e) {
    return {
      state: "verification_failed",
      score: 0,
      checks: [{ name: "api_reachable", ok: false, detail: (e as Error).message }],
      failureReason: "pinterest_api_unreachable",
    };
  }

  if (res.status === 401 || res.status === 403) {
    return {
      state: "verification_failed",
      score: 0,
      checks: [{ name: "token_authorized", ok: false, detail: `HTTP ${res.status}` }],
      failureReason: "token_unauthorized",
      httpStatus: res.status,
    };
  }

  if (res.status === 404) {
    return {
      state: "verification_failed",
      score: 0,
      checks: [{ name: "pin_exists", ok: false, detail: "404 from /pins/{id}" }],
      failureReason: "pin_not_found_on_pinterest",
      httpStatus: 404,
    };
  }

  if (!res.ok) {
    return {
      state: "verification_failed",
      score: 0,
      checks: [{ name: "pin_exists", ok: false, detail: `HTTP ${res.status}` }],
      failureReason: `pinterest_http_${res.status}`,
      httpStatus: res.status,
    };
  }

  const payload: any = await res.json().catch(() => ({}));
  checks.push({ name: "pin_exists", ok: true });

  // publish timestamp accepted
  const createdAt = payload?.created_at;
  checks.push({
    name: "publish_timestamp",
    ok: Boolean(createdAt),
    detail: createdAt || "missing",
  });

  // destination URL match
  const expectedLink = normalizeUrl(pin.final_resolved_url || pin.destination_link);
  const actualLink = normalizeUrl(payload?.link);
  // pinterest sometimes returns its own redirect wrapper — strip query for compare.
  const linkOk = expectedLink !== "" && actualLink.startsWith(expectedLink);
  checks.push({
    name: "destination_url_match",
    ok: linkOk,
    detail: linkOk ? undefined : `expected=${expectedLink} actual=${actualLink}`,
  });

  // board match
  const expectedBoard = pin.board_id ? String(pin.board_id) : null;
  const actualBoard = payload?.board_id ? String(payload.board_id) : null;
  const boardOk = !expectedBoard || (!!actualBoard && actualBoard === expectedBoard);
  checks.push({
    name: "board_match",
    ok: boardOk,
    detail: boardOk ? undefined : `expected=${expectedBoard} actual=${actualBoard}`,
  });

  // title match
  const expectedTitle = normalizeText(pin.pin_title);
  const actualTitle = normalizeText(payload?.title);
  const titleOk = !expectedTitle || actualTitle.startsWith(expectedTitle.slice(0, 60));
  checks.push({
    name: "title_match",
    ok: titleOk,
    detail: titleOk ? undefined : `expected≈"${expectedTitle.slice(0, 60)}" actual="${actualTitle.slice(0, 60)}"`,
  });

  // description match
  const expectedDesc = normalizeText(pin.pin_description);
  const actualDesc = normalizeText(payload?.description);
  const descOk = !expectedDesc || actualDesc.includes(expectedDesc.slice(0, 40));
  checks.push({
    name: "description_match",
    ok: descOk,
    detail: descOk ? undefined : `expected≈"${expectedDesc.slice(0, 40)}" actual="${actualDesc.slice(0, 40)}"`,
  });

  // alt text exists if we asked for one
  const altOk = !pin.alt_text || Boolean(payload?.alt_text);
  checks.push({ name: "alt_text_present", ok: altOk });

  // preview image present & https
  const media = payload?.media;
  const imageUrls: string[] = [];
  if (media?.images && typeof media.images === "object") {
    for (const v of Object.values<any>(media.images)) {
      if (v && typeof v.url === "string") imageUrls.push(v.url);
    }
  }
  const imgOk = imageUrls.length > 0 && imageUrls.every((u) => u.startsWith("https://"));
  checks.push({
    name: "preview_image_present",
    ok: imgOk,
    detail: imgOk ? `${imageUrls.length} variants` : "no https media images on Pinterest payload",
  });

  // publicly accessible: `is_removable=false` can be returned for owner/account
  // state and is not a restriction signal. Treat explicit secret/hidden/deleted
  // markers as blocking, otherwise a 200 + standard pin is live-public enough.
  const publicOk = payload?.visibility !== "secret" && payload?.is_deleted !== true && payload?.is_hidden !== true && payload?.is_standard !== false;
  checks.push({ name: "publicly_accessible", ok: publicOk });

  // hidden rejection signal
  const noRejection = !payload?.note?.includes("rejected") && !payload?.warnings?.length;
  checks.push({ name: "no_pinterest_warning", ok: noRejection });

  const passed = checks.filter((c) => c.ok).length;
  const score = Math.round((passed / checks.length) * 100);

  const failed = checks.filter((c) => !c.ok);
  const boardWarning = failed.some((c) => c.name === "board_match") &&
    failed.every((c) => c.name === "board_match");
  const blockingFailure = failed.find((c) =>
    ["pin_exists", "destination_url_match", "preview_image_present", "publicly_accessible"].includes(c.name)
  );

  const state: VerificationState =
    failed.length === 0 || boardWarning
      ? "verified_success"
      : blockingFailure
      ? "verification_failed"
      // Soft-fail (e.g. title diff after Pinterest auto-truncate) — still mark verified
      // but record the score so the dashboard can surface drift.
      : score >= 80
      ? "verified_success"
      : "verification_failed";

  return {
    state,
    score,
    checks,
    failureReason: state === "verified_success" ? (boardWarning ? "board_warning" : null) : (blockingFailure?.name ?? failed[0]?.name ?? null),
    warningReason: boardWarning ? "board_match" : null,
    pinterestPayload: { id: payload?.id, link: payload?.link, board_id: payload?.board_id, created_at: payload?.created_at },
    httpStatus: res.status,
  };
}

export const VERIFICATION_HEALTHY_MIN_SCORE = 95;
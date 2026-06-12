// Appends `&pin_id=<real_pinterest_pin_id>` onto a publisher destination URL
// and pushes the new link back to Pinterest via PATCH /pins/{id} so the
// outbound click that lands on getpawsy.pet carries the real pin id.
//
// Used by both pinterest-cron-worker and pinterest-publish-now. Pure helper —
// callers handle DB writes. NEVER throws: returns `{ ok: false, reason }` so
// a flaky PATCH never poisons the publish path.

export function stampPinIdOnLink(link: string, pinId: string): string {
  try {
    const u = new URL(link);
    // Idempotent: if pin_id already present and matches, leave it.
    if (u.searchParams.get("pin_id") === pinId) return u.toString();
    u.searchParams.set("pin_id", pinId);
    return u.toString();
  } catch {
    const sep = link.includes("?") ? "&" : "?";
    return `${link}${sep}pin_id=${encodeURIComponent(pinId)}`;
  }
}

// Slug helper: turns "Dog Beds & Crates" → "dog-beds-crates" so it survives as
// a utm_campaign / utm_content value without breaking URL parsers downstream.
function slugifyUtm(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  return s || null;
}

export interface UtmStampInput {
  pinId?: string | null;
  campaign?: string | null; // board name or category key
  content?: string | null;  // creative angle / hook
  source?: string;          // default "pinterest"
  medium?: string;          // default "social"
}

/**
 * Idempotently stamps `pin_id` + UTM params onto a destination URL so every
 * outbound click that lands on getpawsy.pet carries full attribution. Existing
 * values are preserved (we never overwrite a present param) so manual links
 * still win. Required by the Pinterest Revenue Attribution V3 pipeline.
 */
export function stampUtmsOnLink(link: string, p: UtmStampInput): string {
  const setIfMissing = (u: URL, key: string, val: string | null | undefined) => {
    if (!val) return;
    if (!u.searchParams.get(key)) u.searchParams.set(key, val);
  };
  try {
    const u = new URL(link);
    if (p.pinId) {
      // Use the stricter setter so a pre-existing pin_id is corrected to the
      // real Pinterest pin id once we know it.
      u.searchParams.set("pin_id", p.pinId);
    }
    setIfMissing(u, "utm_source", p.source ?? "pinterest");
    setIfMissing(u, "utm_medium", p.medium ?? "social");
    setIfMissing(u, "utm_campaign", slugifyUtm(p.campaign) ?? "pinterest");
    const content = slugifyUtm(p.content);
    if (content) setIfMissing(u, "utm_content", content);
    return u.toString();
  } catch {
    // URL parse failed — fall back to naive append. Loses idempotency for
    // params already present in the bare string, but better than dropping
    // attribution entirely.
    const parts: string[] = [];
    if (p.pinId) parts.push(`pin_id=${encodeURIComponent(p.pinId)}`);
    parts.push(`utm_source=${encodeURIComponent(p.source ?? "pinterest")}`);
    parts.push(`utm_medium=${encodeURIComponent(p.medium ?? "social")}`);
    parts.push(`utm_campaign=${encodeURIComponent(slugifyUtm(p.campaign) ?? "pinterest")}`);
    const content = slugifyUtm(p.content);
    if (content) parts.push(`utm_content=${encodeURIComponent(content)}`);
    const sep = link.includes("?") ? "&" : "?";
    return `${link}${sep}${parts.join("&")}`;
  }
}

export interface PatchResult {
  ok: boolean;
  reason?: string;
  status?: number;
}

export async function patchPinLink(
  accessToken: string,
  apiBase: string,
  pinId: string,
  newLink: string,
): Promise<PatchResult> {
  try {
    const res = await fetch(`${apiBase}/pins/${pinId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ link: newLink }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, reason: body.slice(0, 300) };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}
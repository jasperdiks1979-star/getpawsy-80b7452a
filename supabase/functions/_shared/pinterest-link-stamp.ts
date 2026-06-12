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
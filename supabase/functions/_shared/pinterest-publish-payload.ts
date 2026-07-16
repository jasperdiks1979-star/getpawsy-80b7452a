// Pure publish-payload validator. No npm imports — safe for Deno unit tests.
// Enforces every field the pinterest_publishable_queue view + cron-worker
// AI-only publisher gate actually read before POST /v5/pins.

export const REQUIRED_PUBLISH_FIELDS = [
  "product_id",
  "product_slug",
  "product_name",
  "run_id",
  "status",
  "pin_image_url",
  "destination_link",
  "pin_title",
  "pin_description",
  "board_id",
  "board_name",
  "category_key",
  "hook_group",
  "priority",
  "scheduled_at",
  "approved_at",
  "us_audience_score",
  "meta",
] as const;

export function validatePublishPayload(row: Record<string, unknown>): {
  ok: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  for (const f of REQUIRED_PUBLISH_FIELDS) {
    const v = row[f];
    if (v === null || v === undefined || v === "") missing.push(f);
  }
  const meta = row.meta as Record<string, unknown> | undefined;
  if (!meta || typeof meta !== "object") {
    if (!missing.includes("meta")) missing.push("meta");
  } else {
    if (!meta.creative_source) missing.push("meta.creative_source");
    if (meta.run_id !== row.run_id) missing.push("meta.run_id");
  }
  return { ok: missing.length === 0, missing };
}
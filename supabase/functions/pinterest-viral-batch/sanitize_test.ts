import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  sanitizeQueueRows,
  ALLOWED_QUEUE_COLUMNS,
  REQUIRED_QUEUE_COLUMNS,
  verifyQueueSchema,
  __resetSchemaCacheForTests,
  sanitizeQueueRowsWithReport,
} from "./index.ts";

// Regression: the production DB does NOT have backdrop_* columns on
// pinterest_pin_queue. The viral-batch function must drop them silently so
// the insert always succeeds.

Deno.test("sanitizeQueueRows strips backdrop_* and unknown columns", () => {
  const input = [
    {
      product_id: "p1",
      product_slug: "slug-1",
      product_name: "Test",
      pin_variant: "v1",
      pin_title: "t",
      pin_description: "d",
      pin_image_url: "https://example.com/a.jpg",
      destination_link: "https://example.com",
      board_name: "Smart Pet Gadgets",
      hashtags: ["#cat"],
      priority: "high",
      status: "queued",
      scheduled_at: new Date().toISOString(),
      hook_group: "pain",
      category_key: "cat-litter",
      overlay_text: "top | bottom",
      // ⛔ none of these exist on the table
      backdrop_url: "https://pexels/x.jpg",
      backdrop_avg_color: "#aabbcc",
      backdrop_source: "pexels",
      backdrop_width: 1080,
      backdrop_height: 1920,
      backdrop_photographer: "Jane",
      backdrop_pexels_page: "https://pexels/p/1",
      backdrop_hook_group: "pain",
      backdrop_style: "dark",
      backdrop_score: 0.81,
      backdrop_variants: [{ style: "dark", score: 0.8, url: "x" }],
      uses_lifestyle_backdrop: true,
      // unknown future field
      some_future_column: "ignore me",
    },
  ];

  const out = sanitizeQueueRows(input);
  assertEquals(out.length, 1);

  const keys = Object.keys(out[0]).sort();
  for (const k of keys) {
    if (!ALLOWED_QUEUE_COLUMNS.has(k)) {
      throw new Error(`Forbidden column leaked into insert payload: ${k}`);
    }
  }

  // Whitelisted columns survived
  assertEquals(out[0].product_slug, "slug-1");
  assertEquals(out[0].pin_image_url, "https://example.com/a.jpg");
  assertEquals(out[0].hook_group, "pain");

  // Forbidden columns dropped
  assertEquals((out[0] as Record<string, unknown>).backdrop_avg_color, undefined);
  assertEquals((out[0] as Record<string, unknown>).backdrop_url, undefined);
  assertEquals((out[0] as Record<string, unknown>).uses_lifestyle_backdrop, undefined);
  assertEquals((out[0] as Record<string, unknown>).some_future_column, undefined);
});

Deno.test("sanitizeQueueRows handles rows with ONLY backdrop fields without throwing", () => {
  const out = sanitizeQueueRows([
    { backdrop_avg_color: "#fff", backdrop_url: "x" } as Record<string, unknown>,
  ]);
  assertEquals(out.length, 1);
  assertEquals(Object.keys(out[0]).length, 0);
});

Deno.test("sanitizeQueueRows preserves row order and count", () => {
  const input = Array.from({ length: 5 }, (_, i) => ({
    pin_variant: `v${i}`,
    backdrop_avg_color: "#000",
  }));
  const out = sanitizeQueueRows(input);
  assertEquals(out.length, 5);
  assertEquals(out.map((r) => r.pin_variant), ["v0", "v1", "v2", "v3", "v4"]);
});

// ─────────────────────────────────────────────────────────────
// Schema guard regression — verifyQueueSchema must short-circuit
// before any pin generation when required columns are missing.
// ─────────────────────────────────────────────────────────────

function fakeClient(error: { message: string } | null) {
  return {
    from: () => ({
      // deno-lint-ignore require-await
      select: async () => ({ data: null, error }),
    }),
  } as unknown as Parameters<typeof verifyQueueSchema>[0];
}

Deno.test("verifyQueueSchema returns ok=true when select succeeds", async () => {
  __resetSchemaCacheForTests();
  const result = await verifyQueueSchema(fakeClient(null));
  assertEquals(result.ok, true);
});

Deno.test("verifyQueueSchema returns SCHEMA_INVALID when a required column is missing", async () => {
  __resetSchemaCacheForTests();
  const result = await verifyQueueSchema(
    fakeClient({ message: 'column pinterest_pin_queue.pin_image_url does not exist' }),
    { force: true },
  );
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.code, "SCHEMA_INVALID");
    assertEquals(result.missing.includes("pin_image_url"), true);
  }
});

Deno.test("REQUIRED_QUEUE_COLUMNS is a subset of ALLOWED_QUEUE_COLUMNS", () => {
  for (const col of REQUIRED_QUEUE_COLUMNS) {
    if (!ALLOWED_QUEUE_COLUMNS.has(col)) {
      throw new Error(`Required column "${col}" missing from ALLOWED_QUEUE_COLUMNS`);
    }
  }
});

Deno.test("sanitizeQueueRowsWithReport returns dropped column diagnostics", () => {
  const report = sanitizeQueueRowsWithReport([
    { pin_variant: "v0", backdrop_url: "x", backdrop_avg_color: "#fff" },
    { pin_variant: "v1", backdrop_avg_color: "#000", uses_lifestyle_backdrop: true },
    { pin_variant: "v2" },
  ]);
  assertEquals(report.rows.length, 3);
  assertEquals(report.droppedColumns.sort(), [
    "backdrop_avg_color", "backdrop_url", "uses_lifestyle_backdrop",
  ]);
  assertEquals(report.droppedCounts.backdrop_avg_color, 2);
  assertEquals(report.droppedCounts.backdrop_url, 1);
  assertEquals(report.droppedPerRow[2], []);
});
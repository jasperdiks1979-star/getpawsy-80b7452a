import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sanitizeQueueRowsWithReport } from "./index.ts";
import type {
  PinterestQueueInsert,
  PinterestPinDraft,
  BackdropMetadata,
  NoBackdropFields,
} from "../_shared/pinterest-queue-types.ts";

// ─────────────────────────────────────────────────────────────────
// Compile-time contract tests. If these stop type-checking, the
// pinterest_pin_queue insert payload contract has drifted.
// ─────────────────────────────────────────────────────────────────

Deno.test("PinterestQueueInsert does not allow backdrop_* fields", () => {
  // @ts-expect-error backdrop_avg_color is NOT a column on pinterest_pin_queue
  const _bad: PinterestQueueInsert = {
    product_id: "p",
    product_slug: "s",
    pin_variant: "v",
    pin_title: "t",
    pin_image_url: "https://x",
    destination_link: "https://x",
    status: "queued",
    scheduled_at: new Date().toISOString(),
    backdrop_avg_color: "#fff",
  };
  void _bad;

  // The valid version compiles fine.
  const good: PinterestQueueInsert = {
    product_id: "p",
    product_slug: "s",
    pin_variant: "v",
    pin_title: "t",
    pin_image_url: "https://x",
    destination_link: "https://x",
    status: "queued",
    scheduled_at: new Date().toISOString(),
  };
  assertEquals(good.status, "queued");
});

Deno.test("PinterestPinDraft permits backdrop_* fields, all optional", () => {
  const draft: PinterestPinDraft = {
    product_id: "p",
    product_slug: "s",
    pin_variant: "v",
    pin_title: "t",
    pin_image_url: "https://x",
    destination_link: "https://x",
    status: "queued",
    scheduled_at: new Date().toISOString(),
    // ALL of these are optional; omitting any of them must compile.
    backdrop_avg_color: "#fff",
    backdrop_url: "https://pexels/x.jpg",
    backdrop_source: "pexels",
  };
  // Verify a draft with NO backdrop_* fields also compiles.
  const bare: PinterestPinDraft = {
    product_id: "p",
    product_slug: "s",
    pin_variant: "v",
    pin_title: "t",
    pin_image_url: "https://x",
    destination_link: "https://x",
    status: "queued",
    scheduled_at: new Date().toISOString(),
  };
  assertEquals(draft.backdrop_source, "pexels");
  assertEquals(bare.product_slug, "s");
});

Deno.test("NoBackdropFields<T> rejects rows that carry backdrop_* keys", () => {
  type Row = PinterestQueueInsert & Partial<BackdropMetadata>;
  const rowOk: Row = {
    product_id: "p",
    product_slug: "s",
    pin_variant: "v",
    pin_title: "t",
    pin_image_url: "https://x",
    destination_link: "https://x",
    status: "queued",
    scheduled_at: new Date().toISOString(),
  };
  const safe: NoBackdropFields<Row> = rowOk;
  void safe;

  // @ts-expect-error backdrop_avg_color must be `never` after NoBackdropFields
  const _unsafe: NoBackdropFields<Row> = {
    ...rowOk,
    backdrop_avg_color: "#fff",
  };
  void _unsafe;
});

Deno.test("sanitizeQueueRowsWithReport returns PinterestQueueInsert[]", () => {
  const { rows } = sanitizeQueueRowsWithReport([
    {
      product_id: "p",
      product_slug: "s",
      pin_variant: "v",
      pin_title: "t",
      pin_image_url: "https://x",
      destination_link: "https://x",
      status: "queued",
      scheduled_at: new Date().toISOString(),
      backdrop_avg_color: "#fff", // dropped
    },
  ]);
  // Type-narrowing — this assignment must compile.
  const insertPayload: PinterestQueueInsert[] = rows;
  assertEquals(insertPayload.length, 1);
  assertEquals(insertPayload[0].product_slug, "s");
});
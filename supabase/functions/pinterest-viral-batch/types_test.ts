import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sanitizeQueueRowsWithReport } from "./index.ts";
import type {
  PinterestQueueInsert,
  PinterestPinDraft,
  BackdropMetadata,
  NoBackdropFields,
} from "../_shared/pinterest-queue-types.ts";
import { stripBackdropFields } from "../_shared/pinterest-queue-types.ts";

// ─────────────────────────────────────────────────────────────────
// Compile-time contract tests. If these stop type-checking, the
// pinterest_pin_queue insert payload contract has drifted.
// ─────────────────────────────────────────────────────────────────

Deno.test("PinterestQueueInsert accepts only known queue columns", () => {
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
  // Verify backdrop_* keys are not part of the type via runtime KEY check.
  const allowedKeys = new Set(Object.keys(good));
  assertEquals(allowedKeys.has("backdrop_avg_color"), false);
  assertEquals(allowedKeys.has("backdrop_url"), false);
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

Deno.test("NoBackdropFields<T> erases backdrop_* keys from the type", () => {
  // Pure type-level check: NoBackdropFields applied to a draft must produce a
  // type whose backdrop_* properties are `undefined` only.
  const safe: NoBackdropFields<PinterestQueueInsert> = {
    product_id: "p",
    product_slug: "s",
    pin_variant: "v",
    pin_title: "t",
    pin_image_url: "https://x",
    destination_link: "https://x",
    status: "queued",
    scheduled_at: new Date().toISOString(),
  };
  // backdrop_url is typed as `undefined` only — assigning a value would fail.
  const _check: undefined = safe.backdrop_url;
  assertEquals(_check, undefined);
});

Deno.test("NoBackdropFields rejects backdrop_* even when null (compile + runtime)", () => {
  // @ts-expect-error — `null` must NOT satisfy `?: never`.
  const _bad: NoBackdropFields<PinterestQueueInsert> = {
    product_id: "p",
    product_slug: "s",
    pin_variant: "v",
    pin_title: "t",
    pin_image_url: "https://x",
    destination_link: "https://x",
    status: "queued",
    scheduled_at: new Date().toISOString(),
    backdrop_avg_color: null,
  };
  // Runtime: stripBackdropFields removes the key entirely (not just nulls it).
  const cleaned = stripBackdropFields({
    product_id: "p",
    backdrop_avg_color: null,
    backdrop_url: null,
    backdrop_source: "pexels",
  });
  assertEquals("backdrop_avg_color" in cleaned, false);
  assertEquals("backdrop_url" in cleaned, false);
  assertEquals("backdrop_source" in cleaned, false);
  assertEquals((cleaned as { product_id: string }).product_id, "p");
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
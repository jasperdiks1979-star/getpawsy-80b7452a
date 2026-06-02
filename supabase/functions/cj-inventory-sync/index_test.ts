import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeUsStock } from "./index.ts";

Deno.test("computeUsStock — counts only US warehouse entries", () => {
  const list = [
    { areaEn: "US", storageNum: 12, vid: "v1" },
    { areaEn: "CN", storageNum: 99, vid: "v1" },
    { warehouseName: "US-West", storageNum: 5, vid: "v2" },
    { countryCode: "DE", storageNum: 50, vid: "v3" },
  ];
  const { total, perVariant } = computeUsStock(list);
  assertEquals(total, 17);
  assertEquals(perVariant, { v1: 12, v2: 5 });
});

Deno.test("computeUsStock — returns 0 when no US stock", () => {
  const list = [
    { areaEn: "CN", storageNum: 100 },
    { areaEn: "DE", storageNum: 20 },
  ];
  const { total } = computeUsStock(list);
  assertEquals(total, 0);
});

Deno.test("computeUsStock — ignores zero/negative entries", () => {
  const list = [
    { areaEn: "US", storageNum: 0 },
    { areaEn: "US", storageNum: -5 },
    { areaEn: "US", storageNum: 7 },
  ];
  assertEquals(computeUsStock(list).total, 7);
});

Deno.test("computeUsStock — handles empty list", () => {
  assertEquals(computeUsStock([]).total, 0);
});
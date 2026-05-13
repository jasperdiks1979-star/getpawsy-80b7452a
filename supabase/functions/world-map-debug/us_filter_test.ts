import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { US_VALUES, isUS } from "./index.ts";

const POSITIVES = [
  "us", "USA", "U.S.", "u.s.a.", "United States", "UNITED STATES OF AMERICA",
  "  united states  ", "\tUSA\n", " u.s. ", "United states of America",
];

const NEGATIVES = [
  "", "   ", "canada", "Puerto Rico", "United Kingdom", "us of a",
  "america", "united-states", "u s", null, undefined,
];

Deno.test("US_VALUES contains canonical lowercase variants", () => {
  for (const v of ["us", "usa", "u.s.", "u.s.a.", "united states", "united states of america"]) {
    assert(US_VALUES.has(v), `US_VALUES missing ${v}`);
  }
});

Deno.test("isUS matches case-insensitive with trim", () => {
  for (const v of POSITIVES) {
    assert(isUS(v), `expected isUS(${JSON.stringify(v)}) === true`);
  }
});

Deno.test("isUS rejects non-US, empty, null, and partial matches", () => {
  for (const v of NEGATIVES) {
    assertEquals(isUS(v as any), false, `expected isUS(${JSON.stringify(v)}) === false`);
  }
});

Deno.test("isUS does not match substrings or hyphenated variants", () => {
  assertEquals(isUS("united states of america!"), false);
  assertEquals(isUS("the united states"), false);
  assertEquals(isUS("united-states"), false);
});
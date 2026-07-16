import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveDogBoardKey } from "./pinterest-board-routing.ts";

const cases: Array<[string, string, string, string]> = [
  // [label, category, name, expected key]
  ["home ramp",      "Dog Ramps",           "PawHut Foldable Dog Ramp for Home Access", "fallback"],
  ["car ramp",       "Dog Travel",          "Folding Dog Car Ramp for SUV Trunk",       "travel"],
  ["agility ramp",   "Dog Toys",            "Dog Agility Ramp Training Obstacle",       "fallback"],
  ["carrier",        "Dog Travel",          "Aluminum Dog Transport Carrier",           "travel"],
  ["travel bottle",  "Dog Feeding",         "Portable Dog Travel Water Bottle",         "travel"],
  ["dog bed",        "Dog Beds",            "Orthopedic Memory Foam Dog Bed",           "beds"],
  ["harness",        "Dog Walking",         "No-Pull Reflective Dog Harness",           "walking"],
  ["chew toy",       "Dog Toys",            "Interactive Dog Chew Toy",                 "fallback"],
  ["feeding station","Dog Feeding",         "Elevated Stainless Steel Dog Feeding Station", "fallback"],
  ["smart feeder",   "Dog Feeding",         "Smart Auto Dog Feeder with WiFi",          "gadgets"],
  ["grooming",       "Dog Grooming",        "Deshedding Grooming Brush for Dogs",       "fallback"],
  ["fountain",       "Dog Hydration",       "Dog Water Fountain 2L",                    "fallback"],
  ["car seat",       "Dog Travel",          "Dog Car Booster Seat for Small Dogs",      "travel"],
  ["leash",          "Dog Walking",         "Heavy-Duty Nylon Dog Leash",               "walking"],
  ["stairs home",    "Dog Ramps",           "Wooden Dog Stairs for Bed",                "fallback"],
];

for (const [label, category, name, expected] of cases) {
  Deno.test(`board routing: ${label} → ${expected}`, () => {
    assertEquals(resolveDogBoardKey(category, name), expected);
  });
}
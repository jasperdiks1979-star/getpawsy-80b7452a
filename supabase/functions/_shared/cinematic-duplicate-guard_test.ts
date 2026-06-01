import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BLOCKING_STATUSES,
  isBlockingStatus,
  pickBlockingSibling,
} from "./cinematic-duplicate-guard.ts";

const RUN_A = "run-aaaaaaaa";
const RUN_B = "run-bbbbbbbb";

function row(id: string, status: string, runId: string | null = null) {
  return { id, status, director_run_id: runId };
}

Deno.test("BLOCKING_STATUSES contains only render_queued and rendering", () => {
  assertEquals([...BLOCKING_STATUSES].sort(), ["render_queued", "rendering"]);
});

Deno.test("isBlockingStatus rejects prepared / preparing / pending / failed / completed", () => {
  for (const s of ["prepared", "preparing", "pending", "failed", "completed", "qa_passed", null, undefined]) {
    assertEquals(isBlockingStatus(s as any), false, `status ${s} should not block`);
  }
  assertEquals(isBlockingStatus("render_queued"), true);
  assertEquals(isBlockingStatus("rendering"), true);
});

Deno.test("4 prepared sibling concepts in one run: all 4 can enter queue-render", () => {
  // Mirrors the production failure: cinematic-ad-prepare fanned out 4
  // concept rows for the same product, all in `prepared`. Each one calls
  // queue-render and must NOT be blocked by its 3 prepared peers.
  const siblings = [
    row("c1", "prepared", RUN_A),
    row("c2", "prepared", RUN_A),
    row("c3", "prepared", RUN_A),
    row("c4", "prepared", RUN_A),
  ];
  for (const self of siblings) {
    const others = siblings.filter((s) => s.id !== self.id);
    const blocker = pickBlockingSibling({ id: self.id, director_run_id: RUN_A }, others);
    assertEquals(blocker, null, `concept ${self.id} must not be blocked by prepared peers`);
  }
});

Deno.test("same-run siblings already rendering do not block each other", () => {
  const siblings = [
    row("c1", "rendering", RUN_A),
    row("c2", "render_queued", RUN_A),
  ];
  const blocker = pickBlockingSibling(
    { id: "c3", director_run_id: RUN_A },
    siblings,
  );
  assertEquals(blocker, null);
});

Deno.test("different run with render_queued sibling DOES block (cross-run duplicate protection)", () => {
  const siblings = [
    row("old-1", "render_queued", RUN_A),
    row("old-2", "prepared", RUN_A), // prepared still ignored
  ];
  const blocker = pickBlockingSibling(
    { id: "new-1", director_run_id: RUN_B },
    siblings,
  );
  assertEquals(blocker?.id, "old-1");
});

Deno.test("different run with rendering sibling DOES block", () => {
  const siblings = [row("old-1", "rendering", RUN_A)];
  const blocker = pickBlockingSibling(
    { id: "new-1", director_run_id: RUN_B },
    siblings,
  );
  assertEquals(blocker?.id, "old-1");
});

Deno.test("legacy solo job (null run id) is blocked by any render_queued/rendering sibling", () => {
  const siblings = [row("old-1", "render_queued", RUN_A)];
  const blocker = pickBlockingSibling(
    { id: "new-1", director_run_id: null },
    siblings,
  );
  assertEquals(blocker?.id, "old-1");
});

Deno.test("legacy solo siblings (null run id) block a new run too", () => {
  const siblings = [row("legacy", "rendering", null)];
  const blocker = pickBlockingSibling(
    { id: "new-1", director_run_id: RUN_A },
    siblings,
  );
  assertEquals(blocker?.id, "legacy");
});

Deno.test("self is never blocker, even with matching id", () => {
  const siblings = [row("self", "rendering", RUN_A)];
  const blocker = pickBlockingSibling(
    { id: "self", director_run_id: RUN_A },
    siblings,
  );
  assertEquals(blocker, null);
});

Deno.test("prepared siblings across DIFFERENT runs still do not block (only render_queued/rendering do)", () => {
  const siblings = [row("other-run-prep", "prepared", RUN_A)];
  const blocker = pickBlockingSibling(
    { id: "new-1", director_run_id: RUN_B },
    siblings,
  );
  assertEquals(blocker, null);
});
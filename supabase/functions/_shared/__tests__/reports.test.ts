import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

type Row = { productView: { id: string; offerId: string; title: string; itemIssues?: Array<{ code: string; severity: string }>; aggregatedReportingContextStatus?: string } };

function parseRows(res: { results?: Row[] }): Array<{ offerId: string; issues: number; status?: string }> {
  return (res.results ?? []).map((r) => ({
    offerId: r.productView.offerId,
    issues: (r.productView.itemIssues ?? []).length,
    status: r.productView.aggregatedReportingContextStatus,
  }));
}

Deno.test("reports parser extracts offerId, issue count, status", () => {
  const out = parseRows({
    results: [
      { productView: { id: "en~US~a", offerId: "a", title: "A", aggregatedReportingContextStatus: "ELIGIBLE" } },
      { productView: { id: "en~US~b", offerId: "b", title: "B", itemIssues: [{ code: "image_link_broken", severity: "critical" }] } },
    ],
  });
  assertEquals(out, [{ offerId: "a", issues: 0, status: "ELIGIBLE" }, { offerId: "b", issues: 1, status: undefined }]);
});

Deno.test("reports parser tolerates empty results", () => {
  assertEquals(parseRows({}), []);
});
import { describe, expect, it } from "vitest";
import { fetchEvidencePages } from "../../supabase/functions/_shared/evidence-pagination";
const records = Array.from({ length: 1203 }, (_, i) => ({ id: String(i).padStart(5, "0"), session_id: "s" }));
const page = (source: typeof records) => async (offset: number, size: number) => ({
  data: source.slice(offset, offset + size), count: source.length, error: null,
});
describe("bounded session evidence pagination", () => {
  it("retrieves all 1203 records over multiple pages", async () => {
    expect((await fetchEvidencePages(page(records), "activity", { pageSize: 500 })).length).toBe(1203);
  });
  it("accepts empty evidence", async () => {
    expect(await fetchEvidencePages(page([]), "activity")).toEqual([]);
  });
  it("fails closed on too many records", async () => {
    await expect(fetchEvidencePages(page(records), "activity", { maxRows: 1000 })).rejects.toThrow(/safety limit/);
  });
  it("fails closed when exact count changes", async () => {
    let calls = 0;
    await expect(fetchEvidencePages(async (offset, size) => ({
      data: records.slice(offset, offset + size), count: ++calls === 1 ? 1203 : 1204, error: null,
    }), "activity", { pageSize: 500 })).rejects.toThrow(/count changed/);
  });
  it("fails closed on duplicate IDs", async () => {
    await expect(fetchEvidencePages(page([{ id: "a", session_id: "s" }, { id: "a", session_id: "s" }]), "activity")).rejects.toThrow(/duplicate/);
  });
  it("fails closed on a truncated server page", async () => {
    await expect(fetchEvidencePages(async () => ({ data: records.slice(0, 100), count: 1203, error: null }), "activity")).rejects.toThrow(/truncated/);
  });
  it("fails closed when deadline is reached", async () => {
    await expect(fetchEvidencePages(page(records), "activity", { deadline: 100, now: () => 100 })).rejects.toThrow(/deadline/);
  });
  it("fails closed on API errors", async () => {
    await expect(fetchEvidencePages(async () => ({ data: null, count: null, error: { message: "timeout" } }), "activity")).rejects.toThrow(/timeout/);
  });
  it("rejects missing count", async () => {
    await expect(fetchEvidencePages(async () => ({ data: [], count: null, error: null }), "activity")).rejects.toThrow(/count unavailable/);
  });
});

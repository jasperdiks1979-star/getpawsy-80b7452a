// Strict-JSON extractor for the AI QC verdict. Kept in a standalone module so
// it can be unit-tested without booting the full edge-function graph.
export function extractStrictQcJson(
  content: string,
): { score: number; ok: boolean; reasons: string[] } | null {
  if (!content) return null;
  const trimmed = content.trim();
  const candidates: string[] = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) candidates.push(fence[1].trim());
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1));
  for (const c of candidates) {
    try {
      const v = JSON.parse(c);
      if (
        v && typeof v === "object" &&
        typeof v.score === "number" &&
        typeof v.ok === "boolean" &&
        Array.isArray(v.reasons)
      ) {
        return {
          score: v.score,
          ok: v.ok,
          reasons: v.reasons.map((x: unknown) => String(x)),
        };
      }
    } catch { /* try next candidate */ }
  }
  return null;
}
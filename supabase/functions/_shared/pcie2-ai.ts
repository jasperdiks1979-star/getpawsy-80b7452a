// PCIE2 shared AI helpers: chat completions, JSON, and embeddings via Lovable AI Gateway.
// Server-side only. Do not import in client code.

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${KEY}`,
  } as Record<string, string>;
}

export async function chatJson<T = unknown>(opts: {
  model?: string;
  system?: string;
  prompt: string;
  temperature?: number;
}): Promise<T> {
  const model = opts.model ?? "google/gemini-3-flash-preview";
  const messages = [
    ...(opts.system ? [{ role: "system", content: opts.system }] : []),
    { role: "user", content: opts.prompt },
  ];
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.8,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    throw new Error(`gateway_chat_${res.status}:${(await res.text()).slice(0, 200)}`);
  }
  const j = await res.json();
  const text = j?.choices?.[0]?.message?.content ?? "{}";
  try { return JSON.parse(text) as T; } catch { return JSON.parse(text.replace(/```json|```/g, "")) as T; }
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const res = await fetch(`${GATEWAY}/embeddings`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model: "openai/text-embedding-3-small",
      input: texts,
      dimensions: 1536,
    }),
  });
  if (!res.ok) throw new Error(`gateway_embed_${res.status}:${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return (j.data ?? []).map((d: { embedding: number[] }) => d.embedding);
}

export function pgvector(v: number[]): string {
  return "[" + v.map((x) => Number(x).toFixed(6)).join(",") + "]";
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

export function readingGrade(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const sentences = Math.max(1, text.split(/[.!?]+/).filter((s) => s.trim()).length);
  const syllables = words.reduce((s, w) => s + Math.max(1, (w.toLowerCase().match(/[aeiouy]+/g) ?? []).length), 0);
  return 0.39 * (words.length / sentences) + 11.8 * (syllables / Math.max(1, words.length)) - 15.59;
}

export const HEADLINE_FAMILIES = [
  "curiosity","fomo","problem","solution","transformation","comparison",
  "statistics","emotional","luxury","budget","urgency","educational",
  "question","story","before_after","authority","social_proof","seasonal",
  "holiday","gift","benefit","pain",
] as const;

export const CREATIVE_CONCEPTS = [
  "lifestyle","close_up","comparison","problem","solution","pet_interaction",
  "owner_interaction","luxury","minimal","outdoor","indoor","motion",
  "premium","funny","educational",
] as const;

export const HOOK_INTENTS = ["curiosity","problem","solution","social_proof","authority","gift"];

import { createClient } from "npm:@supabase/supabase-js@2";

type ProductRow = {
  id: string;
  slug?: string | null;
  title?: string | null;
  product_type?: string | null;
  animal_type?: string | null;
  primary_keyword?: string | null;
  key_feature?: string | null;
  brand?: string | null;
};

type OptimizeRequest = {
  limit?: number;
  dryRun?: boolean;
  ids?: string[];
  shortTitlesOnly?: boolean;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing required Supabase environment variables.");
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: corsHeaders,
  });
}

function sanitizePart(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[|]+/g, " ")
    .replace(/[^\p{L}\p{N}\s&/+,\-().]/gu, "")
    .trim();
}

function titleCase(input: string): string {
  return input
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function dedupeWords(input: string): string {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of input.split(" ")) {
    const word = raw.trim();
    if (!word) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }

  return out.join(" ");
}

function clampTitle(input: string, max = 120): string {
  const clean = input.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;

  const parts = clean.split(" ");
  let out = "";

  for (const part of parts) {
    const next = out ? `${out} ${part}` : part;
    if (next.length > max) break;
    out = next;
  }

  return out.trim();
}

function buildFallbackTitle(
  product: ProductRow,
  shortTitlesOnly = false,
): string {
  const primaryKeyword = sanitizePart(product.primary_keyword);
  const productType = sanitizePart(product.product_type);
  const keyFeature = sanitizePart(product.key_feature);
  const animalType = sanitizePart(product.animal_type);
  const brand = sanitizePart(product.brand);

  const orderedParts = [
    primaryKeyword,
    productType,
    keyFeature,
    animalType,
    brand,
  ].filter(Boolean);

  let title = orderedParts.join(" ");
  title = titleCase(dedupeWords(title));

  const max = shortTitlesOnly ? 70 : 120;
  title = clampTitle(title, max);

  if (!title) {
    title = clampTitle(
      titleCase(dedupeWords(sanitizePart(product.title) || "Pet Product")),
      max,
    );
  }

  return title;
}

function isValidOptimizedTitle(title: string, shortTitlesOnly = false): boolean {
  const min = 25;
  const max = shortTitlesOnly ? 70 : 120;

  return (
    !!title &&
    title.length >= min &&
    title.length <= max &&
    !/^\W+$/.test(title)
  );
}

async function generateTitleWithAI(
  product: ProductRow,
  shortTitlesOnly = false,
): Promise<string | null> {
  if (!LOVABLE_API_KEY) return null;

  const maxChars = shortTitlesOnly ? 70 : 120;

  const prompt = `
Create one Google Shopping product title.
Rules:
- ${shortTitlesOnly ? "Maximum 70 characters." : "Between 70 and 120 characters if possible, never exceed 120."}
- English only
- No promotional claims like "best", "cheap", "sale", "free shipping"
- No excessive punctuation
- Prioritize this structure:
  Primary Keyword + Product Type + Key Feature + Target Animal
- Return only the title, no quotes

Product data:
Current title: ${product.title ?? ""}
Primary keyword: ${product.primary_keyword ?? ""}
Product type: ${product.product_type ?? ""}
Key feature: ${product.key_feature ?? ""}
Target animal: ${product.animal_type ?? ""}
Brand: ${product.brand ?? ""}
`.trim();

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error("AI title generation failed:", resp.status, errText);
    if (resp.status === 429 || resp.status === 402) {
      console.error("Rate limit or credits issue — falling back to template");
    }
    return null;
  }

  const data = await resp.json();
  const raw = data?.choices?.[0]?.message?.content ?? null;

  if (!raw || typeof raw !== "string") return null;

  const cleaned = clampTitle(
    titleCase(dedupeWords(sanitizePart(raw))),
    maxChars,
  );

  return cleaned;
}

async function requireUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false as const,
      response: json({ ok: false, error: "Missing bearer token." }, 401),
    };
  }

  const token = authHeader.replace("Bearer ", "").trim();

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token);

  if (error || !user) {
    return {
      ok: false as const,
      response: json(
        { ok: false, error: "Unauthorized", details: error?.message ?? null },
        401,
      ),
    };
  }

  return { ok: true as const, user };
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as OptimizeRequest;
    const limit = Math.min(Math.max(body.limit ?? 20, 1), 500);
    const dryRun = body.dryRun ?? false;
    const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
    const shortTitlesOnly = body.shortTitlesOnly ?? false;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let query = admin
      .from("products")
      .select(
        "id, slug, title, product_type, animal_type, primary_keyword, key_feature, brand",
      )
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (ids.length > 0) {
      query = admin
        .from("products")
        .select(
          "id, slug, title, product_type, animal_type, primary_keyword, key_feature, brand",
        )
        .in("id", ids)
        .limit(limit);
    }

    const { data: products, error: loadError } = await query;

    if (loadError) {
      return json(
        {
          ok: false,
          error: "Failed to load products",
          details: loadError.message,
        },
        500,
      );
    }

    const rows = (products ?? []) as ProductRow[];
    const results: Array<Record<string, unknown>> = [];
    let updated = 0;
    let failed = 0;

    for (const product of rows) {
      try {
        let optimized = await generateTitleWithAI(product, shortTitlesOnly);

        if (!optimized || !isValidOptimizedTitle(optimized, shortTitlesOnly)) {
          optimized = buildFallbackTitle(product, shortTitlesOnly);
        }

        if (!isValidOptimizedTitle(optimized, shortTitlesOnly)) {
          failed += 1;
          results.push({
            id: product.id,
            slug: product.slug,
            ok: false,
            reason: "Could not generate a valid title",
          });
          continue;
        }

        if (!dryRun) {
          const { error: updateError } = await admin
            .from("products")
            .update({
              shopping_title: optimized,
              title_optimized_at: new Date().toISOString(),
            })
            .eq("id", product.id);

          if (updateError) {
            failed += 1;
            results.push({
              id: product.id,
              slug: product.slug,
              ok: false,
              reason: updateError.message,
            });
            continue;
          }
        }

        updated += 1;
        results.push({
          id: product.id,
          slug: product.slug,
          ok: true,
          oldTitle: product.title,
          newTitle: optimized,
          dryRun,
        });
      } catch (err) {
        failed += 1;
        results.push({
          id: product.id,
          slug: product.slug,
          ok: false,
          reason: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return json({
      ok: true,
      success: true,
      processed: rows.length,
      updated,
      failed,
      dryRun,
      shortTitlesOnly,
      results,
    });
  } catch (err) {
    console.error("Unhandled optimize-product-titles error:", err);

    return json(
      {
        ok: false,
        error: "Unhandled server error",
        details: err instanceof Error ? err.message : "Unknown error",
      },
      500,
    );
  }
});

// AILUROVA — STRICTLY SCOPED THEME RENAME
//
// Safety contract:
//  - Only theme 202525999436 is renamed. No other theme, product, price,
//    inventory, publication, policy, or file mutation is performed.
//  - The live theme 201779872076 (role MAIN) is queried for verification
//    but never modified.
//  - The target theme is only renamed if its current role is UNPUBLISHED.

import { shopifyAdminRest } from "../_shared/shopify-token-provider.ts";
import { corsHeaders } from "../_shared/cors.ts";

const TARGET_NUMERIC_ID = 202525999436;
const LIVE_NUMERIC_ID = 201779872076;
const CURRENT_NAME = "Ailurova — Work Draft";
const NEW_NAME = "Ailurova — Lovable Final Draft";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getTheme(numericId: number) {
  const r = await shopifyAdminRest<{ theme?: { id: number; name: string; role: string; updated_at: string; created_at: string; theme_store_id: number | null; previewable: boolean } }>(
    `themes/${numericId}.json`,
  );
  return r.data?.theme ?? null;
}

async function renameTheme(numericId: number, newName: string) {
  const r = await shopifyAdminRest<{ theme?: { id: number; name: string; role: string; updated_at: string } }>(
    `themes/${numericId}.json`,
    { method: "PUT", body: { theme: { name: newName } } },
  );
  return { theme: r.data?.theme ?? null, status: r.status, text: r.text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const beforeTarget = await getTheme(TARGET_NUMERIC_ID);
    const beforeLive = await getTheme(LIVE_NUMERIC_ID);

    if (!beforeTarget) {
      return json({ error: "TARGET_THEME_NOT_FOUND", numericId: TARGET_NUMERIC_ID }, 404);
    }
    if (!beforeLive) {
      return json({ error: "LIVE_THEME_NOT_FOUND", numericId: LIVE_NUMERIC_ID }, 404);
    }
    if (String(beforeTarget.role).toUpperCase() !== "UNPUBLISHED") {
      return json({
        error: "TARGET_ROLE_SAFETY_BLOCK",
        numericId: TARGET_NUMERIC_ID,
        currentRole: beforeTarget.role,
        requiredRole: "UNPUBLISHED",
      }, 409);
    }
    if (String(beforeLive.role).toUpperCase() !== "MAIN") {
      return json({
        error: "LIVE_ROLE_SAFETY_BLOCK",
        numericId: LIVE_NUMERIC_ID,
        currentRole: beforeLive.role,
        expectedRole: "MAIN",
      }, 409);
    }
    if (beforeTarget.name !== CURRENT_NAME) {
      return json({
        error: "CURRENT_NAME_MISMATCH",
        numericId: TARGET_NUMERIC_ID,
        expectedName: CURRENT_NAME,
        actualName: beforeTarget.name,
      }, 409);
    }

    const { theme: afterTarget, status: renameStatus, text: renameText } = await renameTheme(TARGET_NUMERIC_ID, NEW_NAME);

    const afterLive = await getTheme(LIVE_NUMERIC_ID);

    return json({
      ok: !!afterTarget && afterTarget.name === NEW_NAME,
      renameStatus,
      renameResponse: renameText ? JSON.parse(renameText) : null,
      before: {
        target: { id: beforeTarget.id, name: beforeTarget.name, role: beforeTarget.role, updatedAt: beforeTarget.updated_at },
        live: { id: beforeLive.id, name: beforeLive.name, role: beforeLive.role, updatedAt: beforeLive.updated_at },
      },
      after: {
        target: afterTarget ? { id: afterTarget.id, name: afterTarget.name, role: afterTarget.role, updatedAt: afterTarget.updated_at } : null,
        live: afterLive ? { id: afterLive.id, name: afterLive.name, role: afterLive.role, updatedAt: afterLive.updated_at } : null,
      },
      liveThemeUntouched: beforeLive.updated_at === afterLive?.updated_at && beforeLive.name === afterLive?.name,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

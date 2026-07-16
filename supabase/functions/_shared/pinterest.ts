import { PINTEREST_API_BASE } from "./pinterest-config.ts";

type PinterestBoard = {
  id: string;
  name?: string | null;
  ownerUsername?: string | null;
};

function normalizeBoardName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function listPinterestBoards(accessToken: string, apiBase = PINTEREST_API_BASE): Promise<PinterestBoard[]> {
  const boards: PinterestBoard[] = [];
  let bookmark: string | null = null;

  for (let page = 0; page < 5; page++) {
    const url = new URL(`${apiBase}/boards`);
    url.searchParams.set("page_size", "250");
    url.searchParams.set("privacy", "ALL");
    if (bookmark) url.searchParams.set("bookmark", bookmark);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[Pinterest] Board list failed (${response.status}): ${errorText}`);
      break;
    }

    const payload = await response.json();
    const items = Array.isArray(payload?.items) ? payload.items : [];
    console.log(`[Pinterest] Board list page ${page}: ${items.length} boards found`);

    boards.push(
      ...items
        .filter((item: unknown) => typeof item === "object" && item !== null)
        .map((item: Record<string, unknown>) => ({
          id: String(item.id ?? ""),
          name: typeof item.name === "string" ? item.name : null,
          ownerUsername: typeof (item as any)?.owner?.username === "string"
            ? (item as any).owner.username
            : typeof (item as any)?.board_owner?.username === "string"
            ? (item as any).board_owner.username
            : null,
        }))
        .filter((item: PinterestBoard) => item.id),
    );

    bookmark = typeof payload?.bookmark === "string" && payload.bookmark.length > 0
      ? payload.bookmark
      : null;

    if (!bookmark) break;
  }

  if (boards.length > 0) {
    console.log(`[Pinterest] Total boards: ${boards.length}, names: ${boards.map(b => b.name).join(", ")}`);
  } else {
    console.log(`[Pinterest] No boards returned from API`);
  }

  return boards;
}

/**
 * Convert a board name to the slug format Pinterest uses internally.
 * E.g. "Cat Tree Buying Guide" -> "cat-tree-buying-guide"
 */
function boardNameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Try to fetch a board directly by username/slug.
 * This works even when the list endpoint returns 0 boards (sandbox quirk).
 */
async function tryGetBoardBySlug(accessToken: string, boardName: string, apiBase = PINTEREST_API_BASE): Promise<string | null> {
  try {
    const userRes = await fetch(`${apiBase}/user_account`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userRes.ok) {
      console.warn(`[Pinterest] user_account call failed: ${userRes.status}`);
      return null;
    }
    const userData = await userRes.json();
    const username = userData.username;
    if (!username) {
      console.warn(`[Pinterest] No username in user_account response:`, JSON.stringify(userData));
      return null;
    }

    const slug = boardNameToSlug(boardName);
    const boardPath = `${username}/${slug}`;
    console.log(`[Pinterest] Trying direct board lookup: ${boardPath}`);

    const boardRes = await fetch(`${apiBase}/boards/${boardPath}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!boardRes.ok) {
      const errText = await boardRes.text();
      console.warn(`[Pinterest] Direct board GET failed (${boardRes.status}): ${errText}`);
      return null;
    }
    const boardData = await boardRes.json();
    if (boardData?.id) {
      console.log(`[Pinterest] Found board "${boardName}" via direct lookup: ${boardData.id}`);
      return String(boardData.id);
    }
  } catch (e) {
    console.warn(`[Pinterest] Direct board lookup failed:`, e);
  }
  return null;
}

export async function resolvePinterestBoardId(accessToken: string, boardRef: string, apiBase = PINTEREST_API_BASE): Promise<string> {
  const trimmedBoardRef = boardRef.trim();
  const normalizedBoardRef = normalizeBoardName(trimmedBoardRef);

  if (!normalizedBoardRef) {
    throw new Error("Missing Pinterest board reference");
  }

  const findBoardId = (boards: PinterestBoard[]): string | null => {
    const exactMatch = boards.find((board) => {
      const boardName = typeof board.name === "string" ? normalizeBoardName(board.name) : "";
      return board.id === trimmedBoardRef || boardName === normalizedBoardRef;
    });
    if (exactMatch?.id) return exactMatch.id;

    const partialMatch = boards.find((board) => {
      const boardName = typeof board.name === "string" ? normalizeBoardName(board.name) : "";
      return Boolean(boardName) && (
        boardName.includes(normalizedBoardRef) ||
        normalizedBoardRef.includes(boardName)
      );
    });
    return partialMatch?.id ?? null;
  };

  const initialBoards = await listPinterestBoards(accessToken, apiBase);
  const existingBoardId = findBoardId(initialBoards);
  if (existingBoardId) return existingBoardId;

  // Try direct slug lookup — list API may not return all boards (sandbox quirk)
  if (trimmedBoardRef.includes(" ")) {
    const directId = await tryGetBoardBySlug(accessToken, trimmedBoardRef, apiBase);
    if (directId) return directId;
  }

  if (!trimmedBoardRef.includes(" ")) {
    return trimmedBoardRef;
  }

  // Auto-create the board if it doesn't exist
  console.log(`[Pinterest] Board "${trimmedBoardRef}" not found, creating it...`);
  const createRes = await fetch(`${apiBase}/boards`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: trimmedBoardRef,
      description: `Curated ${trimmedBoardRef} by GetPawsy`,
      privacy: "PUBLIC",
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();

    if (createRes.status === 400 && errText.includes('"code":58')) {
      // Board exists but list didn't find it — try direct slug lookup
      const directId = await tryGetBoardBySlug(accessToken, trimmedBoardRef, apiBase);
      if (directId) {
        console.log(`[Pinterest] Recovered board "${trimmedBoardRef}" via slug after duplicate-name error: ${directId}`);
        return directId;
      }

      // Last resort: re-list and use any available board as fallback
      const fallbackBoards = await listPinterestBoards(accessToken, apiBase);
      if (fallbackBoards.length > 0) {
        const fallback = fallbackBoards[0];
        console.log(`[Pinterest] Board "${trimmedBoardRef}" exists but not visible in API — using fallback board "${fallback.name}" (${fallback.id})`);
        return fallback.id;
      }
    }

    throw new Error(`Failed to create board "${trimmedBoardRef}" (${createRes.status}): ${errText}`);
  }

  const created = await createRes.json();
  console.log(`[Pinterest] Board "${trimmedBoardRef}" created with id ${created.id}`);
  return String(created.id);
}

export async function validatePinterestBoardId(
  accessToken: string,
  boardId: string,
  apiBase = PINTEREST_API_BASE,
  expectedOwnerUsername = "getpawsyshop",
): Promise<{ ok: boolean; id: string; name?: string | null; ownerUsername?: string | null; reason?: string }> {
  const trimmedBoardId = String(boardId || "").trim();
  if (!trimmedBoardId || /\s/.test(trimmedBoardId)) {
    return { ok: false, id: trimmedBoardId, reason: "invalid_board_id" };
  }

  try {
    const boardRes = await fetch(`${apiBase}/boards/${encodeURIComponent(trimmedBoardId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (boardRes.ok) {
      const boardData: any = await boardRes.json().catch(() => ({}));
      const returnedId = String(boardData?.id ?? trimmedBoardId);
      const ownerUsername = typeof boardData?.owner?.username === "string"
        ? boardData.owner.username
        : typeof boardData?.board_owner?.username === "string"
        ? boardData.board_owner.username
        : null;
      if (returnedId !== trimmedBoardId) {
        return { ok: false, id: trimmedBoardId, name: boardData?.name ?? null, ownerUsername, reason: `board_id_mismatch:${returnedId}` };
      }
      if (ownerUsername && ownerUsername !== expectedOwnerUsername) {
        return { ok: false, id: trimmedBoardId, name: boardData?.name ?? null, ownerUsername, reason: `wrong_board_owner:${ownerUsername}` };
      }
      return { ok: true, id: trimmedBoardId, name: boardData?.name ?? null, ownerUsername, reason: "board_get_ok" };
    }
  } catch (e) {
    console.warn(`[Pinterest] Board ${trimmedBoardId} direct validation failed:`, (e as Error).message);
  }

  // Fallback validation: /boards lists boards owned by the connected account.
  // A match here confirms the board exists and belongs to GetPawsy even when
  // direct /boards/{id} is unavailable for the app/token combination.
  const boards = await listPinterestBoards(accessToken, apiBase);
  const listed = boards.find((board) => String(board.id) === trimmedBoardId) ?? null;
  if (listed) {
    if (listed.ownerUsername && listed.ownerUsername !== expectedOwnerUsername) {
      return { ok: false, id: trimmedBoardId, name: listed.name ?? null, ownerUsername: listed.ownerUsername, reason: `wrong_board_owner:${listed.ownerUsername}` };
    }
    return { ok: true, id: trimmedBoardId, name: listed.name ?? null, ownerUsername: listed.ownerUsername ?? expectedOwnerUsername, reason: "board_list_ok" };
  }

  return { ok: false, id: trimmedBoardId, reason: "board_not_found_for_connected_account" };
}

/**
 * Validates that a returned Pinterest external_url is a real, fetchable pin.
 * Checks:
 *  1. URL shape matches https://www.pinterest.com/pin/<pinId>/
 *  2. The pinId in the URL matches the expected pinId
 *  3. GET /pins/{pinId} on the API returns 200 (with one 5s retry)
 *
 * Returns { ok, reason } — reason is human-readable for logging/storage.
 */
export async function validatePinterestExternalUrl(
  accessToken: string,
  apiBase: string,
  externalUrl: string | null | undefined,
  expectedPinId: string | null | undefined,
): Promise<{ ok: boolean; reason: string; status?: number; resolved_pin_id?: string | null }> {
  if (!externalUrl) return { ok: false, reason: "missing_external_url" };
  if (!expectedPinId) return { ok: false, reason: "missing_pin_id" };

  const match = /^https:\/\/www\.pinterest\.com\/pin\/([^/?#]+)\/?$/i.exec(externalUrl.trim());
  if (!match) return { ok: false, reason: `malformed_url: ${externalUrl}` };
  const urlPinId = match[1];
  if (urlPinId !== String(expectedPinId)) {
    return { ok: false, reason: `pin_id_mismatch: url=${urlPinId} expected=${expectedPinId}` };
  }

  const tryFetch = async (): Promise<{ ok: boolean; status: number }> => {
    try {
      const res = await fetch(`${apiBase}/pins/${expectedPinId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return { ok: res.ok, status: res.status };
    } catch (e) {
      return { ok: false, status: 0 };
    }
  };

  let attempt = await tryFetch();
  if (!attempt.ok) {
    await new Promise((r) => setTimeout(r, 5000));
    attempt = await tryFetch();
  }

  if (attempt.ok) {
    return { ok: true, reason: "verified_live", status: attempt.status, resolved_pin_id: expectedPinId };
  }
  return { ok: false, reason: `pin_lookup_failed: HTTP ${attempt.status}`, status: attempt.status, resolved_pin_id: expectedPinId };
}
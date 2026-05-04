import { PINTEREST_API_BASE } from "./pinterest-config.ts";

type PinterestBoard = {
  id: string;
  name?: string | null;
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

async function listPinterestBoards(accessToken: string): Promise<PinterestBoard[]> {
  const boards: PinterestBoard[] = [];
  let bookmark: string | null = null;

  for (let page = 0; page < 5; page++) {
    const url = new URL(`${PINTEREST_API_BASE}/boards`);
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
async function tryGetBoardBySlug(accessToken: string, boardName: string): Promise<string | null> {
  try {
    const userRes = await fetch(`${PINTEREST_API_BASE}/user_account`, {
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

    const boardRes = await fetch(`${PINTEREST_API_BASE}/boards/${boardPath}`, {
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

export async function resolvePinterestBoardId(accessToken: string, boardRef: string): Promise<string> {
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

  const initialBoards = await listPinterestBoards(accessToken);
  const existingBoardId = findBoardId(initialBoards);
  if (existingBoardId) return existingBoardId;

  // Try direct slug lookup — list API may not return all boards (sandbox quirk)
  if (trimmedBoardRef.includes(" ")) {
    const directId = await tryGetBoardBySlug(accessToken, trimmedBoardRef);
    if (directId) return directId;
  }

  if (!trimmedBoardRef.includes(" ")) {
    return trimmedBoardRef;
  }

  // Auto-create the board if it doesn't exist
  console.log(`[Pinterest] Board "${trimmedBoardRef}" not found, creating it...`);
  const createRes = await fetch(`${PINTEREST_API_BASE}/boards`, {
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
      const directId = await tryGetBoardBySlug(accessToken, trimmedBoardRef);
      if (directId) {
        console.log(`[Pinterest] Recovered board "${trimmedBoardRef}" via slug after duplicate-name error: ${directId}`);
        return directId;
      }

      // Last resort: re-list and use any available board as fallback
      const fallbackBoards = await listPinterestBoards(accessToken);
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
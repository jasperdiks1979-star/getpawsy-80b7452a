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
    const url = new URL(`${PINTEREST_API_BASE}/v5/boards`);
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
      throw new Error(`Could not load Pinterest boards (${response.status}): ${errorText}`);
    }

    const payload = await response.json();
    const items = Array.isArray(payload?.items) ? payload.items : [];

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

  return boards;
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

  if (!trimmedBoardRef.includes(" ")) {
    return trimmedBoardRef;
  }

  // Auto-create the board if it doesn't exist
  console.log(`[Pinterest] Board "${trimmedBoardRef}" not found, creating it...`);
  const createRes = await fetch(`${PINTEREST_API_BASE}/v5/boards`, {
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
      const refreshedBoards = await listPinterestBoards(accessToken);
      const recoveredBoardId = findBoardId(refreshedBoards);
      if (recoveredBoardId) {
        console.log(`[Pinterest] Reused existing board "${trimmedBoardRef}" with id ${recoveredBoardId} after duplicate-name response`);
        return recoveredBoardId;
      }
    }

    throw new Error(`Failed to create board "${trimmedBoardRef}" (${createRes.status}): ${errText}`);
  }

  const created = await createRes.json();
  console.log(`[Pinterest] Board "${trimmedBoardRef}" created with id ${created.id}`);
  return String(created.id);
}
import { PINTEREST_API_BASE } from "./pinterest-config.ts";

type PinterestBoard = {
  id: string;
  name?: string | null;
};

async function listPinterestBoards(accessToken: string): Promise<PinterestBoard[]> {
  const boards: PinterestBoard[] = [];
  let bookmark: string | null = null;

  for (let page = 0; page < 5; page++) {
    const url = new URL(`${PINTEREST_API_BASE}/v5/boards`);
    url.searchParams.set("page_size", "250");
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
  const normalizedBoardRef = boardRef.trim().toLowerCase();

  if (!normalizedBoardRef) {
    throw new Error("Missing Pinterest board reference");
  }

  const boards = await listPinterestBoards(accessToken);

  const exactMatch = boards.find((board) => (
    board.id === boardRef ||
    board.name?.trim().toLowerCase() === normalizedBoardRef
  ));
  if (exactMatch?.id) return exactMatch.id;

  const partialMatch = boards.find((board) => {
    const boardName = board.name?.trim().toLowerCase();
    return Boolean(boardName) && (
      boardName?.includes(normalizedBoardRef) ||
      normalizedBoardRef.includes(boardName as string)
    );
  });
  if (partialMatch?.id) return partialMatch.id;

  if (!boardRef.includes(" ")) {
    return boardRef;
  }

  // Auto-create the board if it doesn't exist
  console.log(`[Pinterest] Board "${boardRef}" not found, creating it...`);
  const createRes = await fetch(`${PINTEREST_API_BASE}/v5/boards`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: boardRef,
      description: `Curated ${boardRef} by GetPawsy`,
      privacy: "PUBLIC",
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to create board "${boardRef}" (${createRes.status}): ${errText}`);
  }

  const created = await createRes.json();
  console.log(`[Pinterest] Board "${boardRef}" created with id ${created.id}`);
  return String(created.id);
}
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

  throw new Error(`Pinterest board \"${boardRef}\" was not found for the connected account`);
}
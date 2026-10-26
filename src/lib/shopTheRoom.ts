import { finderMatches, type FinderRow, type Need, type Pet } from './petFinder';

export interface RoomSpot { id: string; label: string; x: number; y: number; pets: Pet[]; need: Need }

/** Hotspots on the illustrative room photo (percent coordinates). */
export const ROOM_SPOTS: RoomSpot[] = [
  { id: 'climb', label: 'Cat trees & perches', x: 14, y: 52, pets: ['cat'], need: 'rest' },
  { id: 'bed', label: 'Dog beds', x: 80, y: 66, pets: ['dog'], need: 'rest' },
  { id: 'toys', label: 'Toys & play', x: 49, y: 81, pets: ['dog', 'cat'], need: 'play' },
  { id: 'bowls', label: 'Bowls & feeders', x: 90, y: 88, pets: ['cat', 'dog'], need: 'feed' },
];

/** Real eligible products for a spot; deduplicated, in-stock only. */
export function roomMatches(rows: FinderRow[], spot: RoomSpot, limit = 3): FinderRow[] {
  const seen = new Set<string>();
  const out: FinderRow[] = [];
  for (const pet of spot.pets) {
    for (const r of finderMatches(rows, pet, spot.need, 'any', limit * 2)) {
      if (r.price < 15 || seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
    }
  }
  return out.slice(0, limit);
}

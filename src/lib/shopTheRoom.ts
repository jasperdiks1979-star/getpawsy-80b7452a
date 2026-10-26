import type { FinderRow, Pet } from './petFinder';

export interface RoomSpot { id: string; label: string; x: number; y: number; pets: Pet[]; words: string[] }

/** Hotspots on the illustrative room photo (percent coordinates). */
export const ROOM_SPOTS: RoomSpot[] = [
  { id: 'climb', label: 'Cat trees & perches', x: 14, y: 52, pets: ['cat'], words: ['tree', 'condo', 'perch', 'tower', 'hammock'] },
  { id: 'bed', label: 'Dog beds', x: 80, y: 66, pets: ['dog'], words: ['bed'] },
  { id: 'toys', label: 'Toys & play', x: 49, y: 81, pets: ['dog', 'cat'], words: ['toy', 'ball', 'teaser', 'tunnel', 'chew'] },
  { id: 'bowls', label: 'Bowls & feeders', x: 90, y: 88, pets: ['cat', 'dog'], words: ['bowl', 'feeder', 'fountain'] },
];

/** Real eligible products for a spot: whole-word name match, species, in stock, ≥$15, deduped. */
export function roomMatches(rows: FinderRow[], spot: RoomSpot, limit = 3): FinderRow[] {
  const re = new RegExp(`\\b(${spot.words.join('|')})s?\\b`, 'i');
  const seen = new Set<string>();
  return rows
    .filter((r) => Number(r.stock) > 0 && r.image_url && r.slug && r.price >= 15)
    .filter((r) => spot.pets.some((p) => r.primary_species === p) || r.primary_species === 'both')
    .filter((r) => re.test(r.name))
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .slice(0, limit);
}

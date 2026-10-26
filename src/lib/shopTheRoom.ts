import type { FinderRow, Pet } from './petFinder';
import { cardLeadImage } from './cardLeadImage';

export interface RoomSpot { id: string; label: string; x: number; y: number; pets: Pet[]; words: string[]; exclude?: string[]; href: string }

/** Hotspots on the illustrative room photo (percent coordinates). */
export const ROOM_SPOTS: RoomSpot[] = [
  { id: 'climb', label: 'Cat trees & perches', x: 14, y: 52, pets: ['cat'], words: ['tree', 'condo', 'perch', 'tower', 'hammock'], href: '/collections/cat-trees-and-condos' },
  { id: 'bed', label: 'Dog beds', x: 80, y: 66, pets: ['dog'], words: ['bed'], href: '/collections/dog-beds' },
  { id: 'toys', label: 'Toys & play', x: 49, y: 81, pets: ['dog', 'cat'], words: ['toy', 'ball', 'teaser', 'tunnel', 'chew'], exclude: ['tree', 'condo', 'tower'], href: '/collections/cat-toys' },
  { id: 'bowls', label: 'Bowls & feeders', x: 90, y: 88, pets: ['cat', 'dog'], words: ['bowl', 'feeder', 'fountain'], href: '/collections/dogs' },
];

/** Real eligible products for a spot: whole-word name match, species, in stock, ≥$15, deduped. */
export function roomMatches(rows: FinderRow[], spot: RoomSpot, limit = 3): FinderRow[] {
  const re = new RegExp(`\\b(${spot.words.join('|')})s?\\b`, 'i');
  const seen = new Set<string>();
  return rows
    .filter((r) => Number(r.stock) > 0 && r.image_url && r.slug && r.price >= 15)
    .filter((r) => spot.pets.some((p) => r.primary_species === p) || r.primary_species === 'both')
    .filter((r) => re.test(r.name) && !(spot.exclude && new RegExp(`\\b(${spot.exclude.join('|')})s?\\b`, 'i').test(r.name)))
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .slice(0, limit)
    // Same-product card lead overrides (e.g. fleece bed lead is a bonus-toy promo).
    .map((r) => ({ ...r, image_url: cardLeadImage(r as FinderRow & { images?: string[] | null }) ?? r.image_url }));
}

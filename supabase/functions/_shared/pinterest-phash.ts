// ─────────────────────────────────────────────────────────────────────────────
// Perceptual hash (dHash) for Pinterest backdrop duplicate detection.
//
// Decodes a PNG/JPEG via ImageScript, downscales to 9x8 grayscale, then
// derives a 64-bit difference hash from horizontal pixel-pair comparisons.
// dHash is robust against minor color/exposure shifts and produces stable
// Hamming distances that map cleanly onto a "similarity" percentage:
//
//   similarity = 1 - hammingDistance / 64
//
// Two backdrops are considered duplicates when similarity > 0.70 (i.e.
// fewer than ~19 differing bits out of 64). The threshold is enforced by
// the caller (pinterest-ai-backdrop) on every freshly generated image.
// ─────────────────────────────────────────────────────────────────────────────

import { Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

/** Raise to reject more aggressively, lower to allow more variance. */
export const PHASH_DUPLICATE_SIMILARITY = 0.70;

/** Compute a 64-bit dHash from raw image bytes. Returns 16-char lowercase hex, or null on failure. */
export async function computePhashFromBytes(bytes: Uint8Array): Promise<string | null> {
  try {
    const img = await Image.decode(bytes);
    // dHash uses a 9x8 grayscale grid → 8 horizontal diffs per row × 8 rows = 64 bits.
    const small = img.resize(9, 8);
    const gray = new Uint8Array(9 * 8);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 9; x++) {
        const px = small.getPixelAt(x + 1, y + 1); // ImageScript is 1-indexed
        const r = (px >>> 24) & 0xff;
        const g = (px >>> 16) & 0xff;
        const b = (px >>> 8) & 0xff;
        // Luma (BT.601)
        gray[y * 9 + x] = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
      }
    }
    let bits = 0n;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const left = gray[y * 9 + x];
        const right = gray[y * 9 + x + 1];
        bits = (bits << 1n) | (left > right ? 1n : 0n);
      }
    }
    return bits.toString(16).padStart(16, "0");
  } catch (e) {
    console.warn("[pinterest-phash] decode failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function computePhashFromUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return await computePhashFromBytes(buf);
  } catch {
    return null;
  }
}

/** Hamming distance between two 16-char hex strings (64 bits). */
export function hammingHex64(a: string, b: string): number {
  if (!a || !b || a.length !== 16 || b.length !== 16) return 64;
  let dist = 0;
  for (let i = 0; i < 16; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

export function similarity(a: string, b: string): number {
  return 1 - hammingHex64(a, b) / 64;
}

/** Returns the highest similarity score (and its match) found vs a list of known hashes. */
export function maxSimilarity(candidate: string, known: Iterable<string>): { score: number; match: string | null } {
  let best = 0;
  let match: string | null = null;
  for (const k of known) {
    if (!k) continue;
    const s = similarity(candidate, k);
    if (s > best) {
      best = s;
      match = k;
    }
  }
  return { score: best, match };
}
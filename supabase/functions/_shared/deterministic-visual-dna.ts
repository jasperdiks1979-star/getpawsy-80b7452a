// Deterministic, zero-cost visual DNA.
//
// Computes objective image traits locally (no AI gateway calls) so that
// gcd_visual_dna rows — and therefore family / duplicate lookups — keep
// working while AI credits are unavailable. Semantic traits (story, emotion,
// breed, …) are intentionally left NULL and re-enriched later from the
// gcd_visual_dna_backlog when credits return.

import { Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";
import { computePhashFromBytes } from "./pinterest-phash.ts";

export interface DeterministicDna {
  phash: string | null;
  color_palette: string[];
  brightness: number | null;
  contrast: number | null;
  saturation: number | null;
  warmth: number | null;
  texture: string | null;
}

function hex(n: number) {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

export async function computeDeterministicDna(bytes: Uint8Array): Promise<DeterministicDna> {
  const phash = await computePhashFromBytes(bytes);
  const empty: DeterministicDna = {
    phash,
    color_palette: [],
    brightness: null,
    contrast: null,
    saturation: null,
    warmth: null,
    texture: null,
  };
  try {
    const img = await Image.decode(bytes);
    const w = 32, h = 32;
    const small = img.resize(w, h);

    const lumas: number[] = [];
    let rs = 0, gs = 0, bs = 0, satSum = 0;
    // 4x4 palette buckets (16 average swatches -> top 5 by frequency-ish spread)
    const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();

    for (let y = 1; y <= h; y++) {
      for (let x = 1; x <= w; x++) {
        const px = small.getPixelAt(x, y);
        const r = (px >>> 24) & 0xff, g = (px >>> 16) & 0xff, b = (px >>> 8) & 0xff;
        rs += r; gs += g; bs += b;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        satSum += mx === 0 ? 0 : (mx - mn) / mx;
        lumas.push(0.299 * r + 0.587 * g + 0.114 * b);
        const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
        const cur = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
        cur.r += r; cur.g += g; cur.b += b; cur.n++;
        buckets.set(key, cur);
      }
    }

    const n = w * h;
    const mean = lumas.reduce((a, v) => a + v, 0) / n;
    const variance = lumas.reduce((a, v) => a + (v - mean) ** 2, 0) / n;
    const std = Math.sqrt(variance);

    const palette = [...buckets.values()]
      .sort((a, b) => b.n - a.n)
      .slice(0, 5)
      .map((c) => `#${hex(c.r / c.n)}${hex(c.g / c.n)}${hex(c.b / c.n)}`);

    const avgR = rs / n, avgB = bs / n;
    // warmth: -1 (cool) .. 1 (warm)
    const warmth = (avgR - avgB) / 255;

    return {
      phash,
      color_palette: palette,
      brightness: Number((mean / 255).toFixed(4)),
      contrast: Number((std / 128).toFixed(4)),
      saturation: Number((satSum / n).toFixed(4)),
      warmth: Number(warmth.toFixed(4)),
      texture: std > 60 ? "high_detail" : std > 30 ? "moderate_detail" : "flat",
    };
  } catch {
    return empty;
  }
}

export async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

# Guide Image Standards — GetPawsy

> Single source of truth for all guide thumbnail imagery.

## Quick Reference

| Property            | Requirement                          |
|---------------------|--------------------------------------|
| **Format**          | WebP (AVIF acceptable if pipeline supports) |
| **Dimensions**      | 1400 × 900 px (landscape, ~14:9)     |
| **Max file size**   | 120 KB                               |
| **Color profile**   | sRGB                                 |
| **Compression**     | Lossy, quality 75–82                 |

## Visual Style

- **Lens simulation**: 50 mm equivalent, shallow depth-of-field
- **Lighting**: Warm natural light, no harsh flash
- **Setting**: Modern, minimalist residential interiors
- **Materials**: Realistic textures — wood grain, fabric weave, fur detail
- **Composition**: Center-weighted subject, negative space left/top for potential text overlay
- **Text**: No embedded text in the image
- **Avoid**: "AI plastic" look, unnatural reflections, distorted proportions, oversaturation

## Technical Implementation

### `<img>` tag attributes (CLS-safe)

```html
<img
  src="/guides/example.webp"
  alt="Descriptive alt text"
  width="1400"
  height="900"
  loading="lazy"
  decoding="async"
  class="aspect-[14/9] w-full object-cover"
/>
```

### Performance rules

- All guide card images use `loading="lazy"` (never hero priority)
- All images have explicit `width` and `height` OR CSS `aspect-ratio`
- No image exceeds 120 KB compressed

## Governance

### Config location

All image assignments live in:

```
src/config/guideImages.ts → GUIDE_IMAGE_CONFIG
```

### How to add a new guide image

1. Export optimized WebP to `/public/guides/<descriptive-name>.webp`
2. Verify: 1400×900, ≤120 KB, WebP format
3. Add entry to `GUIDE_IMAGE_CONFIG` in `src/config/guideImages.ts`
4. Provide unique `src` path and descriptive `alt` text
5. Run dev server — duplicate scanner will warn if path is reused

### Duplicate prevention

- **Dev-mode**: `guideImages.ts` scans all entries on load. If two slugs share the same `src`, a `console.warn` fires.
- **Fallback**: Missing slugs get `/guides/default-guide.webp` — never another guide's image.

### Fallback image

`/public/guides/default-guide.webp` — neutral premium background, no specific product imagery.

## Prompt Template (for AI image generation)

```
Photorealistic editorial photograph, [SUBJECT DESCRIPTION],
modern minimalist interior, warm natural window light,
50mm lens, f/2.8, shallow depth of field,
realistic textures and materials, no text,
center-weighted composition with negative space top-left,
16:10 landscape aspect ratio, ultra high resolution
```

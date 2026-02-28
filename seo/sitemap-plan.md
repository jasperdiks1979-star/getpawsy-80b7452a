# Sitemap Prioritization & Lastmod Strategy

## Current Architecture

| File | Contents | URLs |
|------|----------|------|
| `sitemap.xml` | Sitemap index | N/A |
| `sitemap-pages.xml` | Static pages + hub/silo pages | ~20 |
| `sitemap-products-1.xml` | All active non-duplicate products | ~568 |
| `sitemap-collections.xml` | Active SEO collections | ~94 |
| `sitemap-guides.xml` | Guides + clusters | ~19+ |
| `sitemap-blog.xml` | Published blog posts | ~323 |

## Changes Implemented

### 1. Hub & Silo Pages Added to sitemap-pages.xml

New entries with high priority:

- `/dog/` (0.90, daily)
- `/cat/` (0.90, daily)
- `/dog/training/` (0.85, weekly)
- `/dog/travel/` (0.85, weekly)
- `/cat/training/` (0.85, weekly)
- `/cat/travel/` (0.85, weekly)
- `/dog/best-dog-training-and-travel-gear-2026` (0.85, weekly)
- `/cat/best-cat-training-and-travel-gear-2026` (0.85, weekly)
- `/guides` (0.70, weekly)

### 2. Ordering Strategy

Hub pages and pillar pages are listed FIRST in `sitemap-pages.xml`, ahead of utility pages like /about, /contact. This signals priority to crawlers.

### 3. Lastmod Strategy

- `<lastmod>` updates automatically when:
  - Product `updated_at` changes (price, availability, description)
  - Blog `published_at` changes
  - Collection `updated_at` changes
- Delta tracking via `data/sitemap-history.json` prevents false lastmod inflation
- Static pages use build date as lastmod

### 4. Compliance

- Only canonical, indexable URLs included
- No query parameters in sitemap entries
- No trailing slashes (except homepage)
- All URLs use apex domain `https://getpawsy.pet`

### 5. Tier 2 Product Rule

- Tier C (noindex) products ARE included in sitemap with `follow` directive
- Per Google guidance: sitemap inclusion doesn't override noindex
- These pages pass link equity via `noindex, follow`

## Validation Checklist

- [x] sitemap.xml returns 200 with valid sitemapindex
- [x] All child sitemaps return 200 with valid urlset
- [x] No duplicate URLs across sitemaps
- [x] No query parameter URLs
- [x] robots.txt references sitemap.xml
- [x] Hub/silo pages included with high priority

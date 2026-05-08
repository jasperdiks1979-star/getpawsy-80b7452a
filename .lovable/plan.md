# US-Only Pinterest Audience Optimization

This is a large, multi-system request (SEO copy, scoring engine, board strategy, warm-up limits, analytics dashboard, homepage trust, geo signals). To ship it safely without breaking the Production-verified Pinterest pipeline we just stabilized, I propose a phased rollout in 3 PRs. Approve the plan and I'll execute Phase 1 immediately.

## Phase 1 — Backend foundations (ship first)

1. **US-First Pin SEO generator** (`supabase/functions/_shared/pinterest-copy.ts`)
   - US English/spelling enforcer, banned-phrase list (international wording).
   - Required intent keyword pools: apartment cats, indoor cats, pet parents, small apartments, NYC/CA/TX aesthetic.
   - USD pricing helper, "Free US Shipping / Ships across the USA / 3–7 business days" trust suffixes.
   - Apply in `pinterest-automation` enqueue + cron worker title/description rendering.

2. **Board priority + content-type filter**
   - New `pinterest_board_priority` column (1=top, 9=low) on `pinterest_boards`.
   - Seed: Best Cat Trees 2026, Cat Care Essentials, Smart Pet Gadgets, Indoor Cat Setup = priority 1; generic "Products" = 5.
   - Cron worker picks highest-priority eligible board per pin.
   - Content type tag on queue: `guide | comparison | lifestyle | product`. Only `product` type allowed when paired with a lifestyle image; pure white-background product pins are rejected.

3. **US Traffic Score + auto-publish threshold**
   - New table `pinterest_pin_score` (product_id, us_click_prob, save_prob, outbound_ctr, conv_intent, est_cpc, total). 
   - Scoring function combines historical Clarity/GA US%, AOV, category weight (cat trees > generic).
   - Cron worker only claims pins with `score >= threshold` (configurable in `pinterest_runtime_settings`, default 0.55).

4. **Warm-up limiter (next 14 days)**
   - Hard cap 3–5 pins/day, spaced ≥90 min apart, weighted to US prime time (already in memory).
   - Set in `pinterest_runtime_settings`: `daily_cap=4`, `min_gap_minutes=90`, `warmup_until=2026-05-22`.

## Phase 2 — Image quality gate + analytics

5. **Image quality validator** (in `pinterest-qa.ts`)
   - Reject: white-background detection (sample corners, >92% near-white = reject), supplier-photo URL patterns (cj/aliexpress/dsers hosts), duplicate hash check.
   - Prefer: Cloudinary lifestyle wraps already in use; flag manual lifestyle uploads as priority.

6. **Traffic Quality Tracking**
   - Extend existing visitor logging (we already have country/state/device via Clarity + visitor map memory) with: bounce, time-on-site, add-to-cart rate, checkout rate, **pin source board** via UTM `utm_content=board_<id>`.
   - Update cron worker to inject `utm_content` board id in destination URL.

7. **Admin analytics tab** at `/admin/pinterest-automation` → new "US Audience" card:
   - Pinterest US traffic %, conversion %, top US states, outbound CTR, save rate, top boards, top products (last 7/30 days).
   - Reads from existing `visitor_events` / GA4 view.

## Phase 3 — Homepage trust + geo reinforcement

8. **Homepage trust strip** (`src/components/home/TrustBar.tsx` or existing equivalent)
   - "Free US Shipping · 30-Day Returns · Secure Checkout · Ships from New York, NY".
   - Only shown to non-EU (geo-aware consent memory already differentiates).

9. **Geo signal reinforcement in pin descriptions + product schema**
   - Append "GetPawsy LLC · New York, NY · United States" to pin descriptions.
   - Already have Organization schema; verify `addressCountry: US`, `addressRegion: NY`.

10. **International suppression**
    - Pinterest API doesn't accept geo-targeting on organic pins, so suppression is indirect: US-only language, USD, US trust signals, US-time scheduling, US-themed imagery — already covered by 1/4/5/9.
    - No explicit Singapore/India block (not possible organically); we just stop sending signals that surface there.

## Out of scope / clarifications

- "Pinterest US traffic %" requires GA4 or Clarity geo data — we'll read from what's available; if neither has 7 days of geo data yet, the card will say "collecting".
- Estimated CPC values are heuristic (category-based table), not from Pinterest Ads (you don't run paid).
- Mobile loading + CTA hierarchy on homepage are already optimized per existing memories — I'll only touch the trust strip unless you want a deeper pass.

## Technical files (Phase 1)

- `supabase/migrations/<new>.sql` — `pinterest_board_priority`, `pinterest_pin_score`, runtime settings columns.
- `supabase/functions/_shared/pinterest-copy.ts` — new.
- `supabase/functions/_shared/pinterest-qa.ts` — image gate (Phase 2).
- `supabase/functions/pinterest-automation/index.ts` — apply copy generator, scoring, warm-up cap.
- `supabase/functions/pinterest-cron-worker/index.ts` — board priority pick, threshold filter, gap enforcement, UTM board id.
- `src/pages/admin/PinterestAutomationPage.tsx` — board priority UI + US Audience card (Phase 2).

## Deliverable on completion

- Implementation summary per phase.
- Traffic optimization changes (copy + scoring + scheduling).
- Estimated US traffic uplift range (heuristic, +25–60% over 14 days based on language/imagery shift — no guarantee).
- Suppression logic doc (what we stopped sending, not what we blocked).
- 7-day Pinterest scaling plan (4 pins/day → reassess after Day 7 based on US%).

---

**Reply "go phase 1" to ship Phase 1 now**, or tell me which phases/items to drop or reorder.

---
name: Organic-First Intelligence Principle
description: Core architectural rule — organic performance is the primary AI truth; paid traffic is isolated to Layer 2 and never used as proof of product quality
type: constraint
---
Three independent layers across every Growth OS module:
- **Layer 1 — Organic Truth** (PRIMARY AI learning source): organic Pinterest/Google/Search, direct, referral, returning, SEO, organic social, organic email.
- **Layer 2 — Paid Performance** (ROAS/CPA only): Pinterest/Google/Meta/TikTok/Shopping Ads, affiliate, influencer. NEVER merged into Layer 1.
- **Layer 3 — Business Reality** (reporting only): blended organic + paid, financial dashboards only. Never the AI learning source.

Hard rules:
- AI scorers (Product Score, Creative Score, Pinterest Brain, AI CEO, Growth Orchestrator, Content Brain, Recommendation Engine, Execution Center) MUST NOT consume `paid_visitors`, `paid_impressions`, `ad_spend`, `campaign_budget`, `paid_clicks`, `paid_sessions` as ranking features.
- Use `src/lib/organicFirst.ts` (`isPaidTraffic`, `classifyLayer`, `assertOrganicFirst`) and the shared `resolveCanonicalSource` to split rows.
- Audit endpoint: edge function `organic-first-audit` + admin page `/admin/organic-first` returns the three-layer split + per-engine compliance status.
- Execution Center ranking weight: Organic > Market > Paid (paid only after organic success is demonstrated).
- Sales Commander must surface Organic vs Paid vs Blended revenue/AOV/RPV separately.
- Every recommendation must declare its source: `organic_behaviour | paid_performance | market_demand | blended`.
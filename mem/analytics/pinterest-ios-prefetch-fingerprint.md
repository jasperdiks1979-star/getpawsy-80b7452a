---
name: Pinterest iOS prefetch fingerprint
description: Client-side bot classifier rule that labels Pinterest iOS in-app link-preview prefetcher traffic as pre_render
type: feature
---
`src/lib/botDetection.ts` flags sessions as `bot_reason='pinterest_ios_prefetch'` when `document.referrer` matches `pinterest.com` AND `screen.width=390 & screen.height=844` (score -70 → `is_bot=true`). `deriveClassification()` in `src/lib/lpFunnelMirror.ts` maps this to `classification='pre_render'`. V5 Pinterest CR dashboards already exclude `pre_render`, so Pinterest CR no longer collapses to 0% from prefetcher traffic. Discovered via Jun 8-9 audit (549 sessions, identical viewport, country NULL, dwell <2s, 0 web_vitals, 0 lp_funnel_events).
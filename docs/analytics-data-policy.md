# GetPawsy — Analytics Data Policy (US-Only Clean Data)

> All analytics, reporting, and impact modeling MUST use US-only, real-user data.
> This document defines the filtering rules applied at every layer.

---

## 1. Country Filter (Primary)

**Rule**: Include ONLY `Country = United States` in all reports, audiences, and exports.

### GA4 Implementation
1. **Reporting**: Always apply segment `Country = United States` to Explorations and standard reports.
2. **Audiences**: Create audience "US Customers" with condition `geo.country == "US"`.
3. **Exports / BigQuery**: Filter `WHERE geo.country = 'US'` on all exported datasets.

### Internal Analytics (visitor_activity table)
- The `country` field is populated via IP geolocation.
- The `is_internal` boolean is `true` for Netherlands traffic.
- All impact model queries filter: `country = 'United States' AND is_internal = false`.

---

## 2. Internal Traffic Filter

### GA4 Data Filter (Admin → Data Streams → Data Filters)
| Setting | Value |
|---------|-------|
| Filter name | Internal / NL Traffic |
| Filter type | Internal traffic |
| Condition | IP address matches known NL IPs + dev IPs |
| Status | **Active** (not Testing) |

### Client-Side Detection
Traffic is marked internal when:
- `country` matches `Netherlands`, `The Netherlands`, or `NL`
- hostname contains `localhost` or `lovableproject.com`
- query param `?test=true` is present

### Custom Dimension (recommended for dynamic IPs)
| Dimension | Value |
|-----------|-------|
| `traffic_type` | `internal` when any internal condition is true |

Exclude `traffic_type = internal` in all GA4 explorations.

---

## 3. Bot / Crawler Exclusion

### Client-Side (already implemented)
The `useVisitorTracking` hook checks user agent against 40+ bot patterns including:
- Googlebot, AdsBot, APIs-Google, MediaPartners-Google
- Lighthouse, PageSpeed, GTmetrix
- GPTBot, ClaudeBot, Anthropic
- All major search engine crawlers

Bot traffic is **not recorded** in `visitor_activity`.

### GA4
- GA4 automatically excludes known bot traffic.
- Verify in DebugView that bot sessions do not appear.
- Additional filter: exclude sessions where `device_category = bot` (if applicable).

---

## 4. Test Purchase Exclusion

### Rules
| Condition | Action |
|-----------|--------|
| `country ≠ United States` | Exclude from purchase metrics |
| `is_internal = true` | Exclude from purchase metrics |
| `order_value < $1` | Flag for review (possible test) |

### GA4 Event Filter
Create event modification rule:
- IF `geo.country ≠ US` → do NOT count as conversion
- IF custom dimension `traffic_type = internal` → do NOT count as conversion

### Client-Side Guard (implemented)
The `trackPurchase` function in `analytics.ts` checks geolocation before firing the GA4 `purchase` event. Non-US purchases are logged to `visitor_activity` for internal records but NOT sent to GA4 as conversions.

---

## 5. GA4 Purchase Event Guard

A country-level guard prevents non-US purchase events from reaching GA4:

```
Before sending GA4 purchase event:
  1. Check cached geolocation country
  2. If country !== "United States" → skip GA4 purchase event
  3. Log to console: "[Analytics] Purchase event blocked: non-US country"
  4. Internal visitor_activity record is still created (for audit trail)
```

This ensures:
- ✅ Real US customers are tracked normally
- ✅ No NL test purchases pollute GA4 conversion data
- ✅ Internal analytics still has full audit trail
- ❌ No real customers are blocked from purchasing

---

## 6. Impact Model Data Sources

The SEO + Conversion impact model (`scripts/impact-model.mjs`) uses these defaults:

| Metric | Source | Filter |
|--------|--------|--------|
| Sessions | GA4 / env var | US-only |
| Orders | GA4 / env var | US-only, non-internal |
| AOV | GA4 / env var | US-only |
| Impressions | GSC / env var | US-only |
| Clicks | GSC / env var | US-only |

Override via environment variables:
```bash
US_SESSIONS=300 US_ORDERS=5 AOV=42 node scripts/impact-model.mjs
```

---

## 7. Clean Data Start Date

**Date**: _______________ (fill in after deploying these filters)

All reporting comparisons should use this date as the baseline for "clean" data.
Data before this date may contain NL/test traffic and should be noted in any analysis.

---

## 8. Verification Checklist

- [ ] GA4 internal traffic filter set to **Active**
- [ ] GA4 audience "US Customers" created
- [ ] GA4 DebugView confirms no bot sessions
- [ ] `visitor_activity` queries use `WHERE country = 'United States' AND is_internal = false`
- [ ] Impact model outputs "US-ONLY CLEAN DATA MODEL" header
- [ ] Test purchase from NL does NOT appear in GA4 conversions
- [ ] Test purchase from NL DOES appear in `visitor_activity` with `is_internal = true`
- [ ] Clean data start date recorded above

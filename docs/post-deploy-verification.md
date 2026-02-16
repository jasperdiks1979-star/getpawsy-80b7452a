# GetPawsy — Post-Deploy CWV Verification Checklist

> Run after every production deploy that touches performance-critical code.

## 1. Immediate Checks (Same Day)

### 1.1 Deployment Confirmation
- [ ] Confirm deployed commit hash matches expected release
- [ ] Verify build completed without errors

### 1.2 Production URL Smoke Tests (Hard Navigation)
Test each URL in an **incognito window** (no SW cache):

| URL | Expected | Pass/Fail |
|-----|----------|-----------|
| `https://getpawsy.pet/` | Home renders, hero visible < 2s | |
| `https://getpawsy.pet/products?category=small-pets` | Grid paints < 1.5s, no layout shift | |
| `https://getpawsy.pet/products?category=cat-enrichment` | Grid paints < 1.5s, category filter active | |

### 1.3 Redirect Behavior
| Check | Expected | Pass/Fail |
|-------|----------|-----------|
| Canonical tag on all pages | `https://getpawsy.pet/...` (apex, no www) | |
| `www.getpawsy.pet` → apex | 302 redirect (platform-level; mitigated via canonicals + sitemap) | |
| HTTP → HTTPS | Redirect active | |
| Internal links | All point to apex domain | |

---

## 2. Core Web Vitals Validation

### 2.1 Chrome DevTools (Mobile Throttling: Mid-tier Mobile + Fast 3G)

Open DevTools → Performance → Record page load for `/products?category=small-pets`:

| Metric | Target | Actual | Pass/Fail |
|--------|--------|--------|-----------|
| `componentMountedAt` | < 350ms | | |
| `productsFetchInitiatedAt` | < 300ms | | |
| `gridFirstMeaningfulPaintAt` | < 1500ms | | |
| LCP (Lighthouse) | < 2500ms | | |
| CLS | < 0.1 | | |
| INP | < 200ms | | |

### 2.2 In-App CWV Debug Overlay
Append `?debugVitals=1` to any URL:

| Field | Populated? | Pass/Fail |
|-------|------------|-----------|
| `dataSource` | Shows `cache` / `idb-cache` / `remote` / `category-fast` | |
| `fetchGateReason` | Shows `none` | |
| `firstImageRequestedAt` | Numeric ms value | |
| `firstImageLoadedAt` | Numeric ms value | |
| `firstImageDecodedAt` | Numeric ms value | |
| `fontsReadyAt` | Numeric ms value | |

### 2.3 iOS Safari Note
- LCP "not observed" on SPA soft navigations is **expected** behavior
- Rely on hard navigations + Lighthouse + field data for LCP validation
- `pseudoLcpMs` in the debug overlay serves as the fallback metric

---

## 3. Google Search Console Steps

### 3.1 URL Inspection
- [ ] Run **Live Test** on `https://getpawsy.pet/products?category=small-pets`
- [ ] Confirm "Page is indexable"
- [ ] Confirm rendered HTML contains product grid content
- [ ] Request indexing only if page content was materially changed

### 3.2 Monitoring Schedule

| Report | Where | When to Check |
|--------|-------|---------------|
| Core Web Vitals (Mobile) | GSC → Page Experience | Weekly for 4 weeks |
| Performance (clicks/impressions/CTR) | GSC → Performance | Weekly for 4 weeks |
| Page Experience status | GSC → Page Experience | After 28 days of field data |
| Crawl Stats | GSC → Settings → Crawl Stats | Weekly |

### 3.3 Expectations
- Field data lags lab data by **days to weeks**
- Look for **directional improvement** first (CWV "Poor" → "Needs Improvement" → "Good")
- Full CWV field data assessment requires **28-day checkpoint**
- Ranking effects may take 2–8 weeks to materialize

---

## 4. Merchant Center Sanity Checks

| Check | How | Pass/Fail |
|-------|-----|-----------|
| Product landing page fetchable | GMC → Diagnostics → test any product URL | |
| Canonical tag present on PDP | View source / `<link rel="canonical">` | |
| Structured data (Product schema) | Google Rich Results Test | |
| No new crawl anomalies | GMC → Diagnostics → Item issues | |
| Price consistency (PDP = feed) | Compare g:price in feed with PDP displayed price | |

---

## 5. 28-Day Checkpoint Template

| Metric | Before Deploy | 14 Days | 28 Days | Δ |
|--------|--------------|---------|---------|---|
| LCP P75 (mobile) | ~3.8s | | | |
| CLS P75 | | | | |
| CWV "Good" URL % | ~30% | | | |
| GSC Impressions (28d) | | | | |
| GSC Clicks (28d) | | | | |
| GSC Avg CTR | | | | |
| Sessions (GA4, 28d) | | | | |
| Conversion Rate | | | | |

---

## 6. Analytics Clean Data Verification

| Check | Expected | Pass/Fail |
|-------|----------|-----------|
| Re-run `node scripts/impact-model.mjs` | Outputs "US-ONLY CLEAN DATA MODEL" | |
| US sessions > NL sessions | US is primary traffic source | |
| No NL purchases in GA4 conversions | Purchase guard active | |
| NL test purchase appears in `visitor_activity` with `is_internal=true` | Internal audit trail works | |
| Conversion rate changed after filtering | Reflects US-only data | |
| Clean data start date recorded | In `docs/analytics-data-policy.md` | |
| Impact model sample size warning | Shows if US sessions < 50 | |

**Reference**: `docs/analytics-data-policy.md` for full filtering rules.

---

## Quick Commands

```bash
# Run Lighthouse mobile audit
npx lighthouse https://getpawsy.pet/products?category=small-pets \
  --preset=perf --emulated-form-factor=mobile \
  --output=html --output=json \
  --output-path=./audits/mobile-products \
  --chrome-flags="--headless --no-sandbox" \
  --only-categories=performance,seo,best-practices,accessibility

# Run impact model (US-only clean data)
node scripts/impact-model.mjs

# Full post-deploy verification
npm run postdeploy:verify
```

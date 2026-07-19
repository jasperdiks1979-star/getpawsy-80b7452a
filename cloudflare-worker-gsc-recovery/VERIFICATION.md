# VERIFICATION — Post-deploy proof gate

Run these checks **after** `deploy:production` and before submitting "Validate
Fix" in Google Search Console. Every assertion must pass.

## 1. Automated smoke test

```bash
bash test/smoke-test.sh
```

The script exits non-zero if any assertion fails. Sample expected output:

```
[ok]  GET  /c/all                                       → 410  x-gsc-recovery=410
[ok]  HEAD /product/1806928748680728576                 → 410  x-gsc-recovery=410
[ok]  GET  /product/e42efe24-988c-4581-b8e0-95efc2c5250f → 301 → /products/outdoor-dog-kennel-...
[ok]  GET  /dogs                                        → 200  (passthrough)
[ok]  GET  /products/automatic-cat-litter-box...        → 200  (passthrough)
[ok]  GET  /guides/complete-cat-care                    → 200  (passthrough)
[ok]  POST /api/anything                                → passthrough (worker only touches GET/HEAD)
7/7 checks passed
```

## 2. Header assertions

Every intercepted response MUST carry `x-gsc-recovery` for observability:

| Path                                          | Method | Status | `x-gsc-recovery` |
| --------------------------------------------- | ------ | ------ | ---------------- |
| `/c/all`                                      | GET    | 410    | `410`            |
| `/pages/about`                                | GET    | 410    | `410`            |
| `/product/1806928748680728576`                | GET    | 410    | `410`            |
| `/product/e42efe24-988c-4581-b8e0-95efc2c5250f` | GET  | 301    | `301`            |
| `/dogs`                                       | GET    | 200    | *(absent)*       |

## 3. Commerce regression check (manual)

On a real browser, in an incognito tab:

1. Open `https://getpawsy.pet/products/automatic-cat-litter-box-self-cleaning-app-control`
   → PDP renders, video block clean, ATC visible.
2. Add to cart → cart drawer opens, quantity = 1.
3. Proceed to checkout → Stripe checkout loads.

If any step fails, roll back per `ROLLBACK.md` immediately.

## 4. GSC re-crawl priming

```bash
jq -r '.exact_410[]' data/worker-rules.json | \
  xargs -I{} -P 8 curl -sI -o /dev/null -w "%{http_code} %{url_effective}\n" \
    "https://getpawsy.pet{}" | sort | uniq -c | sort -rn
```

Expected: **166** lines of `410`. Any `200`/`301`/`404` in the output means
the manifest is wrong for that path — investigate before re-priming.

## 5. Long-term monitoring (48h → 14d)

- Cloudflare → Workers Analytics → `getpawsy-gsc-recovery`: watch for
  unexpected error rate > 0.1 %.
- GSC → Coverage → Soft 404: cohort size should drop as URLs are re-crawled.
- GSC → Coverage → Not found (404): cohort should shift here, then be
  dropped from the index over ~30 days.
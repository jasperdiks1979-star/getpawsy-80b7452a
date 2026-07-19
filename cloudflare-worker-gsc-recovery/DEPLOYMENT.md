# DEPLOYMENT — Manual Cloudflare Worker rollout

> Est. wall time: **10 minutes**. Requires Cloudflare dashboard access to the
> `getpawsy.pet` zone and a machine with Node ≥ 18.

## 0. Prerequisites

| Requirement                                    | How to check                                                    |
| ---------------------------------------------- | --------------------------------------------------------------- |
| Cloudflare account with Workers Paid or Free   | dash.cloudflare.com → Workers & Pages                           |
| `getpawsy.pet` zone is on that account         | dash.cloudflare.com → Websites → getpawsy.pet                   |
| Orange-cloud proxy is enabled on apex + www    | DNS tab → the row for `@` and `www` shows **Proxied**           |
| You have your **Account ID** and **Zone ID**   | Overview tab of the zone, right sidebar                         |
| Node 18+ installed locally                     | `node --version`                                                |

## 1. Extract the package

Unzip the package somewhere on your machine:

```bash
unzip cloudflare-worker-gsc-recovery.zip
cd cloudflare-worker-gsc-recovery
```

## 2. Install wrangler locally

```bash
npm install
npx wrangler --version   # should print 3.x
```

## 3. Log in to Cloudflare

```bash
npx wrangler login
```

A browser tab opens. Approve access for the `getpawsy.pet` account.

## 4. Configure `wrangler.toml`

Open `wrangler.toml` and replace `REPLACE_WITH_CLOUDFLARE_ACCOUNT_ID` with
your real Account ID (32-hex chars). Save.

## 5. Deploy STAGING first (narrow route: `/c/*` only)

```bash
npm run deploy:staging
```

Expected output ends with something like:

```
Uploaded getpawsy-gsc-recovery-staging (x.xx sec)
Deployed getpawsy-gsc-recovery-staging triggers (y.yy sec)
  getpawsy.pet/c/*
```

## 6. Verify STAGING with two curls

```bash
# Should be 410 Gone (deprecated collection prefix)
curl -sI "https://getpawsy.pet/c/all" | head -n 5

# Should still be 200 OK (untouched — not in /c/* route)
curl -sI "https://getpawsy.pet/dogs" | head -n 5
```

If `/c/all` returns HTTP/2 410 and `/dogs` returns HTTP/2 200, staging works.

## 7. Run the full smoke test against staging

```bash
STAGING_ONLY=1 bash test/smoke-test.sh
```

All ✅ checks must pass before continuing.

## 8. Deploy PRODUCTION (full route: apex + www)

```bash
npm run deploy:production
```

Expected triggers:

```
getpawsy.pet/*
www.getpawsy.pet/*
```

## 9. Verify PRODUCTION

```bash
bash test/smoke-test.sh
```

Every assertion in `test/expected-responses.json` must match. If **any** check
fails, follow `ROLLBACK.md` immediately.

## 10. Prime the Cloudflare edge cache (optional, speeds up GSC re-crawl)

```bash
# From any machine — issues one HEAD per 410 URL so Cloudflare caches them.
jq -r '.exact_410[]' data/worker-rules.json | \
  xargs -I{} -P 8 curl -sI -o /dev/null -w "%{http_code} {}\n" "https://getpawsy.pet{}"
```

Every line should print `410 /path/...`.

## 11. Submit re-crawl in GSC

In Google Search Console → Coverage → the "Soft 404" report:

1. Click **Validate Fix**. GSC will re-crawl the cohort over ~48h.
2. Track progress under **Validation → Started**. Expect the cohort to move
   through "Passed" as URLs return 410/301 instead of a soft-200 shell.

## Post-deploy checklist

- [ ] `curl -I https://getpawsy.pet/product/1806928748680728576` → `410`
- [ ] `curl -I https://getpawsy.pet/product/e42efe24-988c-4581-b8e0-95efc2c5250f` → `301` to `/products/outdoor-dog-kennel-...`
- [ ] `curl -I https://getpawsy.pet/dogs` → `200`
- [ ] `curl -I https://getpawsy.pet/products/automatic-cat-litter-box-self-cleaning-app-control` → `200`
- [ ] Add to cart on a live PDP still works
- [ ] Stripe checkout still works
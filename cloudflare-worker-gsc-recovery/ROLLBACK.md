# ROLLBACK — Instantly disable the recovery worker

> Time to disable: **< 60 seconds**. Origin traffic resumes immediately.

## Option A — Disable via Cloudflare dashboard (fastest)

1. Open dash.cloudflare.com → **Workers & Pages** → `getpawsy-gsc-recovery`.
2. Click **Triggers** → **Routes**.
3. Delete both routes:
   - `getpawsy.pet/*`
   - `www.getpawsy.pet/*`
4. Save. Cloudflare stops invoking the worker within seconds. All requests
   go straight to origin (the SPA shell, exactly as before this deploy).

## Option B — Rollback via wrangler

```bash
cd cloudflare-worker-gsc-recovery
npx wrangler deployments list          # find the previous deployment id
npx wrangler rollback <deployment-id>  # instant revert
```

## Option C — Delete the worker entirely

```bash
npx wrangler delete getpawsy-gsc-recovery
npx wrangler delete getpawsy-gsc-recovery-staging
```

All routes are automatically removed with the worker.

## Verification after rollback

```bash
curl -sI "https://getpawsy.pet/c/all"
# Expected: HTTP/2 200  (SPA shell responds directly)
curl -sI "https://getpawsy.pet/product/1806928748680728576"
# Expected: HTTP/2 200  (SPA shell)
```

The absence of the `x-gsc-recovery` header on the response confirms the
worker is no longer in the path.

## When to roll back

- Any `preserve_200` URL suddenly returns 410 (means the manifest is wrong).
- Add-to-cart, checkout, or Stripe webhooks break.
- Cloudflare cost/analytics show unexpected worker CPU spikes.
- A new product is launched that shares a slug with a cohort entry (should be
  impossible — cohort slugs are locked to the 2026-07-19 export — but roll
  back if seen, then remove the offending path from `data/worker-rules.json`
  and redeploy).

## Post-rollback follow-up

Rolling back removes the 410/301 signal but does NOT undo the SPA shell fix
shipped separately (which emits `noindex` + `prerender-status-code=404` for
dead prefixes). Soft-404 recovery reverts to "shell-only mitigation" until
the worker is redeployed.
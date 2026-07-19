# iPhone (Safari) — Cloudflare Canary Worker Deployment

Deploy the `/c/*` canary Worker directly from Safari on iPhone. No terminal,
no Node.js, no Wrangler, no GitHub. Est. wall time: **5 minutes**.

> ⚠️ **Publishing the Worker code alone does NOT change your website.**
> The Worker only intercepts traffic once you attach the **Route**
> `getpawsy.pet/c/*` in step 8–11. Until that route exists, the code is inert.

---

## 1. Sign in

Open Safari → https://dash.cloudflare.com and sign in with the account that
owns the `getpawsy.pet` zone.

## 2. Open Workers & Pages

Tap the ☰ menu (top-left) → **Workers & Pages**.

## 3. Create a Worker

Tap **Create** → **Create Worker** (Hello World template is fine).

## 4. Name the Worker

Enter the name exactly:

```
getpawsy-gsc-recovery-canary
```

Tap **Deploy** to create the placeholder.

## 5. Edit code

On the Worker overview page, tap **Edit code** (top-right, opens the online
editor).

## 6. Replace the code

In the editor, select all existing code and delete it. Paste the ENTIRE
contents of `getpawsy-gsc-canary-worker.js` (see handoff message).

## 7. Save and deploy

Tap **Deploy** (top-right). Wait for "Deployment successful".

> At this point the code is live on `*.workers.dev` but is **not** attached
> to getpawsy.pet yet — the site is unaffected.

## 8. Open Settings → Domains & Routes

Back on the Worker overview: **Settings** tab → **Domains & Routes**.

## 9. Add a Route (NOT a Custom Domain)

Tap **Add** → choose **Route**.

> Do **not** choose "Custom Domain". A Custom Domain would move DNS; a Route
> only intercepts matching URLs.

## 10. Select the zone

Zone: **`getpawsy.pet`**

## 11. Enter the route pattern

```
getpawsy.pet/c/*
```

Tap **Add route**.

> ❌ Do NOT add `getpawsy.pet/*` — that would put every URL on the site
> behind the Worker. This canary is scoped to `/c/*` only.

---

## 12. Verify from iPhone Safari

Open a new Safari tab and load each URL. Expected result: a small
"410 Gone" page.

- https://getpawsy.pet/c/all
- https://getpawsy.pet/c/best-sellers
- https://getpawsy.pet/c/cats/litter
- https://getpawsy.pet/c/dogs/toys

Load these and confirm the normal site still appears (pass-through):

- https://getpawsy.pet/
- https://getpawsy.pet/dogs
- https://getpawsy.pet/products/automatic-cat-litter-box-self-cleaning-app-control
- https://getpawsy.pet/cart
- https://getpawsy.pet/c/a-random-future-page  ← must show normal site, not 410

For a real HTTP status check without a computer, use the free Safari extension
"HTTP Header Checker" or any iOS shortcut that runs `curl -I` — but Safari's
visible "410 Gone" page is sufficient proof for canary sign-off.

---

## 13. Immediate rollback

If anything looks wrong, remove the route — the Worker becomes inert instantly:

1. Cloudflare dashboard → **Workers & Pages** → `getpawsy-gsc-recovery-canary`.
2. **Settings** → **Domains & Routes**.
3. Tap the `getpawsy.pet/c/*` route → **Delete**.
4. Confirm.

Origin traffic resumes within seconds (edge cache TTL is 300s; you can also
use **Caching → Configuration → Purge Everything** to speed it up).

If you want to fully remove the Worker: same page → top-right menu →
**Delete Worker**.

---

## Confirmations

- ✅ No `getpawsy.pet/*` production-wide route is used.
- ✅ Route is scoped to `/c/*` only.
- ✅ Only the 15 exact cohort `/c/*` paths return 410; other `/c/*` paths
  pass through untouched.
- ✅ No secrets, no env vars, no build step.
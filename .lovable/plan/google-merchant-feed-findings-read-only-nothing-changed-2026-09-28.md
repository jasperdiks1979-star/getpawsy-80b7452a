# Google Merchant feed: findings (read-only, nothing changed)

## Verdict
The feed exists and is live. `https://getpawsy.pet/google-feed.xml` answered **200** (text/xml, 665,361 bytes, 265 products, lastBuildDate 2026-09-27 23:18 UTC) in a cache-busted check at about 08:05 UTC on 28 Sep. `/merchant-feed.xml` returns the same file. I found no 404 at the time of checking.

## Where it comes from
- **Generator:** `vite-plugin-sitemaps.ts` (plugin `generate-merchant-feed-and-sitemaps`).
  - At build start (~line 1126) it reads live products from the database, validates the feed and writes `public/google-feed.xml`, `merchant-feed.xml`, `google-shopping-feed.xml`, `api/feed-check` and `api/feed-source-preview`.
  - At closeBundle (~lines 1156–1217) it copies that feed into `dist/`, regenerates it if missing, and rejects stale artifacts.
- **So yes, the feed is built during every publish.** It is a snapshot taken at build time, not a live feed.
- **Headers:** `public/_headers` lines 32–52 set the content type for the three feed files and the two `/api/feed-*` files.
- **Other live feed addresses** (in `public/_redirects` lines 29–35, served by the `merchant-feed-full` backend function): `/feeds/google-merchant.tsv` and `.csv`, plus audit and summary files. `/pinterest-feed.xml` is a separate Pinterest feed.
- **Saved copy:** `public/google-feed.xml` in the source also has 265 items, so the feed can be recovered from the current source.

## Why it might have looked missing (unconfirmed, no 404 reproduced)
- A cached or stale response, or a check made during a publish.
- A different address was used (for example with `www`, `/feed.xml` or `/products.xml`, none of which are defined).
- A build where the database read failed. The plugin is designed to fall back or stop in that case; I didn't see this in the current output.
To confirm, I need the exact address and time of the 404, or Merchant Center's fetch error.

## Can this be done without a build/edit turn?
- **Right now, nothing needs doing:** the address is live.
- **For a permanent, always-current address without publishing:** point Merchant Center at the existing `/feeds/google-merchant.tsv`. It is served live by the backend function, with no build needed. Changing the Merchant Center setting is your action, outside Lovable.
- The XML file only refreshes when you publish.

## Smallest safe steps (only if a 404 comes back)
1. Read-only: re-check the exact failing address with cache-busting and compare it with `/merchant-feed.xml` and `/feeds/google-merchant.tsv`.
2. If only the XML is missing, republish once with no edits. The build regenerates the feed from the database; products, prices and stock stay untouched.
3. Optional hardening (needs approval): add a `/google-feed.xml` redirect to the `merchant-feed-full` function in `public/_redirects`, so the address is always live. This only works if the function can output XML. That hasn't been verified yet, so it needs a read-only check first.

Cleanup stays off. No products, prices, inventory or settings were touched.

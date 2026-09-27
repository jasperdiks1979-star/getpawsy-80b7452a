# Redirect / navigation security audit (read-only, no changes)

## Verdict: EXPLOITABLE_NOW (low severity: open redirect after sign-in, usable for phishing)
Confirmed by reading the code, not by running it in a browser.

## The one reachable flow: `src/pages/Auth.tsx`
- **Source:** the `?next=` value in the address bar. Anyone can craft it, e.g. `getpawsy.pet/auth?next=//evil.example`.
- **Validation (line 36):** `next && next.startsWith('/') ? next : '/'`. This check passes `//evil.example` and `/\evil.example`, because both start with `/`.
- **Sinks:** `navigate(nextPath, { replace: true })` at:
  - line 54: runs when a visitor who is already signed in opens the link;
  - line 87: after login;
  - line 126: after signup.
- **Why it leaves the site:** React Router's browser history, in `@remix-run/router` `dist/router.js` around lines 375–388, tries `pushState`/`replaceState` inside a try/catch. A protocol-relative URL (`//evil.example`) points to a different origin, so the browser rejects the history change. The catch block then calls `window.location.assign(url)`, which sends the visitor to the other site.
- **Payloads:**

| Payload | Reaches the sink? | Result |
|---|---|---|
| `https://evil.example` | No: blocked by `startsWith('/')` | Stays on the shop |
| `//evil.example` | Yes | Leaves the site (likely) |
| `/\evil.example` | Yes | Browsers treat `\` as `/`, so likely the same as above |
| `javascript:...` | No: blocked | Safe |
| Encoded forms, e.g. `%2F%2Fevil.example` | Yes: the address bar decodes them to `//evil.example` before the check | Same as `//` |

- **Prerequisites:**
  - The victim clicks a crafted GetPawsy link.
  - The victim is already signed in, or signs in on that page.
  - No stored data is exposed; the risk is phishing, since the visitor trusts the GetPawsy address they clicked.
- **Matching advisories (from the dependency scan):**
  - "same-origin redirect with path starting // causes open redirect" (fixed in react-router 6.30.4 / @remix-run/router 1.23.3);
  - "Open redirect via backslash in Link/useNavigate (CVE-2025-68470 bypass)";
  - "unexpected external redirect via untrusted paths" (react-router 6.30.2).
  - The app's own check on line 36 is what lets the input through. The router advisories describe the same weakness.

## Flows checked and not reachable by visitors
- `AdminRouteGuard.tsx:76-77` builds `next` from the current path, which is always same-origin. It only feeds the Auth flow above.
- `App.tsx:15-23` (`/lp/:slug`), `GuideSlugRedirect`, `CategorySlugRedirect`, `LegacyClusterRedirect`, `GuidePage.tsx:200`, `BlogPost.tsx:268`, `SeoCollection.tsx:484` and `App.tsx:287` all build a fixed internal prefix (`/products/`, `/guides/`, `/collections/`, `/blog/`) plus a slug. They cannot produce another site.
- `Checkout.tsx:881` sends the shopper to a payment link returned by our own checkout backend. That link is created by the app, not supplied by the visitor.
- `ProductCard.tsx:172` and `CartContext.tsx:355` build internal product addresses from product IDs and slugs.
- The cache-bust reloads (`App.tsx:187/228`, `build-version-guard.ts:199`, `boot-diagnostics.ts:268`) use the current page path plus fixed text.
- Admin pages (Pinterest, TikTok and merchant connection, test payments) redirect to sign-in addresses returned by our own backend, and only signed-in admins can reach them.
- No other sign-in return parameter was found (redirect, returnTo, continue, callback, url, destination).

## Smallest remediation (not done; needs approval)
1. Tighten the check in `Auth.tsx` line 36:
   - accept `next` only if it starts with `/`, is not followed by `/` or `\`, and still has the same origin after `new URL(next, location.origin)`;
   - otherwise fall back to `/`.
   - Add one small test covering `//evil.example`, `/\evil.example`, the encoded form and `https://…`.
2. Optional and separate: upgrade react-router-dom to a patched 6.30.x as defense in depth.

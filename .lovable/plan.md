## Doel
Maak GetPawsy's funnel-tracking productiegeschikt: stop fake cart-events, meet echte user-clicks, filter bots, US-only reporting, en een nieuwe `/admin/funnel-health` pagina met sanity-checks. Geen wijzigingen aan checkout-routes, product-URLs, SEO of Pinterest publishing pipeline.

Dit is een groot pakket — ik wil eerst akkoord op de scope/aanpak voordat ik begin met code, omdat het ~25-35 bestanden raakt en 2 nieuwe DB-tabellen toevoegt.

---

## Wat ik ga aanpassen

### A. Event audit + neutralisatie (raakt frontend tracking)
1. Audit alle plekken die `add_to_cart`, `view_cart`, `begin_checkout`, `view_item`, `purchase_intent` fire'en:
   - `src/lib/checkoutFunnel.ts`, `src/lib/lpFunnelMirror.ts`, `src/lib/analytics.ts`, `src/lib/tiktok-pixel.ts`, `src/hooks/useVisitorTracking.ts`, `src/contexts/CartContext.tsx` (indien aanwezig), sticky add-to-cart componenten, PDP, cart drawer/page.
2. Verwijder/disable fires die ontstaan uit: page mount, cart hydration uit localStorage, sticky-sync re-renders, preload hooks, product-card render, debug paths.
3. Centraliseer in één nieuwe helper `src/lib/funnelEvents.ts`:
   - `fireUserAddToCart({product_id, variant_id, qty, price, currency, source_component})` — vereist een echte click event handler caller.
   - `fireCheckoutClick(...)`, `fireCheckoutRedirect(...)`, `fireCheckoutError(...)`.
   - Dedupe-window 10s per `(session_id, product_id, variant_id)` via sessionStorage.
   - Genereer `idempotency_key = sha256(session_id|event|product|ts_bucket_10s)`.
   - Voeg `event_source` toe: `user_click | system_restore | bot_filtered | debug | crawler | unknown`.
   - Alle bestaande callers porten; alle niet-user-click callers krijgen `event_source != user_click` en worden uit dashboard-KPI's gefilterd (niet verwijderd uit DB → backwards compatible).

### B. Cart/checkout integriteit
- Eén cart-store als bron van waarheid bevestigen (audit bestaande context).
- Bij checkout-button: log `checkout_click` (cart_id, item_count, total_value, destination_url).
- Bij Stripe redirect: try/catch, bij falen `checkout_error` event + user-facing toast/alert ("Checkout couldn't open, please try again").
- Geen visuele redesign — alleen de error-toast is nieuw.

### C. Bot/crawler filter (nieuw `src/lib/botDetection.ts`)
- UA-regex voor crawlers (Googlebot, Bingbot, AhrefsBot, Pinterestbot, TikTokBot, facebookexternalhit, Twitterbot, headless, phantom, puppeteer, playwright, curl, wget).
- Missing-browser-signals (geen `navigator.languages`, geen `screen.width`, `webdriver=true`).
- Impossible-session-timing (≥3 events binnen <500ms).
- Resultaat: `{is_bot, bot_reason, traffic_quality_score 0-100}` cached per sessie. Geschreven naar elk event.

### D. Geo + US-only
- Edge function `geo-classify` (lichtgewicht): mapt Cloudflare/Vercel/Render `cf-ipcountry` header → `geo_quality: verified_us | non_us | unknown | bot_unknown`. `unknown` telt NOOIT als US.
- Sessions tabel uitbreiden met `country`, `geo_quality`.

### E. UTM/referrer
- Nieuwe helper `src/lib/attribution.ts`: classifier voor `tiktok|pinterest|google_ads|google_organic|meta|direct|referral`.
- `direct` alleen als referrer leeg én UTM leeg.
- First-touch + last-touch opgeslagen op sessie (sessionStorage + DB mirror).

### F. Nieuwe DB-objecten (additive, geen breaking changes)
Migratie:
```
ALTER TABLE sessions ADD COLUMN country, geo_quality, is_bot, bot_reason,
  traffic_quality_score, first_touch_source/medium/campaign,
  last_touch_source/medium/campaign (allemaal nullable);

ALTER TABLE lp_funnel_events ADD COLUMN event_source, user_action_id,
  idempotency_key UNIQUE, source_component, is_bot, bot_reason,
  geo_quality, deduped, raw_payload jsonb, validation_status;

CREATE TABLE checkout_events (
  id, session_id, cart_id, event_type
    CHECK (event_type IN ('checkout_click','checkout_redirect_attempt',
           'checkout_redirect_success','checkout_error')),
  item_count, total_value, currency, destination_url,
  error_reason, created_at
);
```
RLS: service_role insert; admin read via `has_role`. Geen public write.

### G. Admin pagina `/admin/funnel-health`
- Filters: today / 24h / 7d.
- KPI-kaarten: raw sessions, valid human sessions, verified-US, unknown-country, bot-filtered.
- Funnel: PDP views → true ATC clicks → cart opens → checkout clicks → redirects → errors → purchases. Per-stap %.
- Breakdown: bot/unknown geo, top landing pages, top product pages, source/medium/campaign.
- "Suspicious event sources" lijst (events met `event_source != user_click`).
- **Tracking sanity check** banner met regels:
  - ATC zonder click in 24h
  - `begin_checkout = 0` terwijl carts > 50
  - duplicate cart events (zelfde idempotency_key)
  - unknown geo > 20% (waarschuwing) / > 70% (`geo_tracking_unreliable`)
  - median session duration < 3s én cart_rate > 10% (`bot_or_event_bug_suspected`)
  - ATC rate > 20% maar checkout = 0 (`analytics_status = suspect`)
- Route lazy-loaded, admin-only via bestaande `has_role` guard.

### H. QA testknop "Run Funnel Tracking QA"
- Admin-only knop op funnel-health pagina.
- Sequentie in een hidden iframe of headless context: simulate `view_item`, simulate user `add_to_cart`-click, cart open, checkout click (zonder Stripe).
- Verifieert: exact 1 event per stap, geen events op mount/hydration.
- PASS/FAIL rapport in modal.

### I. Niet aangeraakt
- Pinterest render/publish pipeline (alleen lezen voor attribution waar nodig).
- Product/checkout/SEO routes en URLs.
- TikTok/Pinterest UTM-link formaten.
- Visuele design behalve admin dashboard + checkout error toast.

---

## Volgorde van uitvoering
1. DB-migratie (additive, nullable) — wacht op user approval.
2. `botDetection.ts` + `attribution.ts` + `funnelEvents.ts` helpers.
3. Audit + port van bestaande callers (add_to_cart, checkout) naar nieuwe helpers met `event_source`.
4. `geo-classify` edge function + session enrichment.
5. `checkout_events` schrijven in checkout-flow + error toast.
6. `/admin/funnel-health` pagina + route registratie + lazy-load.
7. QA-knop.
8. Smoke: build + één manuele klikflow via session replay.

---

## Wat ik aan jou rapporteer na uitvoering
- Gewijzigde bestanden, geneutraliseerde fake events, nieuwe "echte" events, bot-filter regels, dashboard-URL, iPhone test-checklist, en 3 metrics om over 24u te checken.

---

## Vraag voor jou
Akkoord met deze scope? Specifiek:
1. **Additive migratie** op `sessions` + `lp_funnel_events` + nieuwe `checkout_events` tabel — OK?
2. **Backwards-compat aanpak**: oude fake events blijven in DB maar krijgen `event_source != user_click` en worden uit dashboard gefilterd (geen DELETE). Of wil je ze hard verwijderen?
3. **Cart-store audit**: ik ga uit van de bestaande `CartContext`/store. Als er meerdere stores zijn, consolideer ik naar één — akkoord dat dit een refactor kan vereisen?

Zeg "go" + antwoorden op 1-3 en ik begin met de migratie.
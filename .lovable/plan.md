## Doel

Evolueer GetPawsy van webshop naar AI-native ecommerce OS, **strikt additief** bovenop de bestaande, beschermde checkout/Stripe/SEO infrastructuur. Dit is een groot pakket (10 fases, ~40-60 bestanden, 6-10 nieuwe DB-tabellen, 8-12 nieuwe edge functions). Ik wil eerst akkoord op scope en prioriteit — anders bouwen we 2 weken zonder reviewmoment.

---

## Wat NIET wordt aangeraakt (jouw protected list)

Stripe checkout, webhooks, payment/refund/session flows, redirects, success flows, SEO canonicals, productieroutering, werkende Supabase Stripe-functies. Alle nieuwe code zit onder `/admin/ai-*` routes (lazy-loaded, admin-only via bestaande `AdminRouteGuard`) en nieuwe edge functions met eigen namespace `ai-*`.

---

## Wat er al staat (relevant)

- `/admin/ai-revenue` (`AiRevenuePage.tsx`) bestaat al — winner/breakout/rising/falling classificatie, baselines, drilldown, CSV/JSON export, prior window control, persisted filters.
- `ai-revenue-insights` edge function bestaat.
- Funnel tracking helpers: `funnelEvents.ts`, `botDetection.ts` (per `.lovable/plan.md`), `usePdpFunnelTracking.ts`, `lp_funnel_events` tabel, `sessions` tabel met geo/bot kolommen.
- Admin guard, lazy-loading, persisted-state hook — allemaal al productie-klaar.

Veel van Phase 1, 2, 4, 5 is dus **deels al gebouwd**. Ik wil niet duplicaten maken — ik ga uitbreiden op de bestaande pagina/function, niet vervangen.

---

## Voorgestelde uitvoering in 4 reviewbare iteraties

Niet alles in één keer. Elke iteratie = werkende feature, mergeable, daarna pauze voor jouw review.

### Iteratie A — AI Revenue Operator uitbreiden (Phase 1 + 2)
**Bouwt voort op bestaande `/admin/ai-revenue`.** Geen nieuwe pagina.

Toevoegen aan `ai-revenue-insights`:
- Revenue Health KPI-blok: PDP→ATC, ATC→checkout, checkout→payment, bounce, dwell-avg, rage%, return-visitor%, mobile/desktop split, iOS/Android split, top exit/landing, bot-filtered%.
- Traffic Quality breakdown per bron (TikTok/Pinterest/Google/Direct/Organic/Unknown) met bounce/dwell/intent/device/geo/bot.
- Funnel friction score, PDP quality score, mobile conv. score, traffic quality score (afgeleide metrics, geen nieuwe events).

UI: nieuwe Tabs binnen `AiRevenuePage`: `Revenue Health | Products | Traffic | Insights`. Bestaande product-tab blijft.

Geen nieuwe DB-tabellen voor deze iteratie — alleen aggregaties over bestaande `lp_funnel_events` + `sessions`.

### Iteratie B — AI Insights Engine + persistente opslag (Phase 1 deel 2 + 7)

Nieuwe tabel `ai_revenue_insights` (additive):
```
id, scope (global|product|traffic_source|device), scope_ref,
insight_type, severity (info|warn|critical),
title, body, evidence jsonb, model, prompt_hash,
generated_at, dismissed_at, dismissed_by
```
RLS: admin-only read/write via `has_role`. Service_role full.

Edge function `ai-insights-generate`:
- Lovable AI Gateway (`google/gemini-3-flash-preview`), tool-calling voor structured output.
- Input: laatste 7d aggregaten van Iteratie A.
- Output: lijst insights, opslag in tabel, dedupe op `prompt_hash + 24h`.
- Cron-bare (knop in UI + handmatige trigger; geen auto-cron deze iteratie).

UI: Insights tab toont opgeslagen insights met dismiss/snooze. Retargeting Intelligence (Phase 7) = zelfde tabel met `scope='audience'`.

### Iteratie C — AI Creative Engine + AI SEO Engine (Phase 3 + 6)

Nieuwe route `/admin/ai-creatives`:
- Forms voor: TikTok hooks, UGC scripts, Pinterest concepts, ad headlines, CTA variants.
- Special preset: Automatic Cat Litter Box met de vier hooks als seed examples.
- Output naar `ai_creative_drafts` tabel (status: draft/approved, never auto-publish).
- Copy-to-clipboard, export JSON.

Nieuwe route `/admin/ai-seo`:
- Generators voor FAQ blocks, category copy, comparison pages, long-tail, internal-link suggestions, metadata, schema.
- Output naar `ai_seo_drafts` tabel (status: draft/approved, never auto-publish).
- Hookt aan bestaande SEO findings systeem (alleen read).

Beide gebruiken één gedeelde edge function `ai-content-generate` met `kind` parameter.

### Iteratie D — Product Winner Detection v2 + Traffic Quality Engine v2 (Phase 4 + 5)

Phase 4: Bouwt voort op bestaande winner/breakout/rising classificatie. Toevoegen:
- Winner Score, Trend Velocity, Conversion Momentum als kolommen in de bestaande summary response.
- Per winner: knop "Generate Pinterest draft" / "Generate TikTok hooks" / "Add to homepage queue" — deze tonen alleen draft modals (geen auto-publish).

Phase 5: Bestaande bot detection uitbreiden:
- Classificatie kolom op `sessions`: `quality_class enum('real_human','suspicious','crawler','likely_bot')` — additive nullable.
- Backfill via edge function `ai-traffic-classify` (batch over laatste 30d).
- Alle Iteratie A KPI's filteren standaard op `quality_class IN ('real_human', NULL)`.

---

## Wat ik bewust UIT scope houd

- **Auto-publish van wat dan ook** (jij zei "review required" overal — akkoord).
- **Phase 8** is een policy, geen code — ik documenteer het in `.lovable/plan.md` als guardrail-lijst, geen aparte iteratie.
- **Phase 9** is een non-functional constraint — geldt voor alles, geen aparte build. Alle nieuwe admin routes worden lazy-loaded (al standaard), passive listeners, geen blocking calls op niet-admin routes.
- **Phase 10 QA** doe ik aan het eind van elke iteratie met de bestaande Playwright suite + handmatige iPhone smoke; geen aparte phase.

---

## DB-objecten (additief, nullable, reversible)

```
CREATE TABLE ai_revenue_insights (Iteratie B)
CREATE TABLE ai_creative_drafts  (Iteratie C)
CREATE TABLE ai_seo_drafts       (Iteratie C)
ALTER TABLE sessions ADD COLUMN quality_class TEXT (Iteratie D)
```

Alle RLS admin-only via `has_role(auth.uid(),'admin')`. GRANTs voor `authenticated` (admins via app) + `service_role`. Geen anon access.

---

## Edge functions (nieuw, allemaal `verify_jwt = false` met in-code admin check via JWT)

```
ai-insights-generate      (Iteratie B)
ai-content-generate       (Iteratie C — kind: creative|seo)
ai-traffic-classify       (Iteratie D)
```

Bestaande `ai-revenue-insights` wordt uitgebreid, niet vervangen.

---

## Beveiliging (los van deze build, jij hebt openstaande findings)

Je security scan toont 17 openstaande findings (agm_actions public write, sessions open update, webauthn signature skip, GitHub PAT in localStorage, etc.). Die staan **los** van deze AI-build. Ik raad aan: eerst aparte security-sweep merge, dan AI-build erbovenop. Anders raken de RLS-patterns van nieuwe tabellen besmet met dezelfde fouten. Zeg het als je wilt dat ik die security findings eerst oppak — dat is een aparte plan.

---

## Vragen voor jou voor we starten

1. **Iteratie-volgorde akkoord?** A → B → C → D, met review-moment tussen elk. Of wil je een andere volgorde (bv. eerst Creative Engine omdat je TikTok hooks nu nodig hebt)?
2. **Security findings eerst?** Aanrader. Zo niet, dan bouw ik AI-build met correcte RLS, maar de openstaande findings blijven.
3. **AI model default:** `google/gemini-3-flash-preview` voor alles (snel, goedkoop, Lovable AI Gateway, geen API key nodig). Of wil je `gemini-2.5-pro` voor de Insights/SEO generators (duurder, betere nuance)?
4. **Lovable AI rate/credits:** alles gaat via Lovable AI Gateway. Bij hoge admin-gebruik kan 429/402 raken. Akkoord dat ik graceful errors toon (geen retry-storm)?

Antwoord met `go A` (alleen Iteratie A starten) of `go A-D` (alles in volgorde, ik pauzeer alsnog tussen elke iteratie voor jouw review) + antwoorden op 1-4. Dan begin ik met Iteratie A — migratie eerst, dan code.

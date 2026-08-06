# Ailurova storefront rebuild — rollback snapshot

Shop: ukz3v8-0n.myshopify.com · Product: gid://shopify/Product/15889810194764
Functions: `ailurova-storefront-rebuild` (snapshot/apply/publish-pages/verify), `ailurova-storefront-finalize` (audit/apply-nav/reorder-media/verify)

## Pass 1 — product, SEO, alt text, pages
| Object | Field | Before |
|---|---|---|
| Product 15889810194764 | descriptionHtml | "" (empty) |
| Product 15889810194764 | seo.title | null |
| Product 15889810194764 | seo.description | "Spacious XL enclosed cat litter box in stainless steel with a flip-top design for easier cleaning, better odor control, and more comfort for large cats." |
| MediaImage 74480400564556 / 597324 / 630092 / 662860 / 695628 / 728396 / 761164 / 793932 / 826700 | alt (all 9) | "XL stainless steel cat litter box with flip-top design for large cats – GetPawsy" |
| Page 732136145228 (about) | body / isPublished | short placeholder / false |
| Page 732136177996 (faq) | body / isPublished | short placeholder / false |

## Pass 2 — navigation and media order
| Object | Field | Before |
|---|---|---|
| Menu 340267303244 (main-menu) | title | "Hoofdmenu" |
| Menu 340267303244 | items | Home (FRONTPAGE /), **Assortiment** (CATALOG /collections/all), Contact (PAGE /pages/contact) |
| Menu 340267336012 (footer) | title | "Voettekstmenu" |
| Menu 340267336012 | items | Zoeken (SEARCH /search), Jouw privacybeslissingen (PAGE /pages/data-sharing-opt-out) |
| Product 15889810194764 | media order | 564556, 597324, 630092, 662860, 695628, 728396, 761164, 793932, 826700 |

After: main = Home / Shop (→ PDP) / About / FAQ / Contact; footer = Shop / About / FAQ / Contact / Your privacy choices;
first media = 74480400630092 (claim-free Light Gray lifestyle image).

Not mutated: price, compare-at, inventory, product status, media files, theme files, policies,
markets, shipping profiles, delivery profiles, taxes, payments, wallets, checkout logic,
Merchant Center, Google Ads, any other product.

## Outstanding supplier-verification list (NOT published)
assembled external dimensions · internal dimensions · entrance dimensions · step dimensions ·
net product weight excluding packaging · upper-enclosure material · filter-step material ·
included components · scoop included? · step removable? · assembly requirements ·
recommended cat size/weight · capacity · supplier cleaning instructions.

## MANUAL ACTION REQUIRED
1. Supplier gallery images 2–9 contain baked-in unverified claims (23.7"/17.5"/15.8"/11.1"/10.3"/7.9",
   step 15.4"×11.4"×3.5", "Suitable for cats under 15 lbs", "Non-Sticky Surface", "Anti-Scratch",
   "Leakproof", a scoop shown as included). Image editing/deletion was out of scope this pass.
   Replace or crop after supplier verification.
2. Checkout branding: checkout profile gid://shopify/CheckoutProfile/11437343052 is published;
   logo/colour branding requires the checkout branding API scope, which the current app token does
   not safely support — apply manually in Shopify admin. No workaround applied.

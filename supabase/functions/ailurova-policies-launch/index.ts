// Ailurova narrowly-scoped policy + contact information correction.
// Permitted mutations only: shopPolicyUpdate (4 policy types) and optional
// pageUpdate/pageCreate for the Contact page. No product/publication/inventory
// changes. Requires an explicit confirmation phrase to execute.
import { corsHeaders } from "../_shared/cors.ts";
import { shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";

const CONFIRM_PHRASE = "CONFIRM_AILUROVA_POLICIES_LAUNCH";
const PROTECTED_GID = "gid://shopify/Product/15889810194764";
const ONLINE_STORE_PUB = "gid://shopify/Publication/355057631564";
const PRIMARY_DOMAIN = "https://ailurova.com";
const SUPPORT_EMAIL = "support@ailurova.com";
const BANNED_BRAND_TOKENS = ["getpawsy", "skidzo", "pawsy.pet"];

const SHIPPING_BODY = `
<h2>Ailurova Shipping Policy</h2>
<p><em>Last updated: April 2026</em></p>
<h3>Where we ship</h3>
<p>Ailurova currently ships to customers in the United States only. Orders with a shipping address outside of the United States cannot be fulfilled at this time.</p>
<h3>Order processing</h3>
<p>All orders are subject to product availability and order verification. Once your order is placed you will receive a confirmation email. Orders may take additional time to process during peak periods, promotions, or when additional verification is required.</p>
<h3>Shipping options and charges</h3>
<p>Available shipping options and charges are displayed at checkout before you confirm your order. The delivery time shown at checkout is an estimate, not a guaranteed delivery date.</p>
<h3>Fulfillment partners</h3>
<p>Orders may be fulfilled and shipped by Ailurova or by trusted third-party logistics and fulfillment partners on behalf of Ailurova. The specific carrier used may vary by product and destination.</p>
<h3>Tracking</h3>
<p>When tracking information is available it will be sent to the email address on the order. Please allow a reasonable amount of time after dispatch for tracking events to appear with the carrier.</p>
<h3>Delivery address</h3>
<p>You are responsible for providing a complete, accurate and deliverable shipping address at checkout. Ailurova is not responsible for delays, non-delivery, or additional costs caused by incorrect, incomplete or undeliverable addresses.</p>
<h3>Delays outside our control</h3>
<p>Ailurova is not responsible for delivery delays caused by carriers, severe weather, natural events, customs or regulatory processes, or other circumstances outside of our reasonable control.</p>
<h3>Lost, damaged or incorrect deliveries</h3>
<p>If your order arrives damaged, is missing items, or contains an incorrect item, please contact <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> as soon as reasonably possible. Please include your order number and, where relevant, photos of the packaging and the item so we can review the issue.</p>
<h3>Questions</h3>
<p>Shipping questions can be sent to <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
`.trim();

const REFUND_BODY = `
<h2>Ailurova Refund &amp; Returns Policy</h2>
<p><em>Last updated: April 2026</em></p>
<h3>Return requests</h3>
<p>You may request a return of an eligible item within 30 days of the delivery date. To start a return please contact <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> with your order number and a short description of the reason for the return. Returns require prior written approval from Ailurova.</p>
<h3>Condition of returned items</h3>
<p>Returned items should generally be unused, in their original condition, and in their original packaging. Proof of purchase may be required. For hygiene, safety or heavy-use reasons some categories of item may not be eligible for return where this is legally permitted.</p>
<h3>Return address</h3>
<p>Please do not ship a return to any address before we have approved the return and provided you with the correct return instructions. Items returned without prior approval, or shipped to an incorrect address, may not be accepted or refunded.</p>
<h3>Damaged, defective or incorrect items</h3>
<p>If your item arrived damaged or defective, or you received an item different from what you ordered, please report it to <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> promptly. Please include your order number and photographs or other reasonable evidence of the issue so that we can review your case.</p>
<h3>Refunds</h3>
<p>Once an approved return has been received and inspected we will notify you of the outcome. If the return is approved, a refund will be issued to your original payment method. Payment providers may take additional time to make the refunded amount available to you.</p>
<p>Original shipping charges are generally non-refundable, except where required by law, or where the order was incorrect or defective.</p>
<h3>Order cancellations</h3>
<p>Once fulfillment of an order has begun, cancellations cannot be guaranteed. If you would like to attempt a cancellation, please contact <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> as soon as possible after placing the order.</p>
<h3>Your statutory rights</h3>
<p>Nothing in this policy is intended to limit any statutory consumer rights that apply to you under applicable US federal or state law.</p>
<h3>Questions</h3>
<p>Return questions can be sent to <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
`.trim();

const TERMS_BODY = `
<h2>Ailurova Terms of Service</h2>
<p><em>Last updated: April 2026</em></p>
<h3>1. Agreement</h3>
<p>These Terms of Service (the "Terms") govern your access to and use of the Ailurova website located at <a href="${PRIMARY_DOMAIN}">${PRIMARY_DOMAIN}</a> (the "Site") and any related services, features or content offered by Ailurova ("we", "us", "our"). By using the Site or placing an order you agree to these Terms.</p>
<h3>2. Eligibility and lawful use</h3>
<p>You must be legally capable of entering into a binding contract and use the Site only for lawful purposes. You agree not to use the Site in a way that could damage, disable, overburden or impair it, or interfere with any other party's use of the Site.</p>
<h3>3. Product information</h3>
<p>We take reasonable care to describe our products accurately. However product images, colors, packaging and specifications may vary, and we do not warrant that all information on the Site is complete, current or free from typographical errors. We reserve the right to correct any errors and to change product information without prior notice.</p>
<h3>4. Prices and availability</h3>
<p>Prices are shown in United States dollars unless otherwise indicated and may change without notice. Products are subject to availability. We reserve the right to limit quantities, refuse or cancel orders, and correct pricing or product errors, including after an order has been submitted.</p>
<h3>5. Orders and payment</h3>
<p>Submitting an order is an offer to purchase. Your order is accepted only when we confirm dispatch of the order. You authorize us and our payment processors to charge your selected payment method for the total order amount, including any applicable taxes and shipping charges shown at checkout. You are responsible for providing accurate billing, shipping and contact information.</p>
<h3>6. Order refusal or cancellation</h3>
<p>We may refuse or cancel any order for reasons including but not limited to product unavailability, suspected fraud, pricing errors, or where we reasonably believe the order is not in compliance with these Terms or applicable law.</p>
<h3>7. Intellectual property</h3>
<p>All content on the Site, including text, graphics, logos, product imagery, and software, is owned by Ailurova or its licensors and is protected by applicable intellectual property laws. You may not copy, reproduce, distribute, modify, or create derivative works from any portion of the Site without our prior written permission, except as permitted by law.</p>
<h3>8. Prohibited use</h3>
<p>You agree not to (a) use the Site for any unlawful or fraudulent purpose, (b) attempt to gain unauthorized access to any part of the Site or its systems, (c) interfere with the security or operation of the Site, or (d) use any automated system to access the Site in a manner that sends more request messages than a human user could reasonably produce.</p>
<h3>9. Third-party services and links</h3>
<p>The Site may contain links to third-party websites or services. We do not control and are not responsible for the content, policies or practices of any third-party website or service.</p>
<h3>10. Disclaimer and limitation of liability</h3>
<p>To the maximum extent permitted by applicable law, the Site and all products are provided on an "as is" and "as available" basis, without warranties of any kind, either express or implied. To the maximum extent permitted by applicable law, Ailurova shall not be liable for any indirect, incidental, special, consequential or punitive damages arising out of or relating to your use of the Site or any product purchased through the Site.</p>
<p>Nothing in these Terms excludes or limits any liability that cannot be excluded or limited under applicable law.</p>
<h3>11. Indemnification</h3>
<p>To the extent permitted by law, you agree to indemnify and hold harmless Ailurova and its affiliates from any claims, damages, liabilities and expenses arising out of your breach of these Terms or your misuse of the Site.</p>
<h3>12. Severability</h3>
<p>If any provision of these Terms is held to be unenforceable, the remaining provisions will remain in full force and effect.</p>
<h3>13. Governing law</h3>
<p>These Terms shall be governed by the laws of the United States and, where applicable, of the state in which our principal place of business is located, without regard to conflict-of-laws principles. Where a specific business jurisdiction is required by law, additional legal-entity information will be published on this page once available.</p>
<h3>14. Changes to these Terms</h3>
<p>We may update these Terms from time to time. The "Last updated" date at the top of this page reflects the most recent version. Continued use of the Site after changes take effect constitutes acceptance of the revised Terms.</p>
<h3>15. Contact</h3>
<p>Questions about these Terms can be sent to <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
`.trim();

const CONTACT_POLICY_BODY = `
<h2>Contact Information</h2>
<p><em>Last updated: April 2026</em></p>
<p><strong>Brand:</strong> Ailurova</p>
<p><strong>Website:</strong> <a href="${PRIMARY_DOMAIN}">${PRIMARY_DOMAIN}</a></p>
<p><strong>Customer support email:</strong> <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
<p>For questions about orders, shipping, returns, or general enquiries please email <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>. When contacting us about an existing order, please include your order number so that we can help you as quickly as possible.</p>
<p>We aim to respond as soon as reasonably possible. Response times may be longer during weekends, public holidays, and periods of high volume.</p>
`.trim();

const CONTACT_PAGE_BODY = `
<h2>Contact Ailurova</h2>
<p>Have a question about your order, our products, or a return? We are happy to help.</p>
<p><strong>Email:</strong> <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
<p>When contacting us about an existing order please include your order number so that we can review your case as quickly as possible. We aim to respond as soon as reasonably possible.</p>
<p>For details on shipping, returns and terms please see our <a href="/policies/shipping-policy">Shipping Policy</a>, <a href="/policies/refund-policy">Refund Policy</a>, and <a href="/policies/terms-of-service">Terms of Service</a>.</p>
`.trim();

const SHOP_POLICIES_QUERY = `
  query ShopPolicies {
    shop { name email contactEmail shopPolicies { id type title body url } }
  }
`;

const POLICY_UPDATE = `
  mutation ShopPolicyUpdate($shopPolicy: ShopPolicyInput!) {
    shopPolicyUpdate(shopPolicy: $shopPolicy) {
      shopPolicy { id type title url }
      userErrors { field message code }
    }
  }
`;

const PAGES_QUERY = `
  query Pages { pages(first: 50) { nodes { id title handle body isPublished onlineStoreUrl } } }
`;

const PAGE_UPDATE = `
  mutation PageUpdate($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page { id handle title isPublished }
      userErrors { field message code }
    }
  }
`;

const PAGE_CREATE = `
  mutation PageCreate($page: PageCreateInput!) {
    pageCreate(page: $page) {
      page { id handle title isPublished }
      userErrors { field message code }
    }
  }
`;

const PROTECTED_QUERY = `
  query Protected($id: ID!, $pubId: ID!) {
    product(id: $id) {
      id title status
      publishedOnPublication(publicationId: $pubId)
      variants(first: 5) { nodes { sku inventoryQuantity } }
    }
  }
`;

const PUB_COUNT_QUERY = `
  query PubCount($cursor: String, $pubId: ID!) {
    products(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { id title publishedOnPublication(publicationId: $pubId) }
    }
  }
`;

type PolicyKey = "SHIPPING_POLICY" | "REFUND_POLICY" | "TERMS_OF_SERVICE" | "CONTACT_INFORMATION";
const POLICY_PLAN: Array<{ type: PolicyKey; body: string }> = [
  { type: "SHIPPING_POLICY",     body: SHIPPING_BODY },
  { type: "REFUND_POLICY",       body: REFUND_BODY },
  { type: "TERMS_OF_SERVICE",    body: TERMS_BODY },
  { type: "CONTACT_INFORMATION", body: CONTACT_POLICY_BODY },
];

function scanBannedBrand(text: string): string[] {
  const l = (text ?? "").toLowerCase();
  return BANNED_BRAND_TOKENS.filter((t) => l.includes(t));
}

async function publicRead(path: string) {
  const url = `${PRIMARY_DOMAIN}${path}`;
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": "AilurovaPolicyVerify/1.0" } });
    const text = await r.text();
    return {
      url, status: r.status, final_url: r.url, length: text.length,
      has_support_email: text.toLowerCase().includes(SUPPORT_EMAIL.toLowerCase()),
      has_ailurova: /ailurova/i.test(text),
      banned_brand: scanBannedBrand(text),
      has_password_gate: /shopify-section-password|Enter store using password/i.test(text),
      title: (text.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "").trim(),
    };
  } catch (e) { return { url, error: String(e) }; }
}

async function readShopPolicies() {
  const r = await shopifyAdminFetch<any>(SHOP_POLICIES_QUERY, {});
  return { status: r.status, shop: r.data?.shop ?? null, errors: r.errors };
}
async function readPages() {
  const r = await shopifyAdminFetch<any>(PAGES_QUERY, {});
  return { status: r.status, pages: r.data?.pages?.nodes ?? [], errors: r.errors };
}
async function readProtected() {
  const r = await shopifyAdminFetch<any>(PROTECTED_QUERY, { id: PROTECTED_GID, pubId: ONLINE_STORE_PUB });
  return { status: r.status, product: r.data?.product ?? null };
}
async function countPublished() {
  let cursor: string | null = null;
  let total = 0;
  const published: Array<{ id: string; title: string }> = [];
  for (let p = 0; p < 200; p++) {
    const r = await shopifyAdminFetch<any>(PUB_COUNT_QUERY, { cursor, pubId: ONLINE_STORE_PUB });
    const nodes = r.data?.products?.nodes ?? [];
    for (const n of nodes) { total++; if (n.publishedOnPublication) published.push({ id: n.id, title: n.title }); }
    if (!r.data?.products?.pageInfo?.hasNextPage) break;
    cursor = r.data.products.pageInfo.endCursor;
  }
  return { total_products: total, published };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const startedAt = new Date().toISOString();
  try {
    let body: any = {};
    try { body = await req.json(); } catch { /* empty -> preflight */ }
    const mode = (body?.mode ?? "preflight") as "preflight" | "execute" | "verify";
    const confirm = body?.confirm as string | undefined;

    const ledger = {
      policy_mutations: 0, page_create_mutations: 0, page_update_mutations: 0,
      navigation_mutations: 0, product_mutations: 0, publication_mutations: 0,
      inventory_mutations: 0, price_mutations: 0, variant_mutations: 0,
      theme_mutations: 0, shipping_setting_mutations: 0, market_mutations: 0,
      domain_mutations: 0, cj_mutations: 0, other_mutations: 0,
    };

    const preflightPolicies = await readShopPolicies();
    const preflightPages = await readPages();
    const preflightProtected = await readProtected();
    const preflightPublic = {
      shipping:     await publicRead("/policies/shipping-policy"),
      refund:       await publicRead("/policies/refund-policy"),
      terms:        await publicRead("/policies/terms-of-service"),
      contact_info: await publicRead("/policies/contact-information"),
      contact_page: await publicRead("/pages/contact"),
    };

    const preflight = {
      shop: preflightPolicies.shop ? {
        name: preflightPolicies.shop.name, email: preflightPolicies.shop.email,
        contactEmail: preflightPolicies.shop.contactEmail,
      } : null,
      shop_policies: (preflightPolicies.shop?.shopPolicies ?? []).map((p: any) => ({
        type: p.type, title: p.title, url: p.url,
        body_length: (p.body ?? "").length,
        has_support_email: (p.body ?? "").toLowerCase().includes(SUPPORT_EMAIL.toLowerCase()),
        banned_brand: scanBannedBrand(p.body ?? "").concat(scanBannedBrand(p.title ?? "")),
      })),
      contact_page: (() => {
        const pg = preflightPages.pages.find((p: any) => p.handle === "contact");
        return pg ? {
          id: pg.id, title: pg.title, handle: pg.handle, isPublished: pg.isPublished,
          body_length: (pg.body ?? "").length,
          banned_brand: scanBannedBrand(pg.body ?? "").concat(scanBannedBrand(pg.title ?? "")),
          has_support_email: (pg.body ?? "").toLowerCase().includes(SUPPORT_EMAIL.toLowerCase()),
          onlineStoreUrl: pg.onlineStoreUrl,
        } : null;
      })(),
      public_routes: preflightPublic,
      protected: preflightProtected,
    };

    if (mode === "preflight") {
      return json({ verdict: "AILUROVA_POLICY_PREFLIGHT_ONLY", started_at: startedAt, mode, preflight, ledger });
    }

    if (mode !== "verify" && confirm !== CONFIRM_PHRASE) {
      return json({
        verdict: "AILUROVA_POLICY_PREFLIGHT_FAILED",
        reason: "missing_or_invalid_confirm_phrase",
        required_confirm_phrase: CONFIRM_PHRASE,
        preflight, ledger,
      }, 400);
    }

    const pStart = preflightProtected.product;
    const okProtected = !!pStart && pStart.status === "ACTIVE"
      && pStart.publishedOnPublication === true
      && (pStart.variants?.nodes?.[0]?.sku === "CJFT268927601AZ");
    if (!okProtected) {
      return json({ verdict: "AILUROVA_PROTECTED_STATE_CHANGED", reason: "protected_precheck_failed", preflight, ledger }, 409);
    }

    const mutations: any[] = [];

    if (mode === "execute") {
      for (const p of POLICY_PLAN) {
        const resp = await shopifyAdminFetch<any>(POLICY_UPDATE, { shopPolicy: { type: p.type, body: p.body } });
        const sp = resp.data?.shopPolicyUpdate?.shopPolicy;
        const ue = resp.data?.shopPolicyUpdate?.userErrors ?? [];
        ledger.policy_mutations++;
        mutations.push({ op: "shopPolicyUpdate", type: p.type, status: resp.status, ok: !!sp && ue.length === 0, url: sp?.url, userErrors: ue, errors: resp.errors });
      }

      const existingContact = preflightPages.pages.find((p: any) => p.handle === "contact");
      const needsUpdate = !existingContact
        || scanBannedBrand(existingContact.body ?? "").length > 0
        || !((existingContact.body ?? "").toLowerCase().includes(SUPPORT_EMAIL.toLowerCase()));

      if (needsUpdate && existingContact) {
        const resp = await shopifyAdminFetch<any>(PAGE_UPDATE, {
          id: existingContact.id,
          page: { title: "Contact", body: CONTACT_PAGE_BODY, isPublished: true },
        });
        const ue = resp.data?.pageUpdate?.userErrors ?? [];
        ledger.page_update_mutations++;
        mutations.push({ op: "pageUpdate", id: existingContact.id, status: resp.status, ok: ue.length === 0, userErrors: ue, errors: resp.errors });
      } else if (needsUpdate && !existingContact) {
        const resp = await shopifyAdminFetch<any>(PAGE_CREATE, {
          page: { title: "Contact", handle: "contact", body: CONTACT_PAGE_BODY, isPublished: true },
        });
        const ue = resp.data?.pageCreate?.userErrors ?? [];
        ledger.page_create_mutations++;
        mutations.push({ op: "pageCreate", handle: "contact", status: resp.status, ok: ue.length === 0, userErrors: ue, errors: resp.errors });
      } else {
        mutations.push({ op: "pageUpdate", skipped: true, reason: "contact_page_already_ailurova_branded_with_support_email" });
      }

      await new Promise((r) => setTimeout(r, 4000));
    }

    const finalPolicies = await readShopPolicies();
    const finalPages = await readPages();
    const publicVerify = {
      shipping:     await publicRead("/policies/shipping-policy"),
      refund:       await publicRead("/policies/refund-policy"),
      terms:        await publicRead("/policies/terms-of-service"),
      contact_info: await publicRead("/policies/contact-information"),
      contact_page: await publicRead("/pages/contact"),
    };
    const finalProtected = await readProtected();
    const finalCount = await countPublished();

    const brandFindings: any[] = [];
    for (const p of finalPolicies.shop?.shopPolicies ?? []) {
      const bad = scanBannedBrand(p.body ?? "").concat(scanBannedBrand(p.title ?? ""));
      if (bad.length) brandFindings.push({ policy: p.type, banned: bad });
    }
    const contactPage = finalPages.pages.find((p: any) => p.handle === "contact");
    if (contactPage) {
      const bad = scanBannedBrand(contactPage.body ?? "").concat(scanBannedBrand(contactPage.title ?? ""));
      if (bad.length) brandFindings.push({ page: "contact", banned: bad });
    }

    const publicAllOk = Object.values(publicVerify).every((r: any) => r && r.status === 200 && !r.has_password_gate && r.has_ailurova && (r.banned_brand?.length ?? 0) === 0);
    const supportEmailVisible = Object.values(publicVerify).every((r: any) => r?.has_support_email);
    const protectedOk = finalProtected.product?.status === "ACTIVE"
      && finalProtected.product?.publishedOnPublication === true
      && finalProtected.product?.variants?.nodes?.[0]?.sku === "CJFT268927601AZ";
    const publicationOk = finalCount.published.length === 1 && finalCount.published[0]?.id === PROTECTED_GID;

    let verdict = "AILUROVA_POLICIES_PARTIAL";
    if (!protectedOk || !publicationOk) verdict = "AILUROVA_PROTECTED_STATE_CHANGED";
    else if (!publicAllOk) verdict = "AILUROVA_POLICY_PUBLIC_VERIFICATION_FAILED";
    else if (publicAllOk && supportEmailVisible && brandFindings.length === 0) verdict = "AILUROVA_POLICIES_AND_SUPPORT_READY";

    return json({
      verdict, started_at: startedAt, completed_at: new Date().toISOString(), mode,
      preflight, mutations,
      final_admin_policies: (finalPolicies.shop?.shopPolicies ?? []).map((p: any) => ({
        type: p.type, title: p.title, url: p.url,
        body_length: (p.body ?? "").length,
        has_support_email: (p.body ?? "").toLowerCase().includes(SUPPORT_EMAIL.toLowerCase()),
        banned_brand: scanBannedBrand(p.body ?? "").concat(scanBannedBrand(p.title ?? "")),
      })),
      final_contact_page: contactPage ? {
        id: contactPage.id, handle: contactPage.handle, title: contactPage.title,
        isPublished: contactPage.isPublished, onlineStoreUrl: contactPage.onlineStoreUrl,
        body_length: (contactPage.body ?? "").length,
        banned_brand: scanBannedBrand(contactPage.body ?? "").concat(scanBannedBrand(contactPage.title ?? "")),
        has_support_email: (contactPage.body ?? "").toLowerCase().includes(SUPPORT_EMAIL.toLowerCase()),
      } : null,
      public_verification: publicVerify,
      brand_findings: brandFindings,
      protected_store: {
        online_store_published_count: finalCount.published.length,
        sole_published_product: finalCount.published[0] ?? null,
        protected_product: finalProtected.product,
      },
      remaining_limitations: [
        "Legal entity name not verified — Terms of Service does not name a legal entity.",
        "Company registration data not verified.",
        "Business address not verified — no physical address published.",
        "Return address not verified — customer is instructed to await approval before shipping any return.",
        "Confirmed delivery times not verified — Shipping Policy avoids fixed delivery windows.",
        "Return-label responsibility not verified — Refund Policy avoids promising prepaid or free returns.",
      ],
      ledger,
    });
  } catch (e) {
    return json({ verdict: "AILUROVA_POLICY_MUTATION_FAILED", error: String(e) }, 500);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

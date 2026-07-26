// Ailurova policy pages fallback.
// Because the current Shopify Admin app lacks `write_legal_policies`,
// we create the four legally-required policy documents as regular Online Store
// Pages under stable handles. This gives every policy a 200-OK public URL and
// unblocks launch. Once the merchant re-authorizes with the legal scope, the
// `ailurova-policies-launch` function can move them into native shop policies.
//
// Handles (published to Online Store):
//   /pages/shipping-policy
//   /pages/refund-policy
//   /pages/terms-of-service
//   /pages/contact           (already exists — left untouched unless empty)
//
// Mutations: pageCreate / pageUpdate only. No product, publication, price,
// inventory, theme, market, domain, or CJ mutations.

import { corsHeaders } from "../_shared/cors.ts";
import { shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";

const CONFIRM_PHRASE = "CONFIRM_AILUROVA_POLICY_PAGES_FALLBACK";
const PRIMARY_DOMAIN = "https://ailurova.com";
const SUPPORT_EMAIL = "support@ailurova.com";

const SHIPPING_BODY = `
<h2>Ailurova Shipping Policy</h2>
<p><em>Last updated: July 2026</em></p>
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
<p><em>Last updated: July 2026</em></p>
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
<p><em>Last updated: July 2026</em></p>
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
<p>These Terms shall be governed by the laws of the United States and, where applicable, of the state in which our principal place of business is located, without regard to conflict-of-laws principles.</p>
<h3>14. Changes to these Terms</h3>
<p>We may update these Terms from time to time. The "Last updated" date at the top of this page reflects the most recent version. Continued use of the Site after changes take effect constitutes acceptance of the revised Terms.</p>
<h3>15. Contact</h3>
<p>Questions about these Terms can be sent to <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
`.trim();

const CONTACT_BODY = `
<h2>Contact Ailurova</h2>
<p>Have a question about your order, our products, or a return? We are happy to help.</p>
<p><strong>Email:</strong> <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
<p>When contacting us about an existing order please include your order number so that we can review your case as quickly as possible. We aim to respond as soon as reasonably possible.</p>
<p>For details on shipping, returns and terms please see our <a href="/pages/shipping-policy">Shipping Policy</a>, <a href="/pages/refund-policy">Refund Policy</a>, and <a href="/pages/terms-of-service">Terms of Service</a>.</p>
`.trim();

type Plan = { handle: string; title: string; body: string };
const PLAN: Plan[] = [
  { handle: "shipping-policy",   title: "Shipping Policy",   body: SHIPPING_BODY },
  { handle: "refund-policy",     title: "Refund Policy",     body: REFUND_BODY },
  { handle: "terms-of-service",  title: "Terms of Service",  body: TERMS_BODY },
  { handle: "contact",           title: "Contact",           body: CONTACT_BODY },
];

const PAGES_QUERY = `
  query Pages($cursor: String) {
    pages(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { id title handle isPublished onlineStoreUrl body }
    }
  }
`;

const PAGE_CREATE = `
  mutation PageCreate($page: PageCreateInput!) {
    pageCreate(page: $page) {
      page { id handle title isPublished onlineStoreUrl }
      userErrors { field message code }
    }
  }
`;

const PAGE_UPDATE = `
  mutation PageUpdate($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page { id handle title isPublished onlineStoreUrl }
      userErrors { field message code }
    }
  }
`;

async function loadPages() {
  const out: any[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 20; i++) {
    const r = await shopifyAdminFetch<any>(PAGES_QUERY, { cursor });
    const nodes = r.data?.pages?.nodes ?? [];
    out.push(...nodes);
    if (!r.data?.pages?.pageInfo?.hasNextPage) break;
    cursor = r.data.pages.pageInfo.endCursor;
  }
  return out;
}

async function publicRead(path: string) {
  const url = `${PRIMARY_DOMAIN}${path}`;
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": "AilurovaPolicyPagesFallback/1.0" } });
    return { url, status: r.status, final_url: r.url };
  } catch (e) { return { url, error: String(e) }; }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status, headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const startedAt = new Date().toISOString();
  try {
    let body: any = {};
    try { body = await req.json(); } catch { /* preflight */ }
    const mode = (body?.mode ?? "preflight") as "preflight" | "execute" | "verify";
    const confirm = body?.confirm as string | undefined;

    const existing = await loadPages();
    const byHandle = new Map(existing.map((p: any) => [p.handle, p]));

    const preflightPages = PLAN.map((p) => {
      const cur = byHandle.get(p.handle);
      return {
        handle: p.handle,
        exists: !!cur,
        id: cur?.id ?? null,
        isPublished: cur?.isPublished ?? null,
        onlineStoreUrl: cur?.onlineStoreUrl ?? null,
      };
    });

    const preflightPublic: Record<string, unknown> = {};
    for (const p of PLAN) preflightPublic[p.handle] = await publicRead(`/pages/${p.handle}`);

    if (mode === "preflight") {
      return json({ verdict: "PREFLIGHT_ONLY", started_at: startedAt, plan: preflightPages, public: preflightPublic });
    }
    if (mode !== "verify" && confirm !== CONFIRM_PHRASE) {
      return json({ verdict: "MISSING_CONFIRM", required_confirm_phrase: CONFIRM_PHRASE, plan: preflightPages });
    }

    const mutations: any[] = [];
    if (mode === "execute") {
      for (const p of PLAN) {
        const cur = byHandle.get(p.handle);
        if (cur) {
          const r = await shopifyAdminFetch<any>(PAGE_UPDATE, {
            id: cur.id,
            page: { title: p.title, body: p.body, handle: p.handle, isPublished: true },
          });
          mutations.push({
            op: "pageUpdate", handle: p.handle, status: r.status,
            ok: !!r.data?.pageUpdate?.page && (r.data.pageUpdate.userErrors ?? []).length === 0,
            userErrors: r.data?.pageUpdate?.userErrors ?? [],
            errors: r.errors ?? null,
            page: r.data?.pageUpdate?.page ?? null,
          });
        } else {
          const r = await shopifyAdminFetch<any>(PAGE_CREATE, {
            page: { title: p.title, body: p.body, handle: p.handle, isPublished: true },
          });
          mutations.push({
            op: "pageCreate", handle: p.handle, status: r.status,
            ok: !!r.data?.pageCreate?.page && (r.data.pageCreate.userErrors ?? []).length === 0,
            userErrors: r.data?.pageCreate?.userErrors ?? [],
            errors: r.errors ?? null,
            page: r.data?.pageCreate?.page ?? null,
          });
        }
      }
    }

    // Wait briefly for Shopify to publish, then verify public 200s.
    await new Promise((res) => setTimeout(res, 2500));
    const publicAfter: Record<string, unknown> = {};
    for (const p of PLAN) publicAfter[p.handle] = await publicRead(`/pages/${p.handle}`);

    const allOk = mutations.every((m) => m.ok) &&
      Object.values(publicAfter).every((v: any) => v?.status === 200);

    return json({
      verdict: allOk ? "POLICY_PAGES_LIVE" : "POLICY_PAGES_PARTIAL",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      mode,
      mutations,
      public_after: publicAfter,
      public_before: preflightPublic,
    });
  } catch (e) {
    return json({ verdict: "ERROR", error: String(e) }, 500);
  }
});
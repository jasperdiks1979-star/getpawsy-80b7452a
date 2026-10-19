# Checkout return-origin release candidate

Not active production code. Keeping this patch outside the function directory avoids automatic deployment before mandatory release gates pass.

- Baseline: `2bb249ebd78513806bb8155e066a47d05a165072`; earlier GA4 work retained.
- PR19 helper inspected directly; adapted to reject unknown mode and restrict test returns to local/preview/first-party hosts.
- Candidate patch imports the helper and resolves return origin immediately after key-mode selection, before any customer, coupon, order or session write.
- No price, coupon, shipping, stock, idempotency, webhook, email or fulfillment changes.
- Deployment blocked pending independent TypeScript/production-prerender evidence and exercised rollback. Tests of this staged helper do not prove the running function is fixed.
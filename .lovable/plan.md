# Fix the first featured homepage image

## Scope
- Keep the automatic litter box only if its live catalog record, product page, available variant, cart action, and checkout path all remain valid.
- Replace only the first featured slot if any sellability gate fails.
- Correct the homepage image source without changing catalog, price, stock, supplier, billing, or integration data.

## Implementation
- Use the product's existing rehosted image as a homepage-only fallback when its stale primary URL is known broken.
- Preserve the existing title, price, product link, and the other four featured slots.
- Add focused regression coverage for the five-slot order and broken-image fallback.

## Verification
- Check all five homepage images and PDP links in a browser.
- Confirm the first product adds to cart and reaches checkout.
- Run focused tests, confirm the preview build, then publish once and verify the live storefront.

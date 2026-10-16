// CJ Dropshipping webhook signature verification.
// Official protocol: header `sign` = Base64(HMAC-SHA256(raw request body, account openId)).
// The openId is the HMAC key and must be treated as a secret: never log or return it.

export async function computeCJSign(rawBody: Uint8Array, openId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(openId),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, rawBody as unknown as BufferSource);
  let bin = "";
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify a CJ webhook request.
 * @param rawBody   the exact, unmodified request body bytes
 * @param signHeader value of the `sign` header (may be null)
 * @param openId    the CJ account openId (HMAC key)
 */
export async function verifyCJSign(
  rawBody: Uint8Array,
  signHeader: string | null,
  openId: string,
): Promise<boolean> {
  if (!signHeader || !openId) return false;
  const expected = await computeCJSign(rawBody, openId);
  return timingSafeEqual(expected, signHeader.trim());
}

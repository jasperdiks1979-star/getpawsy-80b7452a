// Shared HMAC utilities for email tracking signature verification

const encoder = new TextEncoder();

/**
 * Generate HMAC-SHA256 signature for email tracking URLs
 */
export async function generateHMAC(
  data: string,
  secretKey: string
): Promise<string> {
  const keyData = encoder.encode(secretKey);
  const dataBuffer = encoder.encode(data);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, dataBuffer);
  
  // Convert to URL-safe base64
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Verify HMAC-SHA256 signature
 */
export async function verifyHMAC(
  data: string,
  signature: string,
  secretKey: string
): Promise<boolean> {
  const expectedSignature = await generateHMAC(data, secretKey);
  return signature === expectedSignature;
}

/**
 * Generate tracking signature for email events
 * Format: campaignId:email:eventType
 */
export async function generateTrackingSignature(
  campaignId: string,
  email: string,
  eventType: string,
  secretKey: string
): Promise<string> {
  const data = `${campaignId}:${email}:${eventType}`;
  return generateHMAC(data, secretKey);
}

/**
 * Verify tracking signature
 */
export async function verifyTrackingSignature(
  campaignId: string,
  email: string,
  eventType: string,
  signature: string,
  secretKey: string
): Promise<boolean> {
  const data = `${campaignId}:${email}:${eventType}`;
  return verifyHMAC(data, signature, secretKey);
}

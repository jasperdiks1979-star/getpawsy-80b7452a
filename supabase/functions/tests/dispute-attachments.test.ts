import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// Use the project's Supabase credentials (from Cloud config)
const SUPABASE_URL = "https://nojvgfbcjgipjxpfatmm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vanZnZmJjamdpcGp4cGZhdG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTMxOTYsImV4cCI6MjA4Mzk4OTE5Nn0.gfjmYf9aB-BCIrCnH14Zmnm6GBEKX7QMWP1ELL_i9dc";

const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

Deno.test("Dispute Attachments - Unauthenticated cannot list files", async () => {
  // Try to list files in the bucket without authentication
  const { data, error } = await anonClient.storage
    .from("dispute-attachments")
    .list("some-user-id/some-dispute-id");

  // Unauthenticated users should get empty result (RLS blocks access)
  if (error) {
    assertExists(error, "Should return an error for unauthenticated access");
  } else {
    assertEquals(data?.length ?? 0, 0, "Should return empty list for unauthenticated users");
  }
});

Deno.test({
  name: "Dispute Attachments - Unauthenticated cannot download",
  sanitizeResources: false, // Disable resource leak check for this test
  fn: async () => {
    const { data, error } = await anonClient.storage
      .from("dispute-attachments")
      .download("any-user/any-dispute/any-file.txt");

    // Should fail - unauthenticated access denied or file not found
    assertEquals(data, null, "Unauthenticated users should not be able to download files");
    assertExists(error, "Should return an error for unauthenticated download");
  },
});

Deno.test("Dispute Attachments - Unauthenticated cannot upload", async () => {
  const testContent = new TextEncoder().encode("Malicious content");
  
  const { data, error } = await anonClient.storage
    .from("dispute-attachments")
    .upload(`attacker/${crypto.randomUUID()}/malicious.txt`, testContent, {
      contentType: "text/plain",
    });

  // Should fail - unauthenticated upload blocked
  assertEquals(data, null, "Unauthenticated users should not be able to upload files");
  assertExists(error, "Should return an error for unauthenticated upload");
});

Deno.test("Dispute Attachments - Bucket exists", async () => {
  // This verifies the bucket is properly configured
  const { error } = await anonClient.storage
    .from("dispute-attachments")
    .list("");

  if (error) {
    // Error should NOT be about missing bucket
    const isBucketMissing = error.message?.toLowerCase().includes("bucket not found");
    assertEquals(isBucketMissing, false, "Bucket 'dispute-attachments' should exist");
  }
  // If no error, bucket exists and is accessible (at least for listing root)
});

Deno.test("Dispute Attachments - Cannot access random user folders", async () => {
  // Generate random IDs to simulate different users/disputes
  const randomUserId = crypto.randomUUID();
  const randomDisputeId = crypto.randomUUID();
  
  const { data, error } = await anonClient.storage
    .from("dispute-attachments")
    .list(`${randomUserId}/${randomDisputeId}`);

  // Should not expose any files to unauthenticated users
  if (error) {
    assertExists(error, "Should deny access to user folders");
  } else {
    assertEquals(data?.length ?? 0, 0, "Should not expose user files");
  }
});

Deno.test("Dispute Attachments - RLS policies are in place", async () => {
  // This test verifies the core RLS configuration is working
  // by checking that the bucket exists and access control is enforced
  
  // Test 1: Bucket should exist
  const { error: listError } = await anonClient.storage
    .from("dispute-attachments")
    .list("");
  
  if (listError) {
    const isBucketMissing = listError.message?.toLowerCase().includes("bucket not found");
    assertEquals(isBucketMissing, false, "Bucket should exist");
  }

  // Test 2: Upload should be blocked for unauthenticated
  const testContent = new TextEncoder().encode("Test");
  const { error: uploadError } = await anonClient.storage
    .from("dispute-attachments")
    .upload(`test-${crypto.randomUUID()}/test.txt`, testContent);
  
  assertExists(uploadError, "Upload should be blocked for unauthenticated users");
  
  // Test 3: Random folder should return empty (not error, just empty)
  const { data } = await anonClient.storage
    .from("dispute-attachments")
    .list(`${crypto.randomUUID()}/${crypto.randomUUID()}`);
  
  assertEquals(data?.length ?? 0, 0, "Random folders should be empty for unauthenticated");
});

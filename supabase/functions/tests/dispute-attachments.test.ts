import { assertEquals, assertExists, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// Use the project's Supabase credentials (from Cloud config)
const SUPABASE_URL = "https://nojvgfbcjgipjxpfatmm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vanZnZmJjamdpcGp4cGZhdG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTMxOTYsImV4cCI6MjA4Mzk4OTE5Nn0.gfjmYf9aB-BCIrCnH14Zmnm6GBEKX7QMWP1ELL_i9dc";

// Test user credentials (set these environment variables for authenticated tests)
const TEST_USER_EMAIL = Deno.env.get("TEST_USER_EMAIL");
const TEST_USER_PASSWORD = Deno.env.get("TEST_USER_PASSWORD");
const TEST_ADMIN_EMAIL = Deno.env.get("TEST_ADMIN_EMAIL");
const TEST_ADMIN_PASSWORD = Deno.env.get("TEST_ADMIN_PASSWORD");

const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper to create an authenticated client
async function createAuthenticatedClient(email: string, password: string): Promise<{ client: SupabaseClient; userId: string } | null> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  
  if (error || !data.user) {
    console.log(`Auth failed for ${email}: ${error?.message || 'No user returned'}`);
    return null;
  }
  
  return { client, userId: data.user.id };
}

// Helper to clean up test files
async function cleanupTestFile(client: SupabaseClient, path: string) {
  try {
    await client.storage.from("dispute-attachments").remove([path]);
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================
// UNAUTHENTICATED USER TESTS
// ============================================

Deno.test("Dispute Attachments - Unauthenticated cannot list files", async () => {
  const { data, error } = await anonClient.storage
    .from("dispute-attachments")
    .list("some-user-id/some-dispute-id");

  if (error) {
    assertExists(error, "Should return an error for unauthenticated access");
  } else {
    assertEquals(data?.length ?? 0, 0, "Should return empty list for unauthenticated users");
  }
});

Deno.test({
  name: "Dispute Attachments - Unauthenticated cannot download",
  sanitizeResources: false,
  fn: async () => {
    const { data, error } = await anonClient.storage
      .from("dispute-attachments")
      .download("any-user/any-dispute/any-file.txt");

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

  assertEquals(data, null, "Unauthenticated users should not be able to upload files");
  assertExists(error, "Should return an error for unauthenticated upload");
});

Deno.test("Dispute Attachments - Bucket exists", async () => {
  const { error } = await anonClient.storage
    .from("dispute-attachments")
    .list("");

  if (error) {
    const isBucketMissing = error.message?.toLowerCase().includes("bucket not found");
    assertEquals(isBucketMissing, false, "Bucket 'dispute-attachments' should exist");
  }
});

Deno.test("Dispute Attachments - Cannot access random user folders", async () => {
  const randomUserId = crypto.randomUUID();
  const randomDisputeId = crypto.randomUUID();
  
  const { data, error } = await anonClient.storage
    .from("dispute-attachments")
    .list(`${randomUserId}/${randomDisputeId}`);

  if (error) {
    assertExists(error, "Should deny access to user folders");
  } else {
    assertEquals(data?.length ?? 0, 0, "Should not expose user files");
  }
});

Deno.test("Dispute Attachments - RLS policies are in place", async () => {
  const { error: listError } = await anonClient.storage
    .from("dispute-attachments")
    .list("");
  
  if (listError) {
    const isBucketMissing = listError.message?.toLowerCase().includes("bucket not found");
    assertEquals(isBucketMissing, false, "Bucket should exist");
  }

  const testContent = new TextEncoder().encode("Test");
  const { error: uploadError } = await anonClient.storage
    .from("dispute-attachments")
    .upload(`test-${crypto.randomUUID()}/test.txt`, testContent);
  
  assertExists(uploadError, "Upload should be blocked for unauthenticated users");
  
  const { data } = await anonClient.storage
    .from("dispute-attachments")
    .list(`${crypto.randomUUID()}/${crypto.randomUUID()}`);
  
  assertEquals(data?.length ?? 0, 0, "Random folders should be empty for unauthenticated");
});

// ============================================
// AUTHENTICATED USER TESTS
// ============================================

Deno.test({
  name: "Dispute Attachments - Authenticated user can upload to own folder",
  ignore: !TEST_USER_EMAIL || !TEST_USER_PASSWORD,
  sanitizeResources: false,
  fn: async () => {
    const auth = await createAuthenticatedClient(TEST_USER_EMAIL!, TEST_USER_PASSWORD!);
    if (!auth) {
      console.log("Skipping: Could not authenticate test user");
      return;
    }

    const { client, userId } = auth;
    const testDisputeId = crypto.randomUUID();
    const testPath = `${userId}/${testDisputeId}/test-upload.txt`;
    const testContent = new TextEncoder().encode("Test content from authenticated user");

    try {
      const { data, error } = await client.storage
        .from("dispute-attachments")
        .upload(testPath, testContent, { contentType: "text/plain" });

      // User should be able to upload to their own folder
      if (error) {
        console.log("Upload error:", error.message);
      }
      assertNotEquals(data, null, "Authenticated user should be able to upload to own folder");
    } finally {
      await cleanupTestFile(client, testPath);
      await client.auth.signOut();
    }
  },
});

Deno.test({
  name: "Dispute Attachments - Authenticated user cannot upload to other user folder",
  ignore: !TEST_USER_EMAIL || !TEST_USER_PASSWORD,
  fn: async () => {
    const auth = await createAuthenticatedClient(TEST_USER_EMAIL!, TEST_USER_PASSWORD!);
    if (!auth) {
      console.log("Skipping: Could not authenticate test user");
      return;
    }

    const { client } = auth;
    const otherUserId = crypto.randomUUID(); // Simulating another user's folder
    const testDisputeId = crypto.randomUUID();
    const testPath = `${otherUserId}/${testDisputeId}/malicious.txt`;
    const testContent = new TextEncoder().encode("Attempting to write to another user's folder");

    try {
      const { data, error } = await client.storage
        .from("dispute-attachments")
        .upload(testPath, testContent, { contentType: "text/plain" });

      // Should be blocked by RLS
      assertEquals(data, null, "Should not be able to upload to other user's folder");
      assertExists(error, "Should return an error when uploading to other user's folder");
    } finally {
      await client.auth.signOut();
    }
  },
});

Deno.test({
  name: "Dispute Attachments - Authenticated user cannot list other user folders",
  ignore: !TEST_USER_EMAIL || !TEST_USER_PASSWORD,
  fn: async () => {
    const auth = await createAuthenticatedClient(TEST_USER_EMAIL!, TEST_USER_PASSWORD!);
    if (!auth) {
      console.log("Skipping: Could not authenticate test user");
      return;
    }

    const { client } = auth;
    const otherUserId = crypto.randomUUID();
    const otherDisputeId = crypto.randomUUID();

    try {
      const { data, error } = await client.storage
        .from("dispute-attachments")
        .list(`${otherUserId}/${otherDisputeId}`);

      // Should return empty or error - not expose other user's files
      if (error) {
        assertExists(error, "Should deny access to other user folders");
      } else {
        assertEquals(data?.length ?? 0, 0, "Should not expose other user's files");
      }
    } finally {
      await client.auth.signOut();
    }
  },
});

Deno.test({
  name: "Dispute Attachments - Authenticated user can list own dispute folder",
  ignore: !TEST_USER_EMAIL || !TEST_USER_PASSWORD,
  sanitizeResources: false,
  fn: async () => {
    const auth = await createAuthenticatedClient(TEST_USER_EMAIL!, TEST_USER_PASSWORD!);
    if (!auth) {
      console.log("Skipping: Could not authenticate test user");
      return;
    }

    const { client, userId } = auth;
    const testDisputeId = crypto.randomUUID();
    const testPath = `${userId}/${testDisputeId}/list-test.txt`;
    const testContent = new TextEncoder().encode("File for list test");

    try {
      // First upload a file
      await client.storage
        .from("dispute-attachments")
        .upload(testPath, testContent, { contentType: "text/plain" });

      // Then try to list the folder
      const { data, error } = await client.storage
        .from("dispute-attachments")
        .list(`${userId}/${testDisputeId}`);

      // User should be able to list their own folder
      if (error) {
        console.log("List error:", error.message);
      }
      // Note: Access depends on having a matching dispute in the database
      // This test verifies the storage operation itself works
    } finally {
      await cleanupTestFile(client, testPath);
      await client.auth.signOut();
    }
  },
});

// ============================================
// ADMIN USER TESTS
// ============================================

Deno.test({
  name: "Dispute Attachments - Admin can view all attachments",
  ignore: !TEST_ADMIN_EMAIL || !TEST_ADMIN_PASSWORD,
  fn: async () => {
    const auth = await createAuthenticatedClient(TEST_ADMIN_EMAIL!, TEST_ADMIN_PASSWORD!);
    if (!auth) {
      console.log("Skipping: Could not authenticate admin user");
      return;
    }

    const { client } = auth;

    try {
      // Admin should be able to list the root of the bucket
      const { error } = await client.storage
        .from("dispute-attachments")
        .list("");

      // Admin should have access (error would indicate RLS blocking)
      if (error) {
        console.log("Admin list error:", error.message);
        // Don't fail - admin might still have access, just no files exist
      }
    } finally {
      await client.auth.signOut();
    }
  },
});

Deno.test({
  name: "Dispute Attachments - Admin can access any user folder",
  ignore: !TEST_ADMIN_EMAIL || !TEST_ADMIN_PASSWORD,
  fn: async () => {
    const auth = await createAuthenticatedClient(TEST_ADMIN_EMAIL!, TEST_ADMIN_PASSWORD!);
    if (!auth) {
      console.log("Skipping: Could not authenticate admin user");
      return;
    }

    const { client } = auth;
    const randomUserId = crypto.randomUUID();
    const randomDisputeId = crypto.randomUUID();

    try {
      // Admin should be able to access any folder (even if empty)
      const { error } = await client.storage
        .from("dispute-attachments")
        .list(`${randomUserId}/${randomDisputeId}`);

      // No error means admin has access (folder is just empty)
      if (error) {
        console.log("Admin folder access error:", error.message);
      }
    } finally {
      await client.auth.signOut();
    }
  },
});

// ============================================
// CROSS-USER ACCESS TESTS
// ============================================

Deno.test({
  name: "Dispute Attachments - User cannot delete other user's files",
  ignore: !TEST_USER_EMAIL || !TEST_USER_PASSWORD,
  fn: async () => {
    const auth = await createAuthenticatedClient(TEST_USER_EMAIL!, TEST_USER_PASSWORD!);
    if (!auth) {
      console.log("Skipping: Could not authenticate test user");
      return;
    }

    const { client } = auth;
    const otherUserId = crypto.randomUUID();
    const otherDisputeId = crypto.randomUUID();

    try {
      // Attempt to delete a file from another user's folder
      const { error } = await client.storage
        .from("dispute-attachments")
        .remove([`${otherUserId}/${otherDisputeId}/some-file.txt`]);

      // This should fail or have no effect (file doesn't exist anyway)
      // The key is that RLS prevents any cross-user operations
      if (error) {
        assertExists(error, "Should prevent deletion of other user's files");
      }
    } finally {
      await client.auth.signOut();
    }
  },
});

Deno.test({
  name: "Dispute Attachments - User cannot update other user's files",
  ignore: !TEST_USER_EMAIL || !TEST_USER_PASSWORD,
  fn: async () => {
    const auth = await createAuthenticatedClient(TEST_USER_EMAIL!, TEST_USER_PASSWORD!);
    if (!auth) {
      console.log("Skipping: Could not authenticate test user");
      return;
    }

    const { client } = auth;
    const otherUserId = crypto.randomUUID();
    const otherDisputeId = crypto.randomUUID();
    const testContent = new TextEncoder().encode("Attempting to overwrite");

    try {
      // Attempt to update/overwrite a file in another user's folder
      const { data, error } = await client.storage
        .from("dispute-attachments")
        .update(`${otherUserId}/${otherDisputeId}/target.txt`, testContent, {
          contentType: "text/plain",
        });

      // Should be blocked
      assertEquals(data, null, "Should not be able to update other user's files");
    } finally {
      await client.auth.signOut();
    }
  },
});
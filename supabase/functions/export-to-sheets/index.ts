import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SheetData {
  title: string;
  csvContent: string;
}

interface ExportRequest {
  sheets: SheetData[];
  spreadsheetTitle: string;
  productCount?: number;
}

async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const serviceAccount = JSON.parse(serviceAccountJson);
  
  // Create JWT header and claim
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  // Base64url encode
  const encoder = new TextEncoder();
  const base64url = (data: Uint8Array) => 
    btoa(String.fromCharCode(...data))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

  const headerB64 = base64url(encoder.encode(JSON.stringify(header)));
  const claimB64 = base64url(encoder.encode(JSON.stringify(claim)));
  const signatureInput = `${headerB64}.${claimB64}`;

  // Import private key and sign
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = serviceAccount.private_key
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\n/g, "");
  
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(signatureInput)
  );

  const signatureB64 = base64url(new Uint8Array(signature));
  const jwt = `${signatureInput}.${signatureB64}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok) {
    throw new Error(`Token error: ${JSON.stringify(tokenData)}`);
  }

  return tokenData.access_token;
}

function parseCSV(csv: string): string[][] {
  const lines = csv.trim().split('\n');
  return lines.map(line => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  });
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require authentication
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Validate user authentication
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const userId = claimsData.claims.sub as string;

    // Verify admin role - this endpoint is for admin-only Google Ads export
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!serviceAccountJson) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not configured");
    }

    const { sheets, spreadsheetTitle, productCount }: ExportRequest = await req.json();
    
    if (!sheets || sheets.length === 0) {
      throw new Error("No sheet data provided");
    }

    // Get access token
    const accessToken = await getAccessToken(serviceAccountJson);

    // Create spreadsheet with multiple sheets
    const createResponse = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: { title: spreadsheetTitle },
        sheets: sheets.map((sheet, index) => ({
          properties: { 
            sheetId: index,
            title: sheet.title,
            index: index,
          },
        })),
      }),
    });

    if (!createResponse.ok) {
      const error = await createResponse.text();
      throw new Error(`Failed to create spreadsheet: ${error}`);
    }

    const spreadsheet = await createResponse.json();
    const spreadsheetId = spreadsheet.spreadsheetId;

    // Batch update all sheets with data
    const requests = sheets.map((sheet, index) => {
      const data = parseCSV(sheet.csvContent);
      return {
        updateCells: {
          range: {
            sheetId: index,
            startRowIndex: 0,
            startColumnIndex: 0,
          },
          rows: data.map(row => ({
            values: row.map(cell => ({
              userEnteredValue: { stringValue: cell },
            })),
          })),
          fields: "userEnteredValue",
        },
      };
    });

    // Add formatting for headers
    sheets.forEach((_, index) => {
      requests.push({
        repeatCell: {
          range: {
            sheetId: index,
            startRowIndex: 0,
            endRowIndex: 1,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
              textFormat: { bold: true },
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat)",
        },
      } as any);
    });

    const batchResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requests }),
      }
    );

    if (!batchResponse.ok) {
      const error = await batchResponse.text();
      throw new Error(`Failed to update spreadsheet: ${error}`);
    }

    // Make spreadsheet publicly viewable
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: "reader",
          type: "anyone",
        }),
      }
    );

    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

    // Save export record (user is always authenticated now)
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    await supabaseAdmin.from("google_sheets_exports").insert({
      user_id: userId,
      spreadsheet_id: spreadsheetId,
      spreadsheet_url: spreadsheetUrl,
      title: spreadsheetTitle,
      product_count: productCount || 0,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        spreadsheetId,
        url: spreadsheetUrl,
      }),
      { 
        status: 200, 
        headers: { "Content-Type": "application/json", ...corsHeaders } 
      }
    );
  } catch (error: any) {
    console.error("Error exporting to sheets:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { "Content-Type": "application/json", ...corsHeaders } 
      }
    );
  }
};

serve(handler);

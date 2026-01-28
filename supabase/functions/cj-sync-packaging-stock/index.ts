import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getCJAccessToken(): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: cached } = await supabase
    .from("cj_token_cache")
    .select("access_token, token_expiry")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (cached && new Date(cached.token_expiry) > new Date()) {
    return cached.access_token;
  }

  const email = Deno.env.get("CJ_EMAIL");
  const password = Deno.env.get("CJ_PASSWORD");

  if (!email || !password) {
    throw new Error("CJ credentials not configured");
  }

  const response = await fetch(
    "https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }
  );

  const data = await response.json();
  if (!data.result || !data.data?.accessToken) {
    throw new Error(data.message || "Failed to get CJ access token");
  }

  const accessToken = data.data.accessToken;
  const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await supabase.from("cj_token_cache").upsert({
    id: "main",
    access_token: accessToken,
    token_expiry: tokenExpiry,
    updated_at: new Date().toISOString(),
  });

  return accessToken;
}

interface SyncResult {
  itemType: string;
  itemName: string;
  cjProductId: string;
  cjStock: number | null;
  localStock: number;
  synced: boolean;
  discrepancy?: number;
  error?: string;
}

async function sendDiscrepancyEmail(
  discrepancies: SyncResult[],
  resendApiKey: string
): Promise<boolean> {
  if (discrepancies.length === 0) return false;

  const itemRows = discrepancies
    .map((d) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${d.itemName}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${d.localStock}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${d.cjStock ?? "N/A"}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center; color: ${(d.discrepancy || 0) < 0 ? "#dc2626" : "#16a34a"};">
          ${(d.discrepancy || 0) > 0 ? "+" : ""}${d.discrepancy}
        </td>
      </tr>
    `)
    .join("");

  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Packaging Stock Discrepancy Alert</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #1f2937; margin: 0;">🚨 Packaging Stock Discrepancy</h1>
        <p style="color: #6b7280; margin-top: 8px;">Differences detected between local and CJ warehouse stock</p>
      </div>
      
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="padding: 12px; text-align: left; font-weight: 600;">Item</th>
            <th style="padding: 12px; text-align: center; font-weight: 600;">Local</th>
            <th style="padding: 12px; text-align: center; font-weight: 600;">CJ Stock</th>
            <th style="padding: 12px; text-align: center; font-weight: 600;">Difference</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>
      
      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin-top: 20px;">
        <p style="margin: 0; color: #92400e;">
          <strong>Action Required:</strong> Review these discrepancies and update inventory if needed.
        </p>
      </div>
      
      <p style="color: #9ca3af; font-size: 12px; margin-top: 30px; text-align: center;">
        This is an automated alert from GetPawsy Packaging Sync
      </p>
    </body>
    </html>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "GetPawsy Alerts <alerts@getpawsy.pet>",
        to: ["support@getpawsy.pet"],
        subject: `⚠️ Packaging Stock Discrepancy: ${discrepancies.length} item(s) differ`,
        html: emailHtml,
      }),
    });

    if (!res.ok) {
      console.error("Failed to send discrepancy email:", await res.text());
      return false;
    }

    console.log("Discrepancy email sent successfully");
    return true;
  } catch (error) {
    console.error("Error sending discrepancy email:", error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Determine if this is a cron job
  let isCronJob = false;
  try {
    const body = await req.clone().json();
    isCronJob = body?.source === 'cron';
  } catch {
    // Not a JSON body, continue
  }

  // Log cron start
  let cronLogId = '';
  if (isCronJob) {
    try {
      const { data } = await supabase
        .from('cron_job_logs')
        .insert({
          job_name: 'daily-cj-packaging-sync',
          status: 'running',
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      cronLogId = data?.id || '';
    } catch (err) {
      console.error('Failed to log cron start:', err);
    }
  }

  try {
    // Check authorization (skip for cron jobs)
    const authHeader = req.headers.get("Authorization");
    const isServiceRole = authHeader?.includes(Deno.env.get("SUPABASE_ANON_KEY") || "");
    
    if (!isCronJob && !isServiceRole && authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .single();

      if (!roleData) {
        return new Response(
          JSON.stringify({ success: false, error: "Admin access required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get packaging inventory with cj_product_id
    const { data: inventory, error: invError } = await supabase
      .from("packaging_inventory")
      .select("*");

    if (invError) {
      throw new Error(`Failed to fetch inventory: ${invError.message}`);
    }

    // Get CJ access token
    const accessToken = await getCJAccessToken();

    const syncResults: SyncResult[] = [];
    const discrepancies: SyncResult[] = [];

    for (const item of inventory || []) {
      const cjProductId = item.cj_product_id;
      
      if (!cjProductId) {
        syncResults.push({
          itemType: item.item_type,
          itemName: item.item_name,
          cjProductId: "Not configured",
          cjStock: null,
          localStock: item.quantity,
          synced: false,
          error: "No CJ product ID configured",
        });
        continue;
      }

      try {
        const stockResponse = await fetch(
          `https://developers.cjdropshipping.com/api2.0/v1/product/stock?pid=${cjProductId}`,
          {
            method: "GET",
            headers: { "CJ-Access-Token": accessToken },
          }
        );

        const stockData = await stockResponse.json();

        if (stockData.result && stockData.data) {
          const totalStock = Array.isArray(stockData.data)
            ? stockData.data.reduce((sum: number, w: { storageNum?: number }) => 
                sum + (w.storageNum || 0), 0)
            : stockData.data.storageNum || 0;

          const discrepancy = totalStock - item.quantity;
          const result: SyncResult = {
            itemType: item.item_type,
            itemName: item.item_name,
            cjProductId,
            cjStock: totalStock,
            localStock: item.quantity,
            synced: true,
            discrepancy,
          };

          // Track significant discrepancies (more than 10% difference or absolute > 10)
          if (Math.abs(discrepancy) > 10 || Math.abs(discrepancy) > item.quantity * 0.1) {
            discrepancies.push(result);
          }

          // Update local inventory with CJ stock
          await supabase
            .from("packaging_inventory")
            .update({ 
              quantity: totalStock,
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.id);

          syncResults.push(result);
        } else {
          syncResults.push({
            itemType: item.item_type,
            itemName: item.item_name,
            cjProductId,
            cjStock: null,
            localStock: item.quantity,
            synced: false,
            error: stockData.message || "Failed to fetch CJ stock",
          });
        }
      } catch (error) {
        syncResults.push({
          itemType: item.item_type,
          itemName: item.item_name,
          cjProductId,
          cjStock: null,
          localStock: item.quantity,
          synced: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Send discrepancy notification email if any
    let emailSent = false;
    if (discrepancies.length > 0 && resendApiKey) {
      emailSent = await sendDiscrepancyEmail(discrepancies, resendApiKey);
    }

    const syncedCount = syncResults.filter(r => r.synced).length;
    const failedCount = syncResults.filter(r => !r.synced).length;
    console.log(`Packaging sync: ${syncedCount}/${syncResults.length} synced, ${discrepancies.length} discrepancies`);

    // Log cron completion
    if (isCronJob && cronLogId) {
      await supabase.from('cron_job_logs').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        success: failedCount === 0,
        items_processed: syncedCount,
        items_failed: failedCount,
        details: { discrepancies: discrepancies.length, emailSent, totalItems: syncResults.length },
      }).eq('id', cronLogId);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Synced ${syncedCount} of ${syncResults.length} packaging items`,
        results: syncResults,
        discrepancies: discrepancies.length,
        emailSent,
        note: syncedCount === 0 
          ? "No CJ product IDs configured. Set them via the 'CJ Product IDs' button."
          : undefined
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Packaging stock sync error:", error);

    // Log cron failure
    if (isCronJob && cronLogId) {
      await supabase.from('cron_job_logs').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        success: false,
        items_processed: 0,
        items_failed: 1,
        error_message: errorMessage,
      }).eq('id', cronLogId);
    }

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

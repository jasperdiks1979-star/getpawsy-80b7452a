import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * SEO Nurture Queue Processor
 * 
 * This function runs on a schedule (e.g., every hour) to process
 * pending nurture emails based on signup time.
 * 
 * Email Schedule:
 * - Welcome: Immediate (handled separately on signup)
 * - Education: 3 days after signup
 * - Conversion: 6 days after signup
 */

interface NurtureQueueItem {
  id: string;
  email: string;
  signup_source: string;
  subscribed_at: string;
  welcome_sent: boolean;
  education_sent: boolean;
  conversion_sent: boolean;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("Process SEO nurture queue function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    
    // Find subscribers eligible for education email (signed up 3+ days ago, hasn't received it)
    const { data: educationEligible, error: eduError } = await supabase
      .from('seo_nurture_queue')
      .select('*')
      .eq('education_sent', false)
      .eq('welcome_sent', true)
      .lte('subscribed_at', threeDaysAgo.toISOString())
      .limit(50);
    
    if (eduError) {
      console.error("Error fetching education eligible:", eduError);
    }
    
    // Find subscribers eligible for conversion email (signed up 6+ days ago, hasn't received it)
    const { data: conversionEligible, error: convError } = await supabase
      .from('seo_nurture_queue')
      .select('*')
      .eq('conversion_sent', false)
      .eq('education_sent', true)
      .lte('subscribed_at', sixDaysAgo.toISOString())
      .limit(50);
    
    if (convError) {
      console.error("Error fetching conversion eligible:", convError);
    }
    
    const results = {
      education_sent: 0,
      conversion_sent: 0,
      errors: [] as string[],
    };
    
    // Process education emails
    for (const item of (educationEligible || [])) {
      try {
        // Check if subscriber is still active
        const { data: subscriber } = await supabase
          .from('newsletter_subscribers')
          .select('is_active')
          .eq('email', item.email)
          .single();
        
        if (!subscriber?.is_active) {
          console.log(`Skipping inactive subscriber: ${item.email}`);
          continue;
        }
        
        // Send education email
        const response = await fetch(`${supabaseUrl}/functions/v1/send-seo-nurture-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            email: item.email,
            emailType: 'education',
          }),
        });
        
        if (response.ok) {
          // Mark as sent
          await supabase
            .from('seo_nurture_queue')
            .update({ education_sent: true, education_sent_at: new Date().toISOString() })
            .eq('id', item.id);
          
          results.education_sent++;
          console.log(`Education email sent to: ${item.email}`);
        } else {
          const error = await response.text();
          results.errors.push(`Failed education email for ${item.email}: ${error}`);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        results.errors.push(`Error processing ${item.email}: ${errorMsg}`);
      }
    }
    
    // Process conversion emails
    for (const item of (conversionEligible || [])) {
      try {
        // Check if subscriber is still active
        const { data: subscriber } = await supabase
          .from('newsletter_subscribers')
          .select('is_active')
          .eq('email', item.email)
          .single();
        
        if (!subscriber?.is_active) {
          console.log(`Skipping inactive subscriber: ${item.email}`);
          continue;
        }
        
        // Send conversion email
        const response = await fetch(`${supabaseUrl}/functions/v1/send-seo-nurture-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            email: item.email,
            emailType: 'conversion',
          }),
        });
        
        if (response.ok) {
          // Mark as sent
          await supabase
            .from('seo_nurture_queue')
            .update({ conversion_sent: true, conversion_sent_at: new Date().toISOString() })
            .eq('id', item.id);
          
          results.conversion_sent++;
          console.log(`Conversion email sent to: ${item.email}`);
        } else {
          const error = await response.text();
          results.errors.push(`Failed conversion email for ${item.email}: ${error}`);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        results.errors.push(`Error processing ${item.email}: ${errorMsg}`);
      }
    }
    
    console.log("Nurture queue processing complete:", results);
    
    return new Response(
      JSON.stringify(results),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
    
  } catch (error: unknown) {
    console.error("Error in process-seo-nurture-queue:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);

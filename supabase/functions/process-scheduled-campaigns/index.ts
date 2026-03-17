import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Process Scheduled Campaigns
 * 
 * This function runs on a schedule (e.g., every 5 minutes) to:
 * 1. Send campaigns that are scheduled for now
 * 2. Generate and send recurring campaigns
 */

const handler = async (req: Request): Promise<Response> => {
  console.log("Process scheduled campaigns function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const now = new Date();
    const results = {
      scheduled_sent: 0,
      recurring_sent: 0,
      errors: [] as string[],
    };
    
    // 1. Process one-time scheduled campaigns
    const { data: scheduledCampaigns, error: schedError } = await supabase
      .from('email_campaigns')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_at', now.toISOString())
      .limit(10);
    
    if (schedError) {
      console.error("Error fetching scheduled campaigns:", schedError);
      results.errors.push(`Fetch error: ${schedError.message}`);
    }
    
    for (const campaign of (scheduledCampaigns || [])) {
      try {
        console.log(`Sending scheduled campaign: ${campaign.id}`);
        
        // Call send-email-campaign function
        const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-email-campaign`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ campaignId: campaign.id }),
        });
        
        if (sendResponse.ok) {
          results.scheduled_sent++;
          console.log(`Successfully sent scheduled campaign: ${campaign.id}`);
        } else {
          const error = await sendResponse.text();
          results.errors.push(`Campaign ${campaign.id}: ${error}`);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        results.errors.push(`Campaign ${campaign.id}: ${errorMsg}`);
      }
    }
    
    // 2. Process recurring campaigns
    const { data: recurringCampaigns, error: recurError } = await supabase
      .from('email_campaigns')
      .select('*')
      .eq('is_recurring', true)
      .eq('status', 'active')
      .lte('next_recurring_at', now.toISOString())
      .limit(5);
    
    if (recurError) {
      console.error("Error fetching recurring campaigns:", recurError);
      results.errors.push(`Recurring fetch error: ${recurError.message}`);
    }
    
    for (const campaign of (recurringCampaigns || [])) {
      try {
        console.log(`Processing recurring campaign: ${campaign.id}`);
        
        let content = campaign.content;
        let subject = campaign.subject;
        
        // If AI-generated, regenerate content
        if (campaign.is_ai_generated && campaign.ai_content_type) {
          console.log(`Regenerating AI content for campaign: ${campaign.id}`);
          
          const generateResponse = await fetch(`${supabaseUrl}/functions/v1/generate-newsletter-content`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              contentType: campaign.ai_content_type,
              customPrompt: campaign.ai_prompt,
            }),
          });
          
          if (generateResponse.ok) {
            const generated = await generateResponse.json();
            content = generated.content;
            subject = generated.subject || campaign.subject;
          } else {
            console.error(`Failed to generate AI content for campaign ${campaign.id}`);
            // Fall back to existing content
          }
        }
        
        // Create a new campaign instance for this send
        const { data: newCampaign, error: createError } = await supabase
          .from('email_campaigns')
          .insert([{
            subject: `${subject} - ${now.toLocaleDateString('nl-NL')}`,
            content,
            target_preferences: campaign.target_preferences,
            status: 'draft',
            is_ai_generated: campaign.is_ai_generated,
          }])
          .select()
          .single();
        
        if (createError) {
          throw new Error(`Failed to create campaign instance: ${createError.message}`);
        }
        
        // Send the new campaign
        const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-email-campaign`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ campaignId: newCampaign.id }),
        });
        
        if (sendResponse.ok) {
          results.recurring_sent++;
          
          // Calculate next occurrence
          const nextDate = calculateNextOccurrence(
            campaign.recurrence_pattern,
            campaign.recurrence_day,
            campaign.recurrence_time
          );
          
          // Update the recurring campaign
          await supabase
            .from('email_campaigns')
            .update({
              last_recurring_sent_at: now.toISOString(),
              next_recurring_at: nextDate.toISOString(),
            })
            .eq('id', campaign.id);
          
          console.log(`Successfully sent recurring campaign: ${campaign.id}, next: ${nextDate.toISOString()}`);
        } else {
          const error = await sendResponse.text();
          results.errors.push(`Recurring ${campaign.id}: ${error}`);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        results.errors.push(`Recurring ${campaign.id}: ${errorMsg}`);
      }
    }
    
    console.log("Scheduled campaigns processing complete:", results);
    
    return new Response(
      JSON.stringify(results),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error: any) {
    console.error("Error in process-scheduled-campaigns:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

function calculateNextOccurrence(
  pattern: string | null,
  day: number | null,
  time: string | null
): Date {
  const now = new Date();
  const next = new Date(now);
  
  // Set time if specified
  if (time) {
    const [hours, minutes] = time.split(':').map(Number);
    next.setHours(hours, minutes, 0, 0);
  } else {
    next.setHours(10, 0, 0, 0); // Default to 10:00
  }
  
  switch (pattern) {
    case 'weekly':
      // Move to next week, same day
      next.setDate(next.getDate() + 7);
      if (day !== null && day >= 0 && day <= 6) {
        const currentDay = next.getDay();
        const daysToAdd = (day - currentDay + 7) % 7;
        next.setDate(next.getDate() + daysToAdd);
      }
      break;
      
    case 'biweekly':
      // Move to two weeks from now
      next.setDate(next.getDate() + 14);
      if (day !== null && day >= 0 && day <= 6) {
        const currentDay = next.getDay();
        const daysToAdd = (day - currentDay + 7) % 7;
        next.setDate(next.getDate() + daysToAdd);
      }
      break;
      
    case 'monthly':
      // Move to next month
      next.setMonth(next.getMonth() + 1);
      if (day !== null && day >= 1 && day <= 28) {
        next.setDate(day);
      }
      break;
      
    default:
      // Default to weekly
      next.setDate(next.getDate() + 7);
  }
  
  return next;
}

serve(handler);

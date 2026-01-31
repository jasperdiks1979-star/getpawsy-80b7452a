import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PINTEREST_API_BASE = 'https://api.pinterest.com/v5';

interface AdAccountResponse {
  id: string;
  name: string;
  currency: string;
  status: string;
}

interface CampaignAnalytics {
  campaign_id: string;
  campaign_name: string;
  impressions: number;
  clicks: number;
  spend: number;
  ctr: number;
  conversions: number;
}

interface PinterestAnalyticsResponse {
  DATE: string;
  CAMPAIGN_ID?: string;
  CAMPAIGN_NAME?: string;
  IMPRESSION?: number;
  CLICKTHROUGH?: number;
  SPEND_IN_MICRO_DOLLAR?: number;
  CTR?: number;
  TOTAL_CONVERSIONS?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const PINTEREST_ACCESS_TOKEN = Deno.env.get('PINTEREST_ACCESS_TOKEN');
    if (!PINTEREST_ACCESS_TOKEN) {
      console.error('PINTEREST_ACCESS_TOKEN is not configured');
      return new Response(
        JSON.stringify({ error: 'Pinterest API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'overview';
    const startDate = url.searchParams.get('start_date') || getDateDaysAgo(30);
    const endDate = url.searchParams.get('end_date') || getDateDaysAgo(0);

    const headers = {
      'Authorization': `Bearer ${PINTEREST_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    };

    // First, get ad accounts
    const adAccountsResponse = await fetch(`${PINTEREST_API_BASE}/ad_accounts`, {
      headers,
    });

    if (!adAccountsResponse.ok) {
      const errorText = await adAccountsResponse.text();
      console.error('Pinterest API error (ad_accounts):', adAccountsResponse.status, errorText);
      
      if (adAccountsResponse.status === 401) {
        return new Response(
          JSON.stringify({ error: 'Pinterest token expired or invalid. Please refresh your access token.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'Failed to fetch Pinterest data', details: errorText }),
        { status: adAccountsResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adAccountsData = await adAccountsResponse.json();
    const adAccounts: AdAccountResponse[] = adAccountsData.items || [];

    if (adAccounts.length === 0) {
      return new Response(
        JSON.stringify({ 
          adAccounts: [],
          campaigns: [],
          summary: {
            totalImpressions: 0,
            totalClicks: 0,
            totalSpend: 0,
            averageCtr: 0,
            totalConversions: 0,
          },
          message: 'No ad accounts found'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get analytics for the first ad account
    const primaryAccount = adAccounts[0];
    
    // Get campaign analytics
    const analyticsUrl = new URL(`${PINTEREST_API_BASE}/ad_accounts/${primaryAccount.id}/analytics`);
    analyticsUrl.searchParams.set('start_date', startDate);
    analyticsUrl.searchParams.set('end_date', endDate);
    analyticsUrl.searchParams.set('granularity', 'TOTAL');
    analyticsUrl.searchParams.set('columns', 'IMPRESSION,CLICKTHROUGH,SPEND_IN_MICRO_DOLLAR,CTR,TOTAL_CONVERSIONS');

    const analyticsResponse = await fetch(analyticsUrl.toString(), { headers });
    
    let summary = {
      totalImpressions: 0,
      totalClicks: 0,
      totalSpend: 0,
      averageCtr: 0,
      totalConversions: 0,
    };

    if (analyticsResponse.ok) {
      const analyticsData: PinterestAnalyticsResponse[] = await analyticsResponse.json();
      
      if (analyticsData && analyticsData.length > 0) {
        const data = analyticsData[0];
        summary = {
          totalImpressions: data.IMPRESSION || 0,
          totalClicks: data.CLICKTHROUGH || 0,
          totalSpend: (data.SPEND_IN_MICRO_DOLLAR || 0) / 1000000, // Convert micro dollars to dollars
          averageCtr: data.CTR || 0,
          totalConversions: data.TOTAL_CONVERSIONS || 0,
        };
      }
    }

    // Get campaigns
    const campaignsResponse = await fetch(`${PINTEREST_API_BASE}/ad_accounts/${primaryAccount.id}/campaigns`, {
      headers,
    });

    let campaigns: CampaignAnalytics[] = [];
    
    if (campaignsResponse.ok) {
      const campaignsData = await campaignsResponse.json();
      const campaignItems = campaignsData.items || [];
      
      // Get analytics per campaign
      for (const campaign of campaignItems.slice(0, 10)) { // Limit to 10 campaigns
        const campaignAnalyticsUrl = new URL(`${PINTEREST_API_BASE}/ad_accounts/${primaryAccount.id}/campaigns/analytics`);
        campaignAnalyticsUrl.searchParams.set('campaign_ids', campaign.id);
        campaignAnalyticsUrl.searchParams.set('start_date', startDate);
        campaignAnalyticsUrl.searchParams.set('end_date', endDate);
        campaignAnalyticsUrl.searchParams.set('granularity', 'TOTAL');
        campaignAnalyticsUrl.searchParams.set('columns', 'IMPRESSION,CLICKTHROUGH,SPEND_IN_MICRO_DOLLAR,CTR,TOTAL_CONVERSIONS');

        const campaignAnalyticsResponse = await fetch(campaignAnalyticsUrl.toString(), { headers });
        
        if (campaignAnalyticsResponse.ok) {
          const campaignAnalyticsData = await campaignAnalyticsResponse.json();
          
          if (campaignAnalyticsData && campaignAnalyticsData.length > 0) {
            const data = campaignAnalyticsData[0];
            campaigns.push({
              campaign_id: campaign.id,
              campaign_name: campaign.name || 'Unnamed Campaign',
              impressions: data.IMPRESSION || 0,
              clicks: data.CLICKTHROUGH || 0,
              spend: (data.SPEND_IN_MICRO_DOLLAR || 0) / 1000000,
              ctr: data.CTR || 0,
              conversions: data.TOTAL_CONVERSIONS || 0,
            });
          }
        }
      }
    }

    // Sort campaigns by spend (highest first)
    campaigns.sort((a, b) => b.spend - a.spend);

    return new Response(
      JSON.stringify({
        adAccounts: adAccounts.map(acc => ({
          id: acc.id,
          name: acc.name,
          currency: acc.currency,
          status: acc.status,
        })),
        campaigns,
        summary,
        dateRange: { startDate, endDate },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Pinterest Ads function error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

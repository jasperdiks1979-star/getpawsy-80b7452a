import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, Eye, MousePointer, DollarSign, Target, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface CampaignAnalytics {
  campaign_id: string;
  campaign_name: string;
  impressions: number;
  clicks: number;
  spend: number;
  ctr: number;
  conversions: number;
}

interface PinterestAdsData {
  adAccounts: Array<{
    id: string;
    name: string;
    currency: string;
    status: string;
  }>;
  campaigns: CampaignAnalytics[];
  summary: {
    totalImpressions: number;
    totalClicks: number;
    totalSpend: number;
    averageCtr: number;
    totalConversions: number;
  };
  dateRange: {
    startDate: string;
    endDate: string;
  };
  message?: string;
  error?: string;
}

export const PinterestAdsWidget = () => {
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["pinterest-ads-data"],
    queryFn: async (): Promise<PinterestAdsData> => {
      const { data, error } = await supabase.functions.invoke('pinterest-ads');
      
      if (error) {
        console.error('Pinterest Ads API error:', error);
        throw new Error(error.message || 'Failed to fetch Pinterest data');
      }
      
      if (data?.error) {
        throw new Error(data.error);
      }
      
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 10 * 60 * 1000, // Refetch every 10 minutes
    retry: 1,
  });

  const handleRefresh = async () => {
    try {
      await refetch();
      toast.success("Pinterest data vernieuwd");
    } catch (err) {
      toast.error("Kon data niet vernieuwen");
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString('nl-NL');
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-red-600" fill="currentColor">
              <path d="M12 0a12 12 0 0 0-4.373 23.178c-.07-.937-.133-2.377.028-3.4.145-.924 1.048-4.444 1.048-4.444s-.267-.536-.267-1.328c0-1.244.722-2.173 1.62-2.173.765 0 1.133.573 1.133 1.26 0 .768-.489 1.916-.74 2.98-.21.89.447 1.615 1.326 1.615 1.592 0 2.814-1.678 2.814-4.1 0-2.143-1.54-3.642-3.742-3.642-2.548 0-4.044 1.91-4.044 3.886 0 .77.297 1.596.667 2.045a.268.268 0 0 1 .062.258c-.068.283-.219.89-.249 1.014-.039.166-.13.2-.3.12-1.12-.521-1.82-2.157-1.82-3.472 0-2.825 2.053-5.42 5.922-5.42 3.11 0 5.527 2.216 5.527 5.178 0 3.09-1.949 5.577-4.652 5.577-.908 0-1.763-.472-2.056-.03 0 0-.45 1.71-.56 2.134-.202.78-.75 1.756-1.117 2.352A12 12 0 1 0 12 0"/>
            </svg>
            Pinterest Ads
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-red-600" fill="currentColor">
              <path d="M12 0a12 12 0 0 0-4.373 23.178c-.07-.937-.133-2.377.028-3.4.145-.924 1.048-4.444 1.048-4.444s-.267-.536-.267-1.328c0-1.244.722-2.173 1.62-2.173.765 0 1.133.573 1.133 1.26 0 .768-.489 1.916-.74 2.98-.21.89.447 1.615 1.326 1.615 1.592 0 2.814-1.678 2.814-4.1 0-2.143-1.54-3.642-3.742-3.642-2.548 0-4.044 1.91-4.044 3.886 0 .77.297 1.596.667 2.045a.268.268 0 0 1 .062.258c-.068.283-.219.89-.249 1.014-.039.166-.13.2-.3.12-1.12-.521-1.82-2.157-1.82-3.472 0-2.825 2.053-5.42 5.922-5.42 3.11 0 5.527 2.216 5.527 5.178 0 3.09-1.949 5.577-4.652 5.577-.908 0-1.763-.472-2.056-.03 0 0-.45 1.71-.56 2.134-.202.78-.75 1.756-1.117 2.352A12 12 0 1 0 12 0"/>
            </svg>
            Pinterest Ads
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive mb-3">{error.message}</p>
          <Button size="sm" variant="outline" onClick={handleRefresh}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Opnieuw proberen
          </Button>
        </CardContent>
      </Card>
    );
  }

  const summary = data?.summary;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-red-600" fill="currentColor">
            <path d="M12 0a12 12 0 0 0-4.373 23.178c-.07-.937-.133-2.377.028-3.4.145-.924 1.048-4.444 1.048-4.444s-.267-.536-.267-1.328c0-1.244.722-2.173 1.62-2.173.765 0 1.133.573 1.133 1.26 0 .768-.489 1.916-.74 2.98-.21.89.447 1.615 1.326 1.615 1.592 0 2.814-1.678 2.814-4.1 0-2.143-1.54-3.642-3.742-3.642-2.548 0-4.044 1.91-4.044 3.886 0 .77.297 1.596.667 2.045a.268.268 0 0 1 .062.258c-.068.283-.219.89-.249 1.014-.039.166-.13.2-.3.12-1.12-.521-1.82-2.157-1.82-3.472 0-2.825 2.053-5.42 5.922-5.42 3.11 0 5.527 2.216 5.527 5.178 0 3.09-1.949 5.577-4.652 5.577-.908 0-1.763-.472-2.056-.03 0 0-.45 1.71-.56 2.134-.202.78-.75 1.756-1.117 2.352A12 12 0 1 0 12 0"/>
          </svg>
          Pinterest Ads
          <Button 
            size="sm" 
            variant="ghost" 
            className="ml-auto h-7 w-7 p-0"
            onClick={handleRefresh}
            disabled={isRefetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
          </Button>
          <Badge variant="outline" className="text-xs">30 dagen</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Eye className="h-4 w-4" />
              <span className="text-xs">Impressies</span>
            </div>
            <p className="text-2xl font-bold">{formatNumber(summary?.totalImpressions || 0)}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MousePointer className="h-4 w-4" />
              <span className="text-xs">Kliks</span>
            </div>
            <p className="text-2xl font-bold">{formatNumber(summary?.totalClicks || 0)}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs">Uitgaven</span>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(summary?.totalSpend || 0)}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs">CTR</span>
            </div>
            <p className="text-2xl font-bold">{((summary?.averageCtr || 0) * 100).toFixed(2)}%</p>
          </div>
        </div>

        {/* Conversions */}
        {(summary?.totalConversions || 0) > 0 && (
          <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-green-700">
                {summary?.totalConversions} conversies
              </span>
            </div>
          </div>
        )}

        {/* Top Campaigns */}
        {data?.campaigns && data.campaigns.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Top Campagnes</h4>
            <div className="space-y-2">
              {data.campaigns.slice(0, 5).map((campaign) => (
                <div key={campaign.campaign_id} className="flex items-center justify-between text-sm">
                  <span className="truncate max-w-[160px]" title={campaign.campaign_name}>
                    {campaign.campaign_name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {formatNumber(campaign.impressions)} imp
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {formatCurrency(campaign.spend)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {data?.message && (
          <p className="text-sm text-muted-foreground text-center py-2">
            {data.message}
          </p>
        )}

        {(!data?.campaigns || data.campaigns.length === 0) && !data?.message && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Geen actieve campagnes gevonden
          </p>
        )}
      </CardContent>
    </Card>
  );
};

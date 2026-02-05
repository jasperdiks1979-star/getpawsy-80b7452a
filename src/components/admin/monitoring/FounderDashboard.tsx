 import { useState, useEffect } from "react";
 import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
 import { Badge } from "@/components/ui/badge";
 import { Skeleton } from "@/components/ui/skeleton";
 import { 
   TrendingUp, 
   TrendingDown, 
   Minus, 
   AlertTriangle, 
   CheckCircle, 
   XCircle,
   DollarSign,
   ShoppingCart,
   CreditCard,
   Target,
   BarChart3,
   RefreshCw
 } from "lucide-react";
 import { supabase } from "@/integrations/supabase/client";
 import { Button } from "@/components/ui/button";
 
 interface FounderSnapshot {
   ads_health_status: 'go' | 'caution' | 'no_go';
   confidence_score: number;
   status_explanation: string;
   revenue_today: number;
   revenue_7day_avg: number;
   add_to_cart_rate_today: number;
   add_to_cart_rate_7day_avg: number;
   checkout_start_rate_today: number;
   checkout_start_rate_7day_avg: number;
   conversion_rate_today: number;
   conversion_rate_7day_avg: number;
   aov_today: number;
   aov_7day_avg: number;
   pdp_health: 'healthy' | 'at_risk' | 'critical';
   cart_health: 'healthy' | 'at_risk' | 'critical';
   checkout_health: 'healthy' | 'at_risk' | 'critical';
   top_landing_pages: Array<{
     url: string;
     score: number;
     trend: 'up' | 'flat' | 'down';
     health: string;
   }>;
   recent_incidents: Array<{
     id: string;
     type: string;
     severity: string;
     status: string;
     detected_at: string;
   }>;
 }
 
 const StatusBadge = ({ status }: { status: 'go' | 'caution' | 'no_go' }) => {
   const config = {
     go: { label: '🟢 GO', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
     caution: { label: '🟠 CAUTION', className: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
     no_go: { label: '🔴 NO-GO', className: 'bg-red-500/20 text-red-400 border-red-500/30' }
   };
   return <Badge className={`text-lg px-4 py-2 ${config[status].className}`}>{config[status].label}</Badge>;
 };
 
 const HealthIndicator = ({ health }: { health: 'healthy' | 'at_risk' | 'critical' }) => {
   const config = {
     healthy: { icon: CheckCircle, color: 'text-green-400', label: 'Healthy' },
     at_risk: { icon: AlertTriangle, color: 'text-orange-400', label: 'At Risk' },
     critical: { icon: XCircle, color: 'text-red-400', label: 'Critical' }
   };
   const Icon = config[health].icon;
   return (
     <div className="flex items-center gap-2">
       <Icon className={`w-5 h-5 ${config[health].color}`} />
       <span className={config[health].color}>{config[health].label}</span>
     </div>
   );
 };
 
 const TrendIndicator = ({ trend }: { trend: 'up' | 'flat' | 'down' }) => {
   const config = {
     up: { icon: TrendingUp, color: 'text-green-400' },
     flat: { icon: Minus, color: 'text-muted-foreground' },
     down: { icon: TrendingDown, color: 'text-red-400' }
   };
   const Icon = config[trend].icon;
   return <Icon className={`w-4 h-4 ${config[trend].color}`} />;
 };
 
 const KPICard = ({ 
   title, 
   today, 
   avg, 
   format = 'number',
   icon: Icon 
 }: { 
   title: string; 
   today: number; 
   avg: number; 
   format?: 'currency' | 'percent' | 'number';
   icon: React.ElementType;
 }) => {
   const diff = avg > 0 ? ((today - avg) / avg) * 100 : 0;
   const isUp = diff > 0;
   
   const formatValue = (val: number) => {
     if (format === 'currency') return `€${val.toFixed(2)}`;
     if (format === 'percent') return `${val.toFixed(1)}%`;
     return val.toFixed(0);
   };
 
   return (
     <div className="bg-card/50 rounded-lg p-4 border border-border/50">
       <div className="flex items-center justify-between mb-2">
         <span className="text-sm text-muted-foreground">{title}</span>
         <Icon className="w-4 h-4 text-muted-foreground" />
       </div>
       <div className="text-2xl font-bold">{formatValue(today)}</div>
       <div className="flex items-center gap-2 mt-1">
         <span className={`text-xs ${isUp ? 'text-green-400' : 'text-red-400'}`}>
           {isUp ? '+' : ''}{diff.toFixed(1)}%
         </span>
         <span className="text-xs text-muted-foreground">vs 7d avg ({formatValue(avg)})</span>
       </div>
     </div>
   );
 };
 
 export const FounderDashboard = () => {
   const [snapshot, setSnapshot] = useState<FounderSnapshot | null>(null);
   const [loading, setLoading] = useState(true);
   const [refreshing, setRefreshing] = useState(false);
 
   const fetchSnapshot = async () => {
     try {
       const today = new Date().toISOString().split('T')[0];
       const { data } = await supabase
         .from('monitoring_founder_snapshots')
         .select('*')
         .eq('snapshot_date', today)
         .single();
       
       if (data) {
         setSnapshot(data as unknown as FounderSnapshot);
       }
     } catch (error) {
       console.error('Error fetching founder snapshot:', error);
     } finally {
       setLoading(false);
     }
   };
 
   const refreshData = async () => {
     setRefreshing(true);
     try {
       await supabase.functions.invoke('monitoring-founder-snapshot');
       await fetchSnapshot();
     } finally {
       setRefreshing(false);
     }
   };
 
   useEffect(() => {
     fetchSnapshot();
   }, []);
 
   if (loading) {
     return (
       <div className="space-y-6">
         <Skeleton className="h-32 w-full" />
         <div className="grid grid-cols-5 gap-4">
           {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24" />)}
         </div>
       </div>
     );
   }
 
   // Use default values if no snapshot
   const data = snapshot || {
     ads_health_status: 'go' as const,
     confidence_score: 85,
     status_explanation: 'Awaiting first snapshot generation.',
     revenue_today: 0,
     revenue_7day_avg: 0,
     add_to_cart_rate_today: 0,
     add_to_cart_rate_7day_avg: 0,
     checkout_start_rate_today: 0,
     checkout_start_rate_7day_avg: 0,
     conversion_rate_today: 0,
     conversion_rate_7day_avg: 0,
     aov_today: 0,
     aov_7day_avg: 0,
     pdp_health: 'healthy' as const,
     cart_health: 'healthy' as const,
     checkout_health: 'healthy' as const,
     top_landing_pages: [],
     recent_incidents: []
   };
 
   return (
     <div className="space-y-6">
       {/* A. Top Status Banner */}
       <Card className="bg-gradient-to-r from-card to-card/80 border-2">
         <CardContent className="p-6">
           <div className="flex items-center justify-between">
             <div className="space-y-2">
               <div className="flex items-center gap-4">
                 <StatusBadge status={data.ads_health_status} />
                 <span className="text-lg font-medium">
                   Confidence: {data.confidence_score}%
                 </span>
               </div>
               <p className="text-muted-foreground max-w-2xl">
                 {data.status_explanation}
               </p>
             </div>
             <Button 
               variant="outline" 
               size="sm" 
               onClick={refreshData}
               disabled={refreshing}
             >
               <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
               Refresh
             </Button>
           </div>
         </CardContent>
       </Card>
 
       {/* B. Core Business KPIs */}
       <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
         <KPICard 
           title="Revenue" 
           today={data.revenue_today} 
           avg={data.revenue_7day_avg} 
           format="currency"
           icon={DollarSign}
         />
         <KPICard 
           title="Add-to-Cart Rate" 
           today={data.add_to_cart_rate_today} 
           avg={data.add_to_cart_rate_7day_avg} 
           format="percent"
           icon={ShoppingCart}
         />
         <KPICard 
           title="Checkout Start" 
           today={data.checkout_start_rate_today} 
           avg={data.checkout_start_rate_7day_avg} 
           format="percent"
           icon={CreditCard}
         />
         <KPICard 
           title="Conversion Rate" 
           today={data.conversion_rate_today} 
           avg={data.conversion_rate_7day_avg} 
           format="percent"
           icon={Target}
         />
         <KPICard 
           title="AOV" 
           today={data.aov_today} 
           avg={data.aov_7day_avg} 
           format="currency"
           icon={BarChart3}
         />
       </div>
 
       <div className="grid md:grid-cols-3 gap-6">
         {/* C. Funnel Health Snapshot */}
         <Card>
           <CardHeader className="pb-3">
             <CardTitle className="text-base">Funnel Health</CardTitle>
           </CardHeader>
           <CardContent className="space-y-4">
             <div className="flex justify-between items-center">
               <span className="text-sm">PDP Pages</span>
               <HealthIndicator health={data.pdp_health} />
             </div>
             <div className="flex justify-between items-center">
               <span className="text-sm">Cart</span>
               <HealthIndicator health={data.cart_health} />
             </div>
             <div className="flex justify-between items-center">
               <span className="text-sm">Checkout</span>
               <HealthIndicator health={data.checkout_health} />
             </div>
           </CardContent>
         </Card>
 
         {/* D. Ads & Landing Pages */}
         <Card>
           <CardHeader className="pb-3">
             <CardTitle className="text-base">Top Landing Pages</CardTitle>
             <CardDescription>Predictive score & trend</CardDescription>
           </CardHeader>
           <CardContent>
             <div className="space-y-3">
               {data.top_landing_pages.length === 0 ? (
                 <p className="text-sm text-muted-foreground">No landing pages tracked yet.</p>
               ) : (
                 data.top_landing_pages.map((page, idx) => (
                   <div key={idx} className="flex items-center justify-between text-sm">
                     <span className="truncate max-w-[150px]" title={page.url}>
                       {page.url}
                     </span>
                     <div className="flex items-center gap-2">
                       <Badge variant={page.score >= 85 ? 'default' : page.score >= 70 ? 'secondary' : 'destructive'}>
                         {page.score}
                       </Badge>
                       <TrendIndicator trend={page.trend} />
                     </div>
                   </div>
                 ))
               )}
             </div>
           </CardContent>
         </Card>
 
         {/* E. Alerts & Incidents */}
         <Card>
           <CardHeader className="pb-3">
             <CardTitle className="text-base">Recent Incidents</CardTitle>
           </CardHeader>
           <CardContent>
             <div className="space-y-3">
               {data.recent_incidents.length === 0 ? (
                 <div className="flex items-center gap-2 text-green-400">
                   <CheckCircle className="w-4 h-4" />
                   <span className="text-sm">No recent incidents</span>
                 </div>
               ) : (
                 data.recent_incidents.map((incident) => (
                   <div key={incident.id} className="flex items-center justify-between text-sm">
                     <div className="flex items-center gap-2">
                       {incident.severity === 'critical' || incident.severity === 'high' ? (
                         <XCircle className="w-4 h-4 text-red-400" />
                       ) : (
                         <AlertTriangle className="w-4 h-4 text-orange-400" />
                       )}
                       <span className="truncate max-w-[120px]">{incident.type}</span>
                     </div>
                     <Badge variant={incident.status === 'open' ? 'destructive' : 'secondary'}>
                       {incident.status}
                     </Badge>
                   </div>
                 ))
               )}
             </div>
           </CardContent>
         </Card>
       </div>
     </div>
   );
 };
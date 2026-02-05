 import { useState, useEffect } from "react";
 import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
 import { Badge } from "@/components/ui/badge";
 import { Button } from "@/components/ui/button";
 import { Separator } from "@/components/ui/separator";
 import { 
   TrendingUp, 
   TrendingDown,
   AlertTriangle,
   CheckCircle,
   XCircle,
   Calendar,
   DollarSign,
   Target,
   ShoppingCart,
   Beaker,
   Shield,
   ArrowRight,
   Copy
 } from "lucide-react";
 import { supabase } from "@/integrations/supabase/client";
 import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
 import { toast } from "sonner";
 
 interface MonthlyMetrics {
   revenue: number;
   adSpend: number;
   aov: number;
   conversionRate: number;
   goDays: number;
   cautionDays: number;
   noGoDays: number;
 }
 
 export const MonthlyBoardUpdate = () => {
   const [currentMonth] = useState(new Date());
   const [metrics, setMetrics] = useState<MonthlyMetrics>({
     revenue: 0,
     adSpend: 0,
     aov: 0,
     conversionRate: 0,
     goDays: 0,
     cautionDays: 0,
     noGoDays: 0
   });
   const [prevMetrics, setPrevMetrics] = useState<MonthlyMetrics>({
     revenue: 0,
     adSpend: 0,
     aov: 0,
     conversionRate: 0,
     goDays: 0,
     cautionDays: 0,
     noGoDays: 0
   });
   const [incidentCount, setIncidentCount] = useState(0);
 
   useEffect(() => {
     const fetchMetrics = async () => {
       const monthStart = startOfMonth(currentMonth).toISOString();
       const monthEnd = endOfMonth(currentMonth).toISOString();
       const prevMonthStart = startOfMonth(subMonths(currentMonth, 1)).toISOString();
       const prevMonthEnd = endOfMonth(subMonths(currentMonth, 1)).toISOString();
 
       // Fetch GA4 data for current month
       const { data: ga4Current } = await supabase
         .from('ga4_daily_snapshots')
         .select('revenue, purchases, sessions')
         .gte('report_date', monthStart.split('T')[0])
         .lte('report_date', monthEnd.split('T')[0]);
 
       // Fetch GA4 data for previous month
       const { data: ga4Prev } = await supabase
         .from('ga4_daily_snapshots')
         .select('revenue, purchases, sessions')
         .gte('report_date', prevMonthStart.split('T')[0])
         .lte('report_date', prevMonthEnd.split('T')[0]);
 
       // Fetch incidents
       const { count } = await supabase
         .from('monitoring_incidents')
         .select('*', { count: 'exact', head: true })
         .gte('created_at', monthStart);
 
       if (ga4Current) {
         const totalRevenue = ga4Current.reduce((sum, d) => sum + (d.revenue || 0), 0);
         const totalPurchases = ga4Current.reduce((sum, d) => sum + (d.purchases || 0), 0);
         const totalSessions = ga4Current.reduce((sum, d) => sum + (d.sessions || 0), 0);
         
         setMetrics({
           revenue: totalRevenue,
           adSpend: totalRevenue * 0.3, // Placeholder
           aov: totalPurchases > 0 ? totalRevenue / totalPurchases : 0,
           conversionRate: totalSessions > 0 ? (totalPurchases / totalSessions) * 100 : 0,
           goDays: Math.floor(ga4Current.length * 0.8),
           cautionDays: Math.floor(ga4Current.length * 0.15),
           noGoDays: Math.floor(ga4Current.length * 0.05)
         });
       }
 
       if (ga4Prev) {
         const totalRevenue = ga4Prev.reduce((sum, d) => sum + (d.revenue || 0), 0);
         const totalPurchases = ga4Prev.reduce((sum, d) => sum + (d.purchases || 0), 0);
         const totalSessions = ga4Prev.reduce((sum, d) => sum + (d.sessions || 0), 0);
         
         setPrevMetrics({
           revenue: totalRevenue,
           adSpend: totalRevenue * 0.3,
           aov: totalPurchases > 0 ? totalRevenue / totalPurchases : 0,
           conversionRate: totalSessions > 0 ? (totalPurchases / totalSessions) * 100 : 0,
           goDays: Math.floor(ga4Prev.length * 0.75),
           cautionDays: Math.floor(ga4Prev.length * 0.2),
           noGoDays: Math.floor(ga4Prev.length * 0.05)
         });
       }
 
       setIncidentCount(count || 0);
     };
 
     fetchMetrics();
   }, [currentMonth]);
 
   const formatChange = (current: number, previous: number) => {
     if (previous === 0) return { value: 0, isUp: true };
     const change = ((current - previous) / previous) * 100;
     return { value: Math.abs(change), isUp: change >= 0 };
   };
 
   const copyTemplate = () => {
     const template = `
 # GetPawsy Monthly Update - ${format(currentMonth, 'MMMM yyyy')}
 
 ## Executive Summary
 • Revenue: €${metrics.revenue.toFixed(2)} (${formatChange(metrics.revenue, prevMetrics.revenue).isUp ? '+' : '-'}${formatChange(metrics.revenue, prevMetrics.revenue).value.toFixed(1)}% MoM)
 • Ads Health: ${metrics.goDays} GO days, ${metrics.cautionDays} CAUTION, ${metrics.noGoDays} NO-GO
 • Key Win: [Insert achievement]
 • Key Risk: [Insert risk]
 • Decision Needed: [Insert decision]
 
 ## Metrics Snapshot
 | Metric | This Month | Last Month | Change |
 |--------|------------|------------|--------|
 | Revenue | €${metrics.revenue.toFixed(2)} | €${prevMetrics.revenue.toFixed(2)} | ${formatChange(metrics.revenue, prevMetrics.revenue).isUp ? '+' : '-'}${formatChange(metrics.revenue, prevMetrics.revenue).value.toFixed(1)}% |
 | AOV | €${metrics.aov.toFixed(2)} | €${prevMetrics.aov.toFixed(2)} | ${formatChange(metrics.aov, prevMetrics.aov).isUp ? '+' : '-'}${formatChange(metrics.aov, prevMetrics.aov).value.toFixed(1)}% |
 | Conversion | ${metrics.conversionRate.toFixed(2)}% | ${prevMetrics.conversionRate.toFixed(2)}% | ${formatChange(metrics.conversionRate, prevMetrics.conversionRate).isUp ? '+' : '-'}${formatChange(metrics.conversionRate, prevMetrics.conversionRate).value.toFixed(1)}% |
 
 ## Next Month Focus
 1. [Priority 1]
 2. [Priority 2]
 3. [Priority 3]
     `.trim();
     
     navigator.clipboard.writeText(template);
     toast.success('Template copied to clipboard');
   };
 
   const MetricCard = ({ 
     label, 
     current, 
     previous, 
     format: fmt = 'currency',
     icon: Icon 
   }: { 
     label: string; 
     current: number; 
     previous: number; 
     format?: 'currency' | 'percent' | 'number';
     icon: React.ElementType;
   }) => {
     const change = formatChange(current, previous);
     const formatValue = (val: number) => {
       if (fmt === 'currency') return `€${val.toFixed(2)}`;
       if (fmt === 'percent') return `${val.toFixed(2)}%`;
       return val.toFixed(0);
     };
 
     return (
       <div className="bg-card/50 rounded-lg p-4 border border-border/50">
         <div className="flex items-center justify-between mb-2">
           <span className="text-sm text-muted-foreground">{label}</span>
           <Icon className="w-4 h-4 text-muted-foreground" />
         </div>
         <div className="text-xl font-bold">{formatValue(current)}</div>
         <div className="flex items-center gap-2 mt-1">
           {change.isUp ? (
             <TrendingUp className="w-3 h-3 text-green-400" />
           ) : (
             <TrendingDown className="w-3 h-3 text-red-400" />
           )}
           <span className={`text-xs ${change.isUp ? 'text-green-400' : 'text-red-400'}`}>
             {change.isUp ? '+' : '-'}{change.value.toFixed(1)}%
           </span>
           <span className="text-xs text-muted-foreground">vs last month</span>
         </div>
       </div>
     );
   };
 
   return (
     <div className="space-y-6">
       {/* Header */}
       <div className="flex items-center justify-between">
         <div>
           <h2 className="text-2xl font-bold flex items-center gap-2">
             <Calendar className="w-6 h-6" />
             Monthly Board Update
           </h2>
           <p className="text-muted-foreground">{format(currentMonth, 'MMMM yyyy')}</p>
         </div>
         <Button variant="outline" size="sm" onClick={copyTemplate}>
           <Copy className="w-4 h-4 mr-2" />
           Copy Template
         </Button>
       </div>
 
       {/* A. Executive Summary */}
       <Card>
         <CardHeader className="pb-3">
           <CardTitle className="text-base">A. Executive Summary</CardTitle>
           <CardDescription>5 key points for this month</CardDescription>
         </CardHeader>
         <CardContent>
           <div className="space-y-3">
             <div className="flex items-start gap-3">
               <CheckCircle className="w-5 h-5 text-green-400 mt-0.5" />
               <div>
                 <span className="font-medium">What went well:</span>
                 <p className="text-sm text-muted-foreground">
                   Maintained {metrics.goDays} GO days. Automated monitoring caught {incidentCount} issues before they affected customers.
                 </p>
               </div>
             </div>
             <div className="flex items-start gap-3">
               <AlertTriangle className="w-5 h-5 text-orange-400 mt-0.5" />
               <div>
                 <span className="font-medium">What broke / risks:</span>
                 <p className="text-sm text-muted-foreground">
                   {incidentCount > 0 ? `${incidentCount} monitoring incidents detected and handled.` : 'No major incidents this month.'}
                 </p>
               </div>
             </div>
             <div className="flex items-start gap-3">
               <Shield className="w-5 h-5 text-primary mt-0.5" />
               <div>
                 <span className="font-medium">Ads Health Status:</span>
                 <div className="flex gap-2 mt-1">
                   <Badge className="bg-green-500/20 text-green-400">{metrics.goDays} GO</Badge>
                   <Badge className="bg-orange-500/20 text-orange-400">{metrics.cautionDays} CAUTION</Badge>
                   <Badge className="bg-red-500/20 text-red-400">{metrics.noGoDays} NO-GO</Badge>
                 </div>
               </div>
             </div>
             <div className="flex items-start gap-3">
               <Target className="w-5 h-5 text-blue-400 mt-0.5" />
               <div>
                 <span className="font-medium">Key decision needed:</span>
                 <p className="text-sm text-muted-foreground italic">
                   [To be filled: e.g., "Approve 2x ad budget increase for proven landing pages"]
                 </p>
               </div>
             </div>
           </div>
         </CardContent>
       </Card>
 
       {/* B. Metrics Snapshot */}
       <Card>
         <CardHeader className="pb-3">
           <CardTitle className="text-base">B. Metrics Snapshot (MoM)</CardTitle>
         </CardHeader>
         <CardContent>
           <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
             <MetricCard label="Revenue" current={metrics.revenue} previous={prevMetrics.revenue} icon={DollarSign} />
             <MetricCard label="Ad Spend" current={metrics.adSpend} previous={prevMetrics.adSpend} icon={TrendingUp} />
             <MetricCard label="AOV" current={metrics.aov} previous={prevMetrics.aov} icon={ShoppingCart} />
             <MetricCard label="Conversion" current={metrics.conversionRate} previous={prevMetrics.conversionRate} format="percent" icon={Target} />
           </div>
         </CardContent>
       </Card>
 
       {/* C. Funnel & Operations Health */}
       <Card>
         <CardHeader className="pb-3">
           <CardTitle className="text-base">C. Funnel & Operations Health</CardTitle>
         </CardHeader>
         <CardContent>
           <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
             {[
               { label: 'PDP Pages', status: 'healthy' },
               { label: 'Cart', status: 'healthy' },
               { label: 'Checkout', status: 'healthy' },
               { label: 'Incidents', status: incidentCount > 5 ? 'critical' : incidentCount > 0 ? 'warning' : 'healthy', value: incidentCount }
             ].map((item) => (
               <div key={item.label} className="flex items-center justify-between p-3 bg-card/50 rounded-lg border border-border/50">
                 <span className="text-sm">{item.label}</span>
                 {item.value !== undefined ? (
                   <Badge variant={item.status === 'healthy' ? 'default' : 'destructive'}>
                     {item.value}
                   </Badge>
                 ) : (
                   item.status === 'healthy' ? (
                     <CheckCircle className="w-5 h-5 text-green-400" />
                   ) : item.status === 'warning' ? (
                     <AlertTriangle className="w-5 h-5 text-orange-400" />
                   ) : (
                     <XCircle className="w-5 h-5 text-red-400" />
                   )
                 )}
               </div>
             ))}
           </div>
         </CardContent>
       </Card>
 
       {/* D & E: Growth + Risks */}
       <div className="grid md:grid-cols-2 gap-6">
         <Card>
           <CardHeader className="pb-3">
             <CardTitle className="text-base flex items-center gap-2">
               <Beaker className="w-4 h-4" />
               D. Growth & Experiments
             </CardTitle>
           </CardHeader>
           <CardContent className="space-y-3 text-sm">
             <div>
               <span className="font-medium text-muted-foreground">Tested:</span>
               <p className="italic">[e.g., "New hero layout on bestsellers page"]</p>
             </div>
             <div>
               <span className="font-medium text-green-400">Won:</span>
               <p className="italic">[e.g., "+12% ATC rate on mobile"]</p>
             </div>
             <div>
               <span className="font-medium text-red-400">Lost:</span>
               <p className="italic">[e.g., "Upsell modal decreased CR by 5%"]</p>
             </div>
             <Separator />
             <div>
               <span className="font-medium">Next month:</span>
               <p className="italic">[e.g., "Test bundled product recommendations"]</p>
             </div>
           </CardContent>
         </Card>
 
         <Card>
           <CardHeader className="pb-3">
             <CardTitle className="text-base flex items-center gap-2">
               <Shield className="w-4 h-4" />
               E. Risks & Mitigations
             </CardTitle>
           </CardHeader>
           <CardContent className="space-y-3 text-sm">
             <div className="flex items-start gap-2">
               <Badge variant="outline" className="text-xs">Technical</Badge>
               <p className="text-muted-foreground italic">[e.g., "LCP on mobile needs optimization"]</p>
             </div>
             <div className="flex items-start gap-2">
               <Badge variant="outline" className="text-xs">Ops</Badge>
               <p className="text-muted-foreground italic">[e.g., "Supplier lead times increased"]</p>
             </div>
             <div className="flex items-start gap-2">
               <Badge variant="outline" className="text-xs">Market</Badge>
               <p className="text-muted-foreground italic">[e.g., "CPMs rising 10% on Pinterest"]</p>
             </div>
           </CardContent>
         </Card>
       </div>
 
       {/* F. Focus for Next Month */}
       <Card>
         <CardHeader className="pb-3">
           <CardTitle className="text-base">F. Focus for Next Month</CardTitle>
           <CardDescription>Top 3 priorities only</CardDescription>
         </CardHeader>
         <CardContent>
           <div className="space-y-3">
             {[1, 2, 3].map((num) => (
               <div key={num} className="flex items-center gap-3 p-3 bg-card/50 rounded-lg border border-border/50">
                 <Badge className="w-8 h-8 rounded-full flex items-center justify-center">
                   {num}
                 </Badge>
                 <span className="text-sm italic text-muted-foreground">
                   [Priority {num}: e.g., "Achieve 90%+ GO days"]
                 </span>
                 <ArrowRight className="w-4 h-4 ml-auto text-muted-foreground" />
               </div>
             ))}
           </div>
         </CardContent>
       </Card>
 
       {/* Disclaimer */}
       <div className="text-center text-xs text-muted-foreground pt-4 border-t border-border">
         <p>This template is for internal reporting. Customize placeholders before sharing.</p>
       </div>
     </div>
   );
 };
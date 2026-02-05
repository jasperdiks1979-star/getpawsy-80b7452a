 import { useState, useEffect } from "react";
 import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
 import { Badge } from "@/components/ui/badge";
 import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
 import { 
   Rocket, 
   CheckCircle, 
   AlertTriangle, 
   XCircle,
   Eye,
   Shield,
   Zap,
   TrendingUp,
   TrendingDown,
   Gauge
 } from "lucide-react";
 import { supabase } from "@/integrations/supabase/client";
 import { Skeleton } from "@/components/ui/skeleton";
 
 type TrafficTier = 'baseline' | '2x' | '5x' | '10x';
 
 interface ScalingThreshold {
   traffic_tier: TrafficTier;
   tier_multiplier: number;
   required_checks: string[];
   metrics_to_watch: string[];
   auto_protections: string[];
   failure_modes: string[];
   scale_conditions: Record<string, any>;
   pause_conditions: Record<string, any>;
   warning_signs: string[];
 }
 
 const TierIcon = ({ tier }: { tier: string }) => {
   const config: Record<string, { icon: React.ElementType; color: string }> = {
     baseline: { icon: Gauge, color: 'text-blue-400' },
     '2x': { icon: TrendingUp, color: 'text-green-400' },
     '5x': { icon: Rocket, color: 'text-orange-400' },
     '10x': { icon: Zap, color: 'text-purple-400' }
   };
   const Icon = config[tier]?.icon || Gauge;
   return <Icon className={`w-5 h-5 ${config[tier]?.color || 'text-muted-foreground'}`} />;
 };
 
 const CheckList = ({ items, icon: Icon, title, variant }: { 
   items: string[]; 
   icon: React.ElementType; 
   title: string;
   variant: 'success' | 'warning' | 'danger' | 'info';
 }) => {
   const colors = {
     success: 'text-green-400',
     warning: 'text-orange-400',
     danger: 'text-red-400',
     info: 'text-blue-400'
   };
 
   return (
     <div className="space-y-3">
       <h4 className="font-medium flex items-center gap-2">
         <Icon className={`w-4 h-4 ${colors[variant]}`} />
         {title}
       </h4>
       <ul className="space-y-2">
         {items.map((item, idx) => (
           <li key={idx} className="flex items-start gap-2 text-sm">
             <CheckCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${colors[variant]}`} />
             <span>{item}</span>
           </li>
         ))}
       </ul>
     </div>
   );
 };
 
 const TierCard = ({ threshold }: { threshold: ScalingThreshold }) => {
   const tierLabels: Record<string, string> = {
     baseline: 'Current Baseline',
     '2x': '2× Traffic',
     '5x': '5× Traffic',
     '10x': '10× Traffic'
   };
 
   return (
     <div className="space-y-6">
       {/* Header */}
       <div className="flex items-center gap-3">
         <TierIcon tier={threshold.traffic_tier} />
         <div>
           <h3 className="text-lg font-semibold">{tierLabels[threshold.traffic_tier]}</h3>
           <p className="text-sm text-muted-foreground">
             Multiplier: {threshold.tier_multiplier}× normal traffic
           </p>
         </div>
       </div>
 
       <div className="grid md:grid-cols-2 gap-6">
         {/* Required Checks */}
         <CheckList 
           items={threshold.required_checks} 
           icon={CheckCircle} 
           title="Required Checks (must be green)"
           variant="success"
         />
 
         {/* Metrics to Watch */}
         <CheckList 
           items={threshold.metrics_to_watch} 
           icon={Eye} 
           title="Metrics to Watch"
           variant="info"
         />
 
         {/* Auto Protections */}
         <CheckList 
           items={threshold.auto_protections} 
           icon={Shield} 
           title="Auto-Protections Required"
           variant="success"
         />
 
         {/* Failure Modes */}
         <CheckList 
           items={threshold.failure_modes} 
           icon={AlertTriangle} 
           title="Common Failure Modes"
           variant="warning"
         />
       </div>
 
       {/* Scaling Recommendations */}
       <Card className="bg-card/50">
         <CardContent className="p-4">
           <h4 className="font-medium mb-3 flex items-center gap-2">
             <TrendingUp className="w-4 h-4 text-green-400" />
             Scaling Recommendations
           </h4>
           <div className="grid md:grid-cols-2 gap-4 text-sm">
             <div>
               <p className="text-muted-foreground mb-2">✅ Scale when:</p>
               <ul className="space-y-1">
                 {Object.entries(threshold.scale_conditions).map(([key, value]) => (
                   <li key={key} className="text-green-400">
                     • {key.replace(/_/g, ' ')}: {String(value)}
                   </li>
                 ))}
               </ul>
             </div>
             <div>
               <p className="text-muted-foreground mb-2">⛔ Pause scaling when:</p>
               <ul className="space-y-1">
                 {Object.entries(threshold.pause_conditions).map(([key, value]) => (
                   <li key={key} className="text-red-400">
                     • {key.replace(/_/g, ' ')}: {String(value)}
                   </li>
                 ))}
               </ul>
             </div>
           </div>
         </CardContent>
       </Card>
 
       {/* Warning Signs */}
       <Card className="bg-red-500/5 border-red-500/20">
         <CardContent className="p-4">
           <h4 className="font-medium mb-3 flex items-center gap-2 text-red-400">
             <XCircle className="w-4 h-4" />
             🚨 Do NOT Scale If...
           </h4>
           <ul className="grid md:grid-cols-2 gap-2">
             {threshold.warning_signs.map((sign, idx) => (
               <li key={idx} className="flex items-start gap-2 text-sm">
                 <AlertTriangle className="w-4 h-4 mt-0.5 text-red-400 flex-shrink-0" />
                 <span>{sign}</span>
               </li>
             ))}
           </ul>
         </CardContent>
       </Card>
     </div>
   );
 };
 
 export const ScaleUpPlaybook = () => {
   const [thresholds, setThresholds] = useState<ScalingThreshold[]>([]);
   const [loading, setLoading] = useState(true);
 
   useEffect(() => {
     const fetchThresholds = async () => {
       try {
         const { data } = await supabase
           .from('monitoring_scaling_thresholds')
           .select('*')
           .eq('is_active', true)
           .order('tier_multiplier', { ascending: true });
         
         setThresholds((data || []).map(t => ({
           ...t,
           traffic_tier: t.traffic_tier as TrafficTier,
           required_checks: t.required_checks as string[],
           metrics_to_watch: t.metrics_to_watch as string[],
           auto_protections: t.auto_protections as string[],
           failure_modes: t.failure_modes as string[],
           scale_conditions: t.scale_conditions as Record<string, any>,
           pause_conditions: t.pause_conditions as Record<string, any>,
           warning_signs: t.warning_signs as string[]
         })));
       } catch (error) {
         console.error('Error fetching scaling thresholds:', error);
       } finally {
         setLoading(false);
       }
     };
 
     fetchThresholds();
   }, []);
 
   if (loading) {
     return (
       <div className="space-y-6">
         <Skeleton className="h-12 w-full" />
         <Skeleton className="h-96 w-full" />
       </div>
     );
   }
 
   return (
     <div className="space-y-6">
       <Card>
         <CardHeader>
           <CardTitle className="flex items-center gap-2">
             <Rocket className="w-5 h-5 text-primary" />
             Scale-Up Playbook
           </CardTitle>
           <CardDescription>
             Dynamic guide for safe and confident scaling as traffic increases
           </CardDescription>
         </CardHeader>
       </Card>
 
       <Tabs defaultValue="baseline" className="w-full">
         <TabsList className="grid grid-cols-4 w-full max-w-md">
           {thresholds.map((t) => (
             <TabsTrigger key={t.traffic_tier} value={t.traffic_tier} className="flex items-center gap-1">
               <TierIcon tier={t.traffic_tier} />
               <span className="hidden sm:inline">
                 {t.traffic_tier === 'baseline' ? 'Base' : t.traffic_tier}
               </span>
             </TabsTrigger>
           ))}
         </TabsList>
 
         {thresholds.map((threshold) => (
           <TabsContent key={threshold.traffic_tier} value={threshold.traffic_tier}>
             <Card>
               <CardContent className="pt-6">
                 <TierCard threshold={threshold} />
               </CardContent>
             </Card>
           </TabsContent>
         ))}
       </Tabs>
 
       {/* Quick Reference */}
       <Card className="bg-gradient-to-r from-primary/5 to-transparent">
         <CardContent className="py-4">
           <h4 className="font-medium mb-3">Quick Scaling Decision Tree</h4>
           <div className="text-sm space-y-2">
             <p>1. <strong>Check Status:</strong> Is the store 🟢 GO? → If NO, do not scale.</p>
             <p>2. <strong>Review Tier:</strong> What tier are you targeting? → Check all required items.</p>
             <p>3. <strong>Verify Protections:</strong> Are all auto-protections enabled? → If NO, enable first.</p>
             <p>4. <strong>Monitor After:</strong> Watch metrics closely for 24h after scaling.</p>
           </div>
         </CardContent>
       </Card>
     </div>
   );
 };
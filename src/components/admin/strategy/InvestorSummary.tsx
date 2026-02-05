 import { useState, useEffect } from "react";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { Badge } from "@/components/ui/badge";
 import { 
   TrendingUp, 
   Shield, 
   Target, 
   Zap,
   CheckCircle,
   Globe,
   DollarSign,
   Users
 } from "lucide-react";
 import { supabase } from "@/integrations/supabase/client";
 
 interface HealthStatus {
   status: 'go' | 'caution' | 'no_go';
   score: number;
 }
 
 export const InvestorSummary = () => {
   const [healthStatus, setHealthStatus] = useState<HealthStatus>({ status: 'go', score: 85 });
 
   useEffect(() => {
     const fetchHealth = async () => {
       const { data } = await supabase
         .from('monitoring_ai_summaries')
         .select('status, score')
         .order('created_at', { ascending: false })
         .limit(1)
         .single();
       
       if (data) {
         setHealthStatus({
           status: data.status as 'go' | 'caution' | 'no_go',
           score: data.score || 85
         });
       }
     };
     fetchHealth();
   }, []);
 
   const statusConfig = {
     go: { label: '🟢 GO', color: 'bg-green-500/20 text-green-400' },
     caution: { label: '🟠 CAUTION', color: 'bg-orange-500/20 text-orange-400' },
     no_go: { label: '🔴 NO-GO', color: 'bg-red-500/20 text-red-400' }
   };
 
   return (
     <div className="space-y-6 max-w-4xl mx-auto">
       {/* Header */}
       <div className="text-center space-y-2 pb-4 border-b border-border">
         <h1 className="text-3xl font-bold">GetPawsy</h1>
         <p className="text-muted-foreground">Trusted Pet Essentials for US Pet Parents</p>
         <Badge variant="outline" className="mt-2">Investor Summary</Badge>
       </div>
 
       <div className="grid md:grid-cols-2 gap-6">
         {/* A. Company Snapshot */}
         <Card>
           <CardHeader className="pb-3">
             <CardTitle className="text-base flex items-center gap-2">
               <Globe className="w-4 h-4 text-primary" />
               Company Snapshot
             </CardTitle>
           </CardHeader>
           <CardContent className="space-y-3 text-sm">
             <div>
               <span className="font-medium">What We Do:</span>
               <p className="text-muted-foreground">
                 Curated pet essentials for US pet owners, delivered fast with transparent quality standards.
               </p>
             </div>
             <div>
               <span className="font-medium">Target Market:</span>
               <p className="text-muted-foreground">
                 US pet parents (dogs & cats) seeking reliable, affordable everyday products.
               </p>
             </div>
             <div>
               <span className="font-medium">Value Proposition:</span>
               <p className="text-muted-foreground">
                 Trust, speed, and reliability — curated products, US-based fulfillment, real customer care.
               </p>
             </div>
           </CardContent>
         </Card>
 
         {/* B. Traction & Proof */}
         <Card>
           <CardHeader className="pb-3">
             <CardTitle className="text-base flex items-center gap-2">
               <TrendingUp className="w-4 h-4 text-primary" />
               Traction & Proof
             </CardTitle>
           </CardHeader>
           <CardContent className="space-y-3 text-sm">
             <div className="flex items-center justify-between">
               <span>Current Funnel Health:</span>
               <Badge className={statusConfig[healthStatus.status].color}>
                 {statusConfig[healthStatus.status].label}
               </Badge>
             </div>
             <div className="space-y-1">
               <span className="font-medium">De-risked:</span>
               <ul className="text-muted-foreground space-y-1 ml-4">
                 <li className="flex items-center gap-2">
                   <CheckCircle className="w-3 h-3 text-green-400" />
                   Automated checkout validation
                 </li>
                 <li className="flex items-center gap-2">
                   <CheckCircle className="w-3 h-3 text-green-400" />
                   Real-time funnel monitoring
                 </li>
                 <li className="flex items-center gap-2">
                   <CheckCircle className="w-3 h-3 text-green-400" />
                   Predictive ad protection
                 </li>
               </ul>
             </div>
           </CardContent>
         </Card>
 
         {/* C. Business Model */}
         <Card>
           <CardHeader className="pb-3">
             <CardTitle className="text-base flex items-center gap-2">
               <DollarSign className="w-4 h-4 text-primary" />
               Business Model
             </CardTitle>
           </CardHeader>
           <CardContent className="space-y-3 text-sm">
             <div>
               <span className="font-medium">Revenue Model:</span>
               <p className="text-muted-foreground">
                 Direct-to-consumer ecommerce with ads-driven acquisition.
               </p>
             </div>
             <div>
               <span className="font-medium">Margin Structure:</span>
               <p className="text-muted-foreground">
                 30-50% gross margin on curated products; variable fulfillment costs via dropship partners.
               </p>
             </div>
             <div>
               <span className="font-medium">Growth Engine:</span>
               <p className="text-muted-foreground">
                 Paid ads (Google, Pinterest) with automated risk protection to scale safely.
               </p>
             </div>
           </CardContent>
         </Card>
 
         {/* D. Competitive Advantage */}
         <Card>
           <CardHeader className="pb-3">
             <CardTitle className="text-base flex items-center gap-2">
               <Shield className="w-4 h-4 text-primary" />
               Competitive Advantage
             </CardTitle>
           </CardHeader>
           <CardContent className="space-y-3 text-sm">
             <div className="space-y-2">
               <div className="flex items-start gap-2">
                 <Zap className="w-4 h-4 text-orange-400 mt-0.5" />
                 <div>
                   <span className="font-medium">Self-Protecting Store:</span>
                   <p className="text-muted-foreground text-xs">
                     Automated monitoring pauses ads before broken pages waste spend.
                   </p>
                 </div>
               </div>
               <div className="flex items-start gap-2">
                 <Zap className="w-4 h-4 text-orange-400 mt-0.5" />
                 <div>
                   <span className="font-medium">Faster Iteration:</span>
                   <p className="text-muted-foreground text-xs">
                     AI-assisted operations with lower downside risk per experiment.
                   </p>
                 </div>
               </div>
               <div className="flex items-start gap-2">
                 <Zap className="w-4 h-4 text-orange-400 mt-0.5" />
                 <div>
                   <span className="font-medium">Operational Simplicity:</span>
                   <p className="text-muted-foreground text-xs">
                     Dropshipping + US fulfillment without inventory risk.
                   </p>
                 </div>
               </div>
             </div>
           </CardContent>
         </Card>
       </div>
 
       {/* E & F: Focus Areas */}
       <div className="grid md:grid-cols-2 gap-6">
         <Card>
           <CardHeader className="pb-3">
             <CardTitle className="text-base flex items-center gap-2">
               <Target className="w-4 h-4 text-primary" />
               Near-Term Focus (90 Days)
             </CardTitle>
           </CardHeader>
           <CardContent>
             <div className="space-y-2 text-sm">
               <div className="flex items-center gap-3">
                 <Badge variant="outline" className="w-20 justify-center">Phase 1</Badge>
                 <span>Stabilize funnel & fix any P1 issues</span>
               </div>
               <div className="flex items-center gap-3">
                 <Badge variant="outline" className="w-20 justify-center">Phase 2</Badge>
                 <span>Optimize conversion & AOV</span>
               </div>
               <div className="flex items-center gap-3">
                 <Badge variant="outline" className="w-20 justify-center">Phase 3</Badge>
                 <span>Scale ads selectively on proven pages</span>
               </div>
             </div>
           </CardContent>
         </Card>
 
         <Card>
           <CardHeader className="pb-3">
             <CardTitle className="text-base flex items-center gap-2">
               <Users className="w-4 h-4 text-primary" />
               Long-Term Vision
             </CardTitle>
           </CardHeader>
           <CardContent className="space-y-3 text-sm">
             <p className="text-muted-foreground">
               Become a <span className="text-foreground font-medium">trusted US pet essentials brand</span> known 
               for reliability and customer care.
             </p>
             <p className="text-muted-foreground">
               Expand into repeat-purchase categories (food, treats, supplements) to build 
               <span className="text-foreground font-medium"> sustainable LTV</span>.
             </p>
           </CardContent>
         </Card>
       </div>
 
       {/* Disclaimer */}
       <div className="text-center text-xs text-muted-foreground pt-4 border-t border-border">
         <p>This summary is for informational purposes only. Not financial or investment advice.</p>
       </div>
     </div>
   );
 };
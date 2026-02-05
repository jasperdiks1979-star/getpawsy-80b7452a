 import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
 import { Badge } from "@/components/ui/badge";
 import { Separator } from "@/components/ui/separator";
 import { 
   Rocket,
   TrendingUp,
   Building2,
   DollarSign,
   Users,
   CheckCircle,
   XCircle,
   AlertTriangle,
   Target,
   Shield,
   ArrowRight
 } from "lucide-react";
 
 interface Phase {
   name: string;
   timeline: string;
   focus: string;
   keyMetrics: string[];
   status: 'current' | 'upcoming' | 'future';
 }
 
 interface ExitPath {
   name: string;
   description: string;
   requirements: string[];
   likelihood: 'high' | 'medium' | 'low';
 }
 
 export const ExitRoadmap = () => {
   const phases: Phase[] = [
     {
       name: "Early Validation",
       timeline: "Year 1",
       focus: "Product-market fit, funnel stability, initial traction",
       keyMetrics: ["First $50K revenue", "Stable checkout (95%+ uptime)", "Positive unit economics"],
       status: 'current'
     },
     {
       name: "Scaling",
       timeline: "Year 2",
       focus: "Aggressive growth with protected downside",
       keyMetrics: ["$500K-$1M revenue", "ROAS > 2.5x", "90%+ GO days monthly"],
       status: 'upcoming'
     },
     {
       name: "Brand & Retention",
       timeline: "Year 3",
       focus: "Build repeat purchase behavior and brand recognition",
       keyMetrics: ["30%+ repeat customers", "Email list > 50K", "CAC payback < 60 days"],
       status: 'future'
     },
     {
       name: "Optimization for Profitability",
       timeline: "Year 4-5",
       focus: "Maximize margins, reduce founder dependency",
       keyMetrics: ["20%+ net margin", "< 10 hrs/week founder time", "Clean financials"],
       status: 'future'
     }
   ];
 
   const exitPaths: ExitPath[] = [
     {
       name: "Strategic Acquisition",
       description: "Acquired by a larger pet brand or ecommerce roll-up",
       requirements: [
         "Proven brand with loyal customers",
         "$1M+ annual revenue",
         "Clean, automated operations"
       ],
       likelihood: 'medium'
     },
     {
       name: "Private Equity / Cash-Flow Multiple",
       description: "Sold based on EBITDA multiple to financial buyer",
       requirements: [
         "$500K+ EBITDA",
         "3+ years of clean financials",
         "Predictable, repeatable growth"
       ],
       likelihood: 'high'
     },
     {
       name: "Owner-Operated Lifestyle Business",
       description: "Continue operating for cash flow and lifestyle flexibility",
       requirements: [
         "Low founder time commitment",
         "Stable, profitable operations",
         "Strong team or automation"
       ],
       likelihood: 'high'
     }
   ];
 
   const exitReadinessChecks = [
     { label: "Revenue > $500K/year", status: 'pending' },
     { label: "Gross margin > 35%", status: 'pending' },
     { label: "ROAS consistently > 2x", status: 'pending' },
     { label: "90%+ monthly GO days", status: 'in_progress' },
     { label: "< 20 hrs/week founder time", status: 'pending' },
     { label: "Repeat purchase rate > 20%", status: 'pending' }
   ];
 
   const mustBuildBeforeExit = [
     "Brand trust through consistent quality and customer care",
     "Repeat purchase rate via consumables (treats, food, supplements)",
     "Clean, auditable metrics and reporting",
     "Documented SOPs for all operations",
     "Reduced founder dependency (team or automation)"
   ];
 
   const doNotOptimizeEarly = [
     { item: "Premature scaling", reason: "Scaling broken funnels wastes ad spend" },
     { item: "Over-complex product lines", reason: "SKU sprawl increases ops burden" },
     { item: "Vanity metrics", reason: "Focus on revenue and margin, not followers" },
     { item: "Expensive tech rewrites", reason: "Iterate on what works, don't rebuild" }
   ];
 
   return (
     <div className="space-y-6">
       {/* Header */}
       <div className="space-y-2">
         <h2 className="text-2xl font-bold flex items-center gap-2">
           <Rocket className="w-6 h-6" />
           Long-Term Roadmap & Exit Scenarios
         </h2>
         <p className="text-muted-foreground">3-5 year strategic view with optionality</p>
       </div>
 
       {/* A. Growth Phases */}
       <Card>
         <CardHeader className="pb-3">
           <CardTitle className="text-base flex items-center gap-2">
             <TrendingUp className="w-4 h-4 text-primary" />
             A. Growth Phases
           </CardTitle>
         </CardHeader>
         <CardContent>
           <div className="space-y-4">
             {phases.map((phase, idx) => (
               <div 
                 key={phase.name} 
                 className={`p-4 rounded-lg border ${
                   phase.status === 'current' 
                     ? 'border-primary bg-primary/5' 
                     : 'border-border/50 bg-card/50'
                 }`}
               >
                 <div className="flex items-center justify-between mb-2">
                   <div className="flex items-center gap-3">
                     <Badge variant={phase.status === 'current' ? 'default' : 'outline'}>
                       {phase.timeline}
                     </Badge>
                     <span className="font-medium">{phase.name}</span>
                   </div>
                   {phase.status === 'current' && (
                     <Badge className="bg-green-500/20 text-green-400">Current</Badge>
                   )}
                 </div>
                 <p className="text-sm text-muted-foreground mb-2">{phase.focus}</p>
                 <div className="flex flex-wrap gap-2">
                   {phase.keyMetrics.map((metric) => (
                     <Badge key={metric} variant="secondary" className="text-xs">
                       {metric}
                     </Badge>
                   ))}
                 </div>
                 {idx < phases.length - 1 && (
                   <div className="flex justify-center mt-3">
                     <ArrowRight className="w-4 h-4 text-muted-foreground" />
                   </div>
                 )}
               </div>
             ))}
           </div>
         </CardContent>
       </Card>
 
       {/* B. Possible Exit Paths */}
       <Card>
         <CardHeader className="pb-3">
           <CardTitle className="text-base flex items-center gap-2">
             <Building2 className="w-4 h-4 text-primary" />
             B. Possible Exit Paths
           </CardTitle>
           <CardDescription>Options, not obligations</CardDescription>
         </CardHeader>
         <CardContent>
           <div className="grid md:grid-cols-3 gap-4">
             {exitPaths.map((path) => (
               <div key={path.name} className="p-4 bg-card/50 rounded-lg border border-border/50">
                 <div className="flex items-center justify-between mb-2">
                   <span className="font-medium text-sm">{path.name}</span>
                   <Badge 
                     variant="outline" 
                     className={
                       path.likelihood === 'high' 
                         ? 'border-green-500/50 text-green-400' 
                         : path.likelihood === 'medium'
                         ? 'border-orange-500/50 text-orange-400'
                         : 'border-muted-foreground'
                     }
                   >
                     {path.likelihood}
                   </Badge>
                 </div>
                 <p className="text-xs text-muted-foreground mb-3">{path.description}</p>
                 <Separator className="my-2" />
                 <div className="space-y-1">
                   {path.requirements.map((req) => (
                     <div key={req} className="flex items-start gap-2 text-xs">
                       <CheckCircle className="w-3 h-3 text-muted-foreground mt-0.5" />
                       <span className="text-muted-foreground">{req}</span>
                     </div>
                   ))}
                 </div>
               </div>
             ))}
           </div>
         </CardContent>
       </Card>
 
       {/* C. Exit Readiness Signals */}
       <Card>
         <CardHeader className="pb-3">
           <CardTitle className="text-base flex items-center gap-2">
             <Target className="w-4 h-4 text-primary" />
             C. Exit Readiness Signals
           </CardTitle>
         </CardHeader>
         <CardContent>
           <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
             {exitReadinessChecks.map((check) => (
               <div 
                 key={check.label} 
                 className="flex items-center gap-2 p-3 bg-card/50 rounded-lg border border-border/50"
               >
                 {check.status === 'done' ? (
                   <CheckCircle className="w-4 h-4 text-green-400" />
                 ) : check.status === 'in_progress' ? (
                   <AlertTriangle className="w-4 h-4 text-orange-400" />
                 ) : (
                   <div className="w-4 h-4 rounded-full border-2 border-muted-foreground" />
                 )}
                 <span className="text-sm">{check.label}</span>
               </div>
             ))}
           </div>
         </CardContent>
       </Card>
 
       {/* D & E: What to build & What NOT to optimize */}
       <div className="grid md:grid-cols-2 gap-6">
         <Card>
           <CardHeader className="pb-3">
             <CardTitle className="text-base flex items-center gap-2">
               <Shield className="w-4 h-4 text-primary" />
               D. Must Build Before Exit
             </CardTitle>
           </CardHeader>
           <CardContent>
             <div className="space-y-2">
               {mustBuildBeforeExit.map((item, idx) => (
                 <div key={idx} className="flex items-start gap-2">
                   <CheckCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
                   <span className="text-sm">{item}</span>
                 </div>
               ))}
             </div>
           </CardContent>
         </Card>
 
         <Card>
           <CardHeader className="pb-3">
             <CardTitle className="text-base flex items-center gap-2">
               <XCircle className="w-4 h-4 text-destructive" />
               E. Do NOT Optimize Early
             </CardTitle>
           </CardHeader>
           <CardContent>
             <div className="space-y-3">
               {doNotOptimizeEarly.map((item) => (
                 <div key={item.item} className="flex items-start gap-2">
                   <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                   <div>
                     <span className="text-sm font-medium">{item.item}</span>
                     <p className="text-xs text-muted-foreground">{item.reason}</p>
                   </div>
                 </div>
               ))}
             </div>
           </CardContent>
         </Card>
       </div>
 
       {/* Key Message */}
       <Card className="bg-primary/5 border-primary/20">
         <CardContent className="p-4">
           <div className="flex items-center gap-3">
             <Users className="w-8 h-8 text-primary" />
             <div>
               <p className="font-medium">This roadmap emphasizes optionality.</p>
               <p className="text-sm text-muted-foreground">
                 Build a business worth owning or selling. Don't force an exit timeline — let the metrics guide the decision.
               </p>
             </div>
           </div>
         </CardContent>
       </Card>
 
       {/* Disclaimer */}
       <div className="text-center text-xs text-muted-foreground pt-4 border-t border-border">
         <p>
           <strong>Disclaimer:</strong> This roadmap is strategic guidance, not financial, legal, or investment advice. 
           Consult qualified professionals before making business or exit decisions.
         </p>
       </div>
     </div>
   );
 };
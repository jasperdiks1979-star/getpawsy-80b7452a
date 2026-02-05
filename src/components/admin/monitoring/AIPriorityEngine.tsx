 import { useState, useEffect } from "react";
 import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
 import { Badge } from "@/components/ui/badge";
 import { Button } from "@/components/ui/button";
 import { Skeleton } from "@/components/ui/skeleton";
 import { 
   Zap, 
   Clock, 
   Eye, 
   ArrowUp, 
   AlertTriangle,
   RefreshCw,
   ExternalLink,
   Sparkles
 } from "lucide-react";
 import { supabase } from "@/integrations/supabase/client";
 
 interface Priority {
   id: string;
   priority_rank: number;
   issue_summary: string;
   why_it_matters: string;
   estimated_impact: string;
   recommended_action: 'do_now' | 'schedule' | 'monitor';
   revenue_impact_score: number;
   fix_complexity: 'quick_win' | 'medium' | 'heavy_work';
   affected_urls: string[];
   created_at: string;
 }
 
 const ActionBadge = ({ action }: { action: Priority['recommended_action'] }) => {
   const config = {
     do_now: { label: '⚡ Do Now', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
     schedule: { label: '📅 Schedule', className: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
     monitor: { label: '👁 Monitor', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' }
   };
   return <Badge className={config[action].className}>{config[action].label}</Badge>;
 };
 
 const ComplexityBadge = ({ complexity }: { complexity: Priority['fix_complexity'] }) => {
   const config = {
     quick_win: { label: '✅ Quick Win', className: 'bg-green-500/10 text-green-400' },
     medium: { label: '⚙️ Medium', className: 'bg-yellow-500/10 text-yellow-400' },
     heavy_work: { label: '🔧 Heavy Work', className: 'bg-purple-500/10 text-purple-400' }
   };
   return <Badge variant="outline" className={config[complexity].className}>{config[complexity].label}</Badge>;
 };
 
 const PriorityCard = ({ priority, isTop }: { priority: Priority; isTop: boolean }) => {
   return (
     <Card className={`transition-all ${isTop ? 'border-2 border-primary bg-primary/5' : ''}`}>
       <CardContent className="p-4">
         <div className="flex items-start justify-between gap-4">
           <div className="flex items-center gap-3">
             <div className={`
               w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg
               ${isTop ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}
             `}>
               {priority.priority_rank}
             </div>
             <div className="space-y-1">
               <h4 className="font-medium">{priority.issue_summary}</h4>
               <div className="flex items-center gap-2">
                 <ActionBadge action={priority.recommended_action} />
                 <ComplexityBadge complexity={priority.fix_complexity} />
               </div>
             </div>
           </div>
           <div className="text-right">
             <div className="text-sm text-muted-foreground">Impact Score</div>
             <div className="text-xl font-bold">{priority.revenue_impact_score}</div>
           </div>
         </div>
 
         <div className="mt-4 grid md:grid-cols-2 gap-4 text-sm">
           <div className="space-y-1">
             <div className="flex items-center gap-1 text-muted-foreground">
               <AlertTriangle className="w-3 h-3" />
               Why it matters
             </div>
             <p>{priority.why_it_matters}</p>
           </div>
           <div className="space-y-1">
             <div className="flex items-center gap-1 text-muted-foreground">
               <ArrowUp className="w-3 h-3" />
               Estimated Impact
             </div>
             <p className="text-green-400">{priority.estimated_impact}</p>
           </div>
         </div>
 
         {priority.affected_urls.length > 0 && (
           <div className="mt-3 flex flex-wrap gap-2">
             {priority.affected_urls.slice(0, 3).map((url, idx) => (
               <Badge key={idx} variant="outline" className="text-xs">
                 <ExternalLink className="w-3 h-3 mr-1" />
                 {url}
               </Badge>
             ))}
             {priority.affected_urls.length > 3 && (
               <Badge variant="outline" className="text-xs">
                 +{priority.affected_urls.length - 3} more
               </Badge>
             )}
           </div>
         )}
       </CardContent>
     </Card>
   );
 };
 
 export const AIPriorityEngine = () => {
   const [priorities, setPriorities] = useState<Priority[]>([]);
   const [loading, setLoading] = useState(true);
   const [generating, setGenerating] = useState(false);
 
   const fetchPriorities = async () => {
     try {
       const { data } = await supabase
         .from('monitoring_priority_rankings')
         .select('*')
         .eq('is_active', true)
         .order('priority_rank', { ascending: true })
         .limit(5);
       
       setPriorities((data || []) as Priority[]);
     } catch (error) {
       console.error('Error fetching priorities:', error);
     } finally {
       setLoading(false);
     }
   };
 
   const generatePriorities = async () => {
     setGenerating(true);
     try {
       await supabase.functions.invoke('monitoring-priority-engine');
       await fetchPriorities();
     } finally {
       setGenerating(false);
     }
   };
 
   useEffect(() => {
     fetchPriorities();
   }, []);
 
   return (
     <div className="space-y-6">
       <Card>
         <CardHeader>
           <div className="flex items-center justify-between">
             <div>
               <CardTitle className="flex items-center gap-2">
                 <Sparkles className="w-5 h-5 text-primary" />
                 AI Priority Engine
               </CardTitle>
               <CardDescription>
                 Ranked list of what to fix first for maximum impact
               </CardDescription>
             </div>
             <Button onClick={generatePriorities} disabled={generating}>
               <RefreshCw className={`w-4 h-4 mr-2 ${generating ? 'animate-spin' : ''}`} />
               {generating ? 'Analyzing...' : 'Recalculate'}
             </Button>
           </div>
         </CardHeader>
       </Card>
 
       {loading ? (
         <div className="space-y-4">
           {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40" />)}
         </div>
       ) : priorities.length === 0 ? (
         <Card>
           <CardContent className="py-12 text-center">
             <Sparkles className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
             <h3 className="text-lg font-medium mb-2">No Priorities Yet</h3>
             <p className="text-muted-foreground mb-4">
               Click "Recalculate" to analyze your store and generate priorities.
             </p>
             <Button onClick={generatePriorities} disabled={generating}>
               Generate Priorities
             </Button>
           </CardContent>
         </Card>
       ) : (
         <div className="space-y-4">
           {priorities.map((priority, idx) => (
             <PriorityCard 
               key={priority.id} 
               priority={priority} 
               isTop={idx === 0} 
             />
           ))}
         </div>
       )}
 
       {/* Legend */}
       <Card>
         <CardContent className="py-4">
           <div className="flex flex-wrap gap-6 text-sm">
             <div className="flex items-center gap-2">
               <Zap className="w-4 h-4 text-red-400" />
               <span><strong>Do Now:</strong> Immediate action required</span>
             </div>
             <div className="flex items-center gap-2">
               <Clock className="w-4 h-4 text-orange-400" />
               <span><strong>Schedule:</strong> Plan for this week</span>
             </div>
             <div className="flex items-center gap-2">
               <Eye className="w-4 h-4 text-blue-400" />
               <span><strong>Monitor:</strong> Watch closely, act if degrades</span>
             </div>
           </div>
         </CardContent>
       </Card>
     </div>
   );
 };
 import { useState } from "react";
 import { useQuery } from "@tanstack/react-query";
 import { supabase } from "@/integrations/supabase/client";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { Button } from "@/components/ui/button";
 import { Badge } from "@/components/ui/badge";
 import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
 import { ScrollArea } from "@/components/ui/scroll-area";
 import { 
   CheckCircle, 
   AlertTriangle, 
   XCircle, 
   Calendar, 
   ExternalLink,
   TrendingUp,
   TrendingDown,
   Pause,
   Play
 } from "lucide-react";
 import { format, subDays } from "date-fns";
 
 interface GoNoGoReport {
   id: string;
   completed_at: string;
   success: boolean;
   details: {
     date: string;
     status: "GO" | "CAUTION" | "NO-GO";
     status_emoji: string;
     score: number;
     checks: Array<{
       name: string;
       status: "pass" | "warn" | "fail";
       details: string;
       weight: number;
     }>;
     blocking_issues: string[];
     warnings: string[];
     affected_pages: string[];
     actions_to_fix: string[];
   };
 }
 
 interface AdAction {
   id: string;
   action_type: string;
   platform: string;
   trigger_reason: string;
   trigger_status: string;
   is_recommendation: boolean;
   created_at: string;
   reverted_at: string | null;
 }
 
 export function GoNoGoHistoryDashboard() {
   const [timeRange, setTimeRange] = useState<7 | 14 | 30>(7);
 
   const { data: history, isLoading: historyLoading } = useQuery({
     queryKey: ["go-nogo-history", timeRange],
     queryFn: async () => {
       const startDate = subDays(new Date(), timeRange).toISOString();
       const { data, error } = await supabase
         .from("monitoring_runs")
         .select("id, completed_at, success, details")
         .eq("run_type", "daily_go_nogo")
         .gte("completed_at", startDate)
         .order("completed_at", { ascending: false });
 
       if (error) throw error;
       return data as GoNoGoReport[];
     },
   });
 
   const { data: adActions } = useQuery({
     queryKey: ["ad-actions", timeRange],
     queryFn: async () => {
       const startDate = subDays(new Date(), timeRange).toISOString();
       const { data, error } = await supabase
         .from("monitoring_ad_actions")
         .select("*")
         .gte("created_at", startDate)
         .order("created_at", { ascending: false });
 
       if (error) throw error;
       return data as AdAction[];
     },
   });
 
   const getStatusIcon = (status: string) => {
     switch (status) {
       case "GO":
         return <CheckCircle className="h-5 w-5 text-green-500" />;
       case "CAUTION":
         return <AlertTriangle className="h-5 w-5 text-amber-500" />;
       case "NO-GO":
         return <XCircle className="h-5 w-5 text-red-500" />;
       default:
         return null;
     }
   };
 
   const getStatusBadge = (status: string) => {
     const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
       "GO": "default",
       "CAUTION": "secondary",
       "NO-GO": "destructive",
     };
     const colors: Record<string, string> = {
       "GO": "bg-green-500 hover:bg-green-600",
       "CAUTION": "bg-amber-500 hover:bg-amber-600",
       "NO-GO": "bg-red-500 hover:bg-red-600",
     };
     return (
       <Badge className={`${colors[status] || ""} text-white`}>
         {status}
       </Badge>
     );
   };
 
   // Calculate summary stats
   const stats = {
     totalDays: history?.length || 0,
     goDays: history?.filter(h => h.details?.status === "GO").length || 0,
     cautionDays: history?.filter(h => h.details?.status === "CAUTION").length || 0,
     noGoDays: history?.filter(h => h.details?.status === "NO-GO").length || 0,
     pauseActions: adActions?.filter(a => a.action_type === "pause" || a.action_type === "recommendation").length || 0,
     resumeActions: adActions?.filter(a => a.reverted_at !== null).length || 0,
   };
 
   const uptimePercent = stats.totalDays > 0 
     ? Math.round((stats.goDays / stats.totalDays) * 100) 
     : 0;
 
   return (
     <div className="space-y-6">
       {/* Header */}
       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
         <div>
           <h2 className="text-2xl font-bold">Ads Health History</h2>
           <p className="text-muted-foreground">Daily GO/NO-GO status and ad actions</p>
         </div>
         <div className="flex gap-2">
           <Button 
             variant={timeRange === 7 ? "default" : "outline"} 
             size="sm"
             onClick={() => setTimeRange(7)}
           >
             7 Days
           </Button>
           <Button 
             variant={timeRange === 14 ? "default" : "outline"} 
             size="sm"
             onClick={() => setTimeRange(14)}
           >
             14 Days
           </Button>
           <Button 
             variant={timeRange === 30 ? "default" : "outline"} 
             size="sm"
             onClick={() => setTimeRange(30)}
           >
             30 Days
           </Button>
         </div>
       </div>
 
       {/* Summary Cards */}
       <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
         <Card>
           <CardContent className="pt-6">
             <div className="flex items-center justify-between">
               <div>
                 <p className="text-sm text-muted-foreground">Uptime</p>
                 <p className="text-2xl font-bold text-green-600">{uptimePercent}%</p>
               </div>
               <TrendingUp className="h-8 w-8 text-green-500 opacity-50" />
             </div>
           </CardContent>
         </Card>
         <Card>
           <CardContent className="pt-6">
             <div className="flex items-center justify-between">
               <div>
                 <p className="text-sm text-muted-foreground">🟢 GO Days</p>
                 <p className="text-2xl font-bold">{stats.goDays}</p>
               </div>
               <CheckCircle className="h-8 w-8 text-green-500 opacity-50" />
             </div>
           </CardContent>
         </Card>
         <Card>
           <CardContent className="pt-6">
             <div className="flex items-center justify-between">
               <div>
                 <p className="text-sm text-muted-foreground">🔴 NO-GO Days</p>
                 <p className="text-2xl font-bold">{stats.noGoDays}</p>
               </div>
               <XCircle className="h-8 w-8 text-red-500 opacity-50" />
             </div>
           </CardContent>
         </Card>
         <Card>
           <CardContent className="pt-6">
             <div className="flex items-center justify-between">
               <div>
                 <p className="text-sm text-muted-foreground">Ad Pauses</p>
                 <p className="text-2xl font-bold">{stats.pauseActions}</p>
               </div>
               <Pause className="h-8 w-8 text-amber-500 opacity-50" />
             </div>
           </CardContent>
         </Card>
       </div>
 
       {/* Timeline View */}
       <Tabs defaultValue="timeline" className="w-full">
         <TabsList>
           <TabsTrigger value="timeline">Timeline</TabsTrigger>
           <TabsTrigger value="ad-actions">Ad Actions</TabsTrigger>
         </TabsList>
 
         <TabsContent value="timeline" className="mt-4">
           <Card>
             <CardHeader>
               <CardTitle className="flex items-center gap-2">
                 <Calendar className="h-5 w-5" />
                 Daily Status Timeline
               </CardTitle>
             </CardHeader>
             <CardContent>
               {historyLoading ? (
                 <div className="text-center py-8 text-muted-foreground">Loading...</div>
               ) : !history?.length ? (
                 <div className="text-center py-8 text-muted-foreground">No data available</div>
               ) : (
                 <ScrollArea className="h-[400px]">
                   <div className="space-y-3">
                     {history.map((report) => (
                       <div 
                         key={report.id} 
                         className="flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                       >
                         <div className="flex-shrink-0 pt-1">
                           {getStatusIcon(report.details?.status || "UNKNOWN")}
                         </div>
                         <div className="flex-1 min-w-0">
                           <div className="flex items-center gap-2 flex-wrap">
                             <span className="font-medium">
                               {format(new Date(report.completed_at), "MMM d, yyyy")}
                             </span>
                             {getStatusBadge(report.details?.status || "UNKNOWN")}
                             <span className="text-sm text-muted-foreground">
                               Score: {report.details?.score || 0}%
                             </span>
                           </div>
                           
                           {report.details?.blocking_issues?.length > 0 && (
                             <div className="mt-2">
                               <p className="text-sm text-red-600 font-medium">Blocking Issues:</p>
                               <ul className="text-sm text-muted-foreground list-disc list-inside">
                                 {report.details.blocking_issues.slice(0, 3).map((issue, i) => (
                                   <li key={i}>{issue}</li>
                                 ))}
                               </ul>
                             </div>
                           )}
 
                           {report.details?.warnings?.length > 0 && (
                             <div className="mt-2">
                               <p className="text-sm text-amber-600 font-medium">Warnings:</p>
                               <ul className="text-sm text-muted-foreground list-disc list-inside">
                                 {report.details.warnings.slice(0, 2).map((warn, i) => (
                                   <li key={i}>{warn}</li>
                                 ))}
                               </ul>
                             </div>
                           )}
 
                           {report.details?.affected_pages?.length > 0 && (
                             <div className="mt-2 flex flex-wrap gap-1">
                               {report.details.affected_pages.slice(0, 2).map((url, i) => (
                                 <a 
                                   key={i}
                                   href={url} 
                                   target="_blank" 
                                   rel="noopener noreferrer"
                                   className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                                 >
                                   <ExternalLink className="h-3 w-3" />
                                   {url.replace("https://getpawsy.pet", "")}
                                 </a>
                               ))}
                             </div>
                           )}
                         </div>
                       </div>
                     ))}
                   </div>
                 </ScrollArea>
               )}
             </CardContent>
           </Card>
         </TabsContent>
 
         <TabsContent value="ad-actions" className="mt-4">
           <Card>
             <CardHeader>
               <CardTitle className="flex items-center gap-2">
                 <Pause className="h-5 w-5" />
                 Ad Pause/Resume Actions
               </CardTitle>
             </CardHeader>
             <CardContent>
               {!adActions?.length ? (
                 <div className="text-center py-8 text-muted-foreground">No ad actions recorded</div>
               ) : (
                 <ScrollArea className="h-[400px]">
                   <div className="space-y-3">
                     {adActions.map((action) => (
                       <div 
                         key={action.id} 
                         className="flex items-start gap-4 p-4 border rounded-lg"
                       >
                         <div className="flex-shrink-0 pt-1">
                           {action.reverted_at ? (
                             <Play className="h-5 w-5 text-green-500" />
                           ) : (
                             <Pause className="h-5 w-5 text-red-500" />
                           )}
                         </div>
                         <div className="flex-1">
                           <div className="flex items-center gap-2 flex-wrap">
                             <span className="font-medium capitalize">{action.platform.replace("_", " ")}</span>
                             <Badge variant={action.is_recommendation ? "outline" : "default"}>
                               {action.is_recommendation ? "Recommended" : "Executed"}
                             </Badge>
                             <Badge variant={action.reverted_at ? "default" : "destructive"}>
                               {action.reverted_at ? "Resolved" : action.action_type}
                             </Badge>
                           </div>
                           <p className="text-sm text-muted-foreground mt-1">
                             {action.trigger_reason}
                           </p>
                           <p className="text-xs text-muted-foreground mt-1">
                             {format(new Date(action.created_at), "MMM d, yyyy HH:mm")}
                             {action.reverted_at && (
                               <span className="text-green-600 ml-2">
                                 → Resolved {format(new Date(action.reverted_at), "MMM d, HH:mm")}
                               </span>
                             )}
                           </p>
                         </div>
                       </div>
                     ))}
                   </div>
                 </ScrollArea>
               )}
             </CardContent>
           </Card>
         </TabsContent>
       </Tabs>
     </div>
   );
 }
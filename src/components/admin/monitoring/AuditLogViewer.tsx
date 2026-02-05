 import { useState } from "react";
 import { useQuery } from "@tanstack/react-query";
 import { supabase } from "@/integrations/supabase/client";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { Button } from "@/components/ui/button";
 import { Badge } from "@/components/ui/badge";
 import { Input } from "@/components/ui/input";
 import { ScrollArea } from "@/components/ui/scroll-area";
 import { 
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
 } from "@/components/ui/select";
 import { 
   FileText, 
   Download, 
   Search,
   AlertCircle,
   CheckCircle,
   Info,
   Zap,
   ExternalLink
 } from "lucide-react";
 import { format, subDays } from "date-fns";
 
 interface AuditLog {
   id: string;
   timestamp: string;
   severity: "P1" | "P2" | "INFO" | "ACTION";
   action_type: string;
   trigger_condition: string;
   affected_urls: string[];
   affected_components: string[];
   action_taken: string;
   action_result: string | null;
   is_recommendation: boolean;
   related_incident_id: string | null;
   related_run_id: string | null;
   metadata: Record<string, any>;
 }
 
 export function AuditLogViewer() {
   const [timeRange, setTimeRange] = useState<7 | 14 | 30>(7);
   const [severityFilter, setSeverityFilter] = useState<string>("all");
   const [searchQuery, setSearchQuery] = useState("");
 
   const { data: logs, isLoading } = useQuery({
     queryKey: ["audit-logs", timeRange, severityFilter],
     queryFn: async () => {
       const startDate = subDays(new Date(), timeRange).toISOString();
       let query = supabase
         .from("monitoring_audit_logs")
         .select("*")
         .gte("timestamp", startDate)
         .order("timestamp", { ascending: false })
         .limit(500);
 
       if (severityFilter !== "all") {
         query = query.eq("severity", severityFilter);
       }
 
       const { data, error } = await query;
       if (error) throw error;
       return data as AuditLog[];
     },
   });
 
   const filteredLogs = logs?.filter(log => {
     if (!searchQuery) return true;
     const search = searchQuery.toLowerCase();
     return (
       log.action_type.toLowerCase().includes(search) ||
       log.trigger_condition.toLowerCase().includes(search) ||
       log.action_taken.toLowerCase().includes(search)
     );
   });
 
   const getSeverityIcon = (severity: string) => {
     switch (severity) {
       case "P1":
         return <AlertCircle className="h-4 w-4 text-red-500" />;
       case "P2":
         return <AlertCircle className="h-4 w-4 text-amber-500" />;
       case "ACTION":
         return <Zap className="h-4 w-4 text-blue-500" />;
       default:
         return <Info className="h-4 w-4 text-gray-500" />;
     }
   };
 
   const getSeverityBadge = (severity: string) => {
     const variants: Record<string, string> = {
       "P1": "bg-red-500 text-white",
       "P2": "bg-amber-500 text-white",
       "ACTION": "bg-blue-500 text-white",
       "INFO": "bg-gray-500 text-white",
     };
     return (
       <Badge className={variants[severity] || variants.INFO}>
         {severity}
       </Badge>
     );
   };
 
   const exportLogs = (format: "csv" | "json") => {
     if (!filteredLogs?.length) return;
 
     let content: string;
     let filename: string;
     let mimeType: string;
 
     if (format === "json") {
       content = JSON.stringify(filteredLogs, null, 2);
       filename = `audit-logs-${new Date().toISOString().split("T")[0]}.json`;
       mimeType = "application/json";
     } else {
       const headers = [
         "Timestamp",
         "Severity",
         "Action Type",
         "Trigger",
         "Action Taken",
         "Result",
         "Affected URLs",
         "Is Recommendation"
       ];
       const rows = filteredLogs.map(log => [
         log.timestamp,
         log.severity,
         log.action_type,
         log.trigger_condition,
         log.action_taken,
         log.action_result || "",
         log.affected_urls.join("; "),
         log.is_recommendation ? "Yes" : "No"
       ]);
       content = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
       filename = `audit-logs-${new Date().toISOString().split("T")[0]}.csv`;
       mimeType = "text/csv";
     }
 
     const blob = new Blob([content], { type: mimeType });
     const url = URL.createObjectURL(blob);
     const a = document.createElement("a");
     a.href = url;
     a.download = filename;
     a.click();
     URL.revokeObjectURL(url);
   };
 
   return (
     <div className="space-y-6">
       {/* Header */}
       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
         <div>
           <h2 className="text-2xl font-bold">Audit Log</h2>
           <p className="text-muted-foreground">Complete traceability for all monitoring actions</p>
         </div>
         <div className="flex gap-2">
           <Button variant="outline" size="sm" onClick={() => exportLogs("csv")}>
             <Download className="h-4 w-4 mr-2" />
             CSV
           </Button>
           <Button variant="outline" size="sm" onClick={() => exportLogs("json")}>
             <Download className="h-4 w-4 mr-2" />
             JSON
           </Button>
         </div>
       </div>
 
       {/* Filters */}
       <div className="flex flex-wrap gap-4">
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
         
         <Select value={severityFilter} onValueChange={setSeverityFilter}>
           <SelectTrigger className="w-[140px]">
             <SelectValue placeholder="Severity" />
           </SelectTrigger>
           <SelectContent>
             <SelectItem value="all">All</SelectItem>
             <SelectItem value="P1">P1 Only</SelectItem>
             <SelectItem value="P2">P2 Only</SelectItem>
             <SelectItem value="ACTION">Actions</SelectItem>
             <SelectItem value="INFO">Info</SelectItem>
           </SelectContent>
         </Select>
 
         <div className="relative flex-1 min-w-[200px]">
           <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
           <Input
             placeholder="Search logs..."
             value={searchQuery}
             onChange={(e) => setSearchQuery(e.target.value)}
             className="pl-10"
           />
         </div>
       </div>
 
       {/* Log Stats */}
       <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
         <Card>
           <CardContent className="pt-4">
             <div className="text-center">
               <p className="text-2xl font-bold">{filteredLogs?.length || 0}</p>
               <p className="text-sm text-muted-foreground">Total Entries</p>
             </div>
           </CardContent>
         </Card>
         <Card>
           <CardContent className="pt-4">
             <div className="text-center">
               <p className="text-2xl font-bold text-red-600">
                 {filteredLogs?.filter(l => l.severity === "P1").length || 0}
               </p>
               <p className="text-sm text-muted-foreground">P1 Events</p>
             </div>
           </CardContent>
         </Card>
         <Card>
           <CardContent className="pt-4">
             <div className="text-center">
               <p className="text-2xl font-bold text-blue-600">
                 {filteredLogs?.filter(l => l.severity === "ACTION").length || 0}
               </p>
               <p className="text-sm text-muted-foreground">Actions</p>
             </div>
           </CardContent>
         </Card>
         <Card>
           <CardContent className="pt-4">
             <div className="text-center">
               <p className="text-2xl font-bold text-amber-600">
                 {filteredLogs?.filter(l => l.is_recommendation).length || 0}
               </p>
               <p className="text-sm text-muted-foreground">Recommendations</p>
             </div>
           </CardContent>
         </Card>
       </div>
 
       {/* Log List */}
       <Card>
         <CardHeader>
           <CardTitle className="flex items-center gap-2">
             <FileText className="h-5 w-5" />
             Audit Entries
           </CardTitle>
         </CardHeader>
         <CardContent>
           {isLoading ? (
             <div className="text-center py-8 text-muted-foreground">Loading...</div>
           ) : !filteredLogs?.length ? (
             <div className="text-center py-8 text-muted-foreground">No logs found</div>
           ) : (
             <ScrollArea className="h-[500px]">
               <div className="space-y-2">
                 {filteredLogs.map((log) => (
                   <div 
                     key={log.id} 
                     className="p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                   >
                     <div className="flex items-start gap-3">
                       <div className="flex-shrink-0 pt-0.5">
                         {getSeverityIcon(log.severity)}
                       </div>
                       <div className="flex-1 min-w-0">
                         <div className="flex items-center gap-2 flex-wrap mb-1">
                           {getSeverityBadge(log.severity)}
                           <span className="font-mono text-sm bg-muted px-2 py-0.5 rounded">
                             {log.action_type}
                           </span>
                           {log.is_recommendation && (
                             <Badge variant="outline" className="text-xs">
                               Recommendation
                             </Badge>
                           )}
                           <span className="text-xs text-muted-foreground ml-auto">
                             {format(new Date(log.timestamp), "MMM d, HH:mm:ss")}
                           </span>
                         </div>
                         
                         <p className="text-sm font-medium">{log.trigger_condition}</p>
                         <p className="text-sm text-muted-foreground mt-1">{log.action_taken}</p>
                         
                         {log.action_result && (
                           <p className="text-xs mt-1">
                             <span className="text-muted-foreground">Result:</span>{" "}
                             <span className={log.action_result === "success" ? "text-green-600" : ""}>
                               {log.action_result}
                             </span>
                           </p>
                         )}
 
                         {log.affected_urls.length > 0 && (
                           <div className="flex flex-wrap gap-1 mt-2">
                             {log.affected_urls.slice(0, 2).map((url, i) => (
                               <a 
                                 key={i}
                                 href={url} 
                                 target="_blank" 
                                 rel="noopener noreferrer"
                                 className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                               >
                                 <ExternalLink className="h-3 w-3" />
                                 {url.replace("https://getpawsy.pet", "").slice(0, 30)}
                               </a>
                             ))}
                           </div>
                         )}
                       </div>
                     </div>
                   </div>
                 ))}
               </div>
             </ScrollArea>
           )}
         </CardContent>
       </Card>
     </div>
   );
 }
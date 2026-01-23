import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RefreshCw, ChevronDown, CheckCircle, XCircle, Clock, Play } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";

interface VariantFixLog {
  id: string;
  products_fixed: number;
  total_variants_fixed: number;
  fixed_products: string[];
  triggered_by: string;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

export default function VariantFixLogs() {
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ['variant-fix-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('variant_fix_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as VariantFixLog[];
    }
  });

  const runManualFix = async () => {
    setIsRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('fix-variant-data');
      
      if (error) throw error;
      
      toast.success(`Fix voltooid: ${data.productsFixed} producten gecorrigeerd`);
      refetch();
    } catch (error) {
      toast.error('Fout bij uitvoeren van fix');
      console.error(error);
    } finally {
      setIsRunning(false);
    }
  };

  const totalProductsFixed = logs?.reduce((sum, log) => sum + (log.success ? log.products_fixed : 0), 0) || 0;
  const totalVariantsFixed = logs?.reduce((sum, log) => sum + (log.success ? log.total_variants_fixed : 0), 0) || 0;
  const successRate = logs?.length 
    ? Math.round((logs.filter(l => l.success).length / logs.length) * 100) 
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Variant Fix Logboek</h2>
          <p className="text-muted-foreground">
            Overzicht van automatische en handmatige variant data correcties
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Vernieuwen
          </Button>
          <Button onClick={runManualFix} disabled={isRunning}>
            <Play className={`h-4 w-4 mr-2 ${isRunning ? 'animate-spin' : ''}`} />
            Nu uitvoeren
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Totaal runs</CardDescription>
            <CardTitle className="text-3xl">{logs?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Producten gecorrigeerd</CardDescription>
            <CardTitle className="text-3xl">{totalProductsFixed}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Varianten gecorrigeerd</CardDescription>
            <CardTitle className="text-3xl">{totalVariantsFixed}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Success rate</CardDescription>
            <CardTitle className="text-3xl">{successRate}%</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recente runs</CardTitle>
          <CardDescription>Laatste 50 variant fix runs</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nog geen fix runs uitgevoerd
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum/Tijd</TableHead>
                  <TableHead>Bron</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Producten</TableHead>
                  <TableHead>Varianten</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs?.map((log) => (
                  <Collapsible key={log.id} asChild open={expandedLog === log.id}>
                    <>
                      <TableRow className="cursor-pointer hover:bg-muted/50">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            {format(new Date(log.created_at), "d MMM yyyy HH:mm", { locale: nl })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={log.triggered_by === 'cron' ? 'secondary' : 'outline'}>
                            {log.triggered_by === 'cron' ? 'Automatisch' : 'Handmatig'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {log.success ? (
                            <Badge variant="default" className="bg-green-500">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Succes
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <XCircle className="h-3 w-3 mr-1" />
                              Fout
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{log.products_fixed}</TableCell>
                        <TableCell>{log.total_variants_fixed}</TableCell>
                        <TableCell>
                          <CollapsibleTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                            >
                              <ChevronDown className={`h-4 w-4 transition-transform ${expandedLog === log.id ? 'rotate-180' : ''}`} />
                            </Button>
                          </CollapsibleTrigger>
                        </TableCell>
                      </TableRow>
                      <CollapsibleContent asChild>
                        <TableRow>
                          <TableCell colSpan={6} className="bg-muted/30">
                            <div className="py-2 px-4">
                              {log.error_message ? (
                                <div className="text-destructive">
                                  <strong>Foutmelding:</strong> {log.error_message}
                                </div>
                              ) : log.fixed_products && log.fixed_products.length > 0 ? (
                                <div>
                                  <strong>Gecorrigeerde producten:</strong>
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {log.fixed_products.map((name, i) => (
                                      <Badge key={i} variant="outline" className="text-xs">
                                        {name}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">
                                  Geen producten gecorrigeerd in deze run
                                </span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      </CollapsibleContent>
                    </>
                  </Collapsible>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

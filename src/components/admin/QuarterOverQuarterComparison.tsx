import { memo, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  Minus,
  TrendingUp,
  Users,
  Eye,
  Clock,
  ShoppingCart,
  DollarSign,
  BarChart2,
  Percent,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2
} from "lucide-react";
import { format, subQuarters, startOfQuarter, endOfQuarter, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";

interface GA4Snapshot {
  id: string;
  report_date: string;
  active_users: number | null;
  new_users: number | null;
  sessions: number | null;
  page_views: number | null;
  avg_session_duration: number | null;
  bounce_rate: number | null;
  revenue: number | null;
  purchases: number | null;
}

interface MetricRow {
  key: string;
  label: string;
  icon: React.ElementType;
  thisQuarter: number;
  lastQuarter: number;
  change: number;
  changePercent: number;
  format: (value: number) => string;
  higherIsBetter: boolean;
}

const QuarterOverQuarterComparison = memo(() => {
  const [isExporting, setIsExporting] = useState(false);

  // Get data for last 200 days to cover both quarters
  const { data: snapshots, isLoading, error } = useQuery({
    queryKey: ["ga4-quarter-comparison"],
    queryFn: async () => {
      const startDate = subQuarters(new Date(), 2);
      
      const { data, error } = await supabase
        .from("ga4_daily_snapshots")
        .select("*")
        .gte("report_date", format(startDate, "yyyy-MM-dd"))
        .order("report_date", { ascending: true });

      if (error) throw error;
      return data as GA4Snapshot[];
    },
  });

  const quarterData = useMemo(() => {
    if (!snapshots?.length) return null;

    const today = new Date();
    const thisQuarterStart = startOfQuarter(today);
    const thisQuarterEnd = endOfQuarter(today);
    const lastQuarterStart = startOfQuarter(subQuarters(today, 1));
    const lastQuarterEnd = endOfQuarter(subQuarters(today, 1));

    // Filter snapshots by quarter
    const thisQuarterData = snapshots.filter(s => {
      const date = parseISO(s.report_date);
      return date >= thisQuarterStart && date <= thisQuarterEnd;
    });

    const lastQuarterData = snapshots.filter(s => {
      const date = parseISO(s.report_date);
      return date >= lastQuarterStart && date <= lastQuarterEnd;
    });

    // Helper to sum metrics
    const sumMetric = (data: GA4Snapshot[], key: keyof GA4Snapshot) => 
      data.reduce((sum, d) => sum + (Number(d[key]) || 0), 0);

    // Helper to average metrics
    const avgMetric = (data: GA4Snapshot[], key: keyof GA4Snapshot) => {
      if (data.length === 0) return 0;
      return sumMetric(data, key) / data.length;
    };

    const getQuarterName = (date: Date) => {
      const quarter = Math.floor(date.getMonth() / 3) + 1;
      return `Q${quarter} ${date.getFullYear()}`;
    };

    const thisQuarterMetrics = {
      users: sumMetric(thisQuarterData, "active_users"),
      newUsers: sumMetric(thisQuarterData, "new_users"),
      sessions: sumMetric(thisQuarterData, "sessions"),
      pageViews: sumMetric(thisQuarterData, "page_views"),
      avgDuration: avgMetric(thisQuarterData, "avg_session_duration"),
      bounceRate: avgMetric(thisQuarterData, "bounce_rate"),
      revenue: sumMetric(thisQuarterData, "revenue"),
      purchases: sumMetric(thisQuarterData, "purchases"),
    };

    const lastQuarterMetrics = {
      users: sumMetric(lastQuarterData, "active_users"),
      newUsers: sumMetric(lastQuarterData, "new_users"),
      sessions: sumMetric(lastQuarterData, "sessions"),
      pageViews: sumMetric(lastQuarterData, "page_views"),
      avgDuration: avgMetric(lastQuarterData, "avg_session_duration"),
      bounceRate: avgMetric(lastQuarterData, "bounce_rate"),
      revenue: sumMetric(lastQuarterData, "revenue"),
      purchases: sumMetric(lastQuarterData, "purchases"),
    };

    return {
      thisQuarter: thisQuarterMetrics,
      lastQuarter: lastQuarterMetrics,
      thisQuarterDays: thisQuarterData.length,
      lastQuarterDays: lastQuarterData.length,
      thisQuarterName: getQuarterName(thisQuarterStart),
      lastQuarterName: getQuarterName(lastQuarterStart),
    };
  }, [snapshots]);

  const metrics = useMemo((): MetricRow[] | null => {
    if (!quarterData) return null;

    const { thisQuarter, lastQuarter } = quarterData;

    const calculateChange = (current: number, previous: number) => {
      const change = current - previous;
      const changePercent = previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : 0;
      return { change, changePercent };
    };

    const formatNumber = (v: number) => v.toLocaleString("nl-NL");
    const formatCurrency = (v: number) => `€${v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formatPercent = (v: number) => `${v.toFixed(1)}%`;
    const formatDuration = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    return [
      {
        key: "users",
        label: "Actieve Gebruikers",
        icon: Users,
        thisQuarter: thisQuarter.users,
        lastQuarter: lastQuarter.users,
        ...calculateChange(thisQuarter.users, lastQuarter.users),
        format: formatNumber,
        higherIsBetter: true,
      },
      {
        key: "newUsers",
        label: "Nieuwe Gebruikers",
        icon: Users,
        thisQuarter: thisQuarter.newUsers,
        lastQuarter: lastQuarter.newUsers,
        ...calculateChange(thisQuarter.newUsers, lastQuarter.newUsers),
        format: formatNumber,
        higherIsBetter: true,
      },
      {
        key: "sessions",
        label: "Sessies",
        icon: BarChart2,
        thisQuarter: thisQuarter.sessions,
        lastQuarter: lastQuarter.sessions,
        ...calculateChange(thisQuarter.sessions, lastQuarter.sessions),
        format: formatNumber,
        higherIsBetter: true,
      },
      {
        key: "pageViews",
        label: "Paginaweergaven",
        icon: Eye,
        thisQuarter: thisQuarter.pageViews,
        lastQuarter: lastQuarter.pageViews,
        ...calculateChange(thisQuarter.pageViews, lastQuarter.pageViews),
        format: formatNumber,
        higherIsBetter: true,
      },
      {
        key: "avgDuration",
        label: "Gem. Sessieduur",
        icon: Clock,
        thisQuarter: thisQuarter.avgDuration,
        lastQuarter: lastQuarter.avgDuration,
        ...calculateChange(thisQuarter.avgDuration, lastQuarter.avgDuration),
        format: formatDuration,
        higherIsBetter: true,
      },
      {
        key: "bounceRate",
        label: "Bounce Rate",
        icon: Percent,
        thisQuarter: thisQuarter.bounceRate,
        lastQuarter: lastQuarter.bounceRate,
        ...calculateChange(thisQuarter.bounceRate, lastQuarter.bounceRate),
        format: formatPercent,
        higherIsBetter: false,
      },
      {
        key: "revenue",
        label: "Omzet",
        icon: DollarSign,
        thisQuarter: thisQuarter.revenue,
        lastQuarter: lastQuarter.revenue,
        ...calculateChange(thisQuarter.revenue, lastQuarter.revenue),
        format: formatCurrency,
        higherIsBetter: true,
      },
      {
        key: "purchases",
        label: "Transacties",
        icon: ShoppingCart,
        thisQuarter: thisQuarter.purchases,
        lastQuarter: lastQuarter.purchases,
        ...calculateChange(thisQuarter.purchases, lastQuarter.purchases),
        format: formatNumber,
        higherIsBetter: true,
      },
    ];
  }, [quarterData]);

  const exportToExcel = async () => {
    if (!metrics || !quarterData) return;
    
    setIsExporting(true);
    try {
      const data = metrics.map(m => ({
        "Metric": m.label,
        [quarterData.thisQuarterName]: m.format(m.thisQuarter),
        [quarterData.lastQuarterName]: m.format(m.lastQuarter),
        "Verschil": `${m.change > 0 ? "+" : ""}${m.format(m.change)}`,
        "Trend (%)": `${m.changePercent > 0 ? "+" : ""}${m.changePercent.toFixed(1)}%`,
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [
        { wch: 20 },
        { wch: 15 },
        { wch: 15 },
        { wch: 15 },
        { wch: 12 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Kwartaal-over-Kwartaal");
      
      const filename = `kwartaal-over-kwartaal-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
      XLSX.writeFile(wb, filename);
      
      toast.success("Excel bestand gedownload", { description: filename });
    } catch (err) {
      console.error("Excel export error:", err);
      toast.error("Fout bij exporteren naar Excel");
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPDF = async () => {
    if (!metrics || !quarterData) return;
    
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("Kwartaal-over-Kwartaal Vergelijking", pageWidth / 2, 20, { align: "center" });
      
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text(
        `${quarterData.thisQuarterName} vs ${quarterData.lastQuarterName}`,
        pageWidth / 2,
        28,
        { align: "center" }
      );
      
      doc.setFontSize(9);
      doc.setTextColor(128, 128, 128);
      doc.text(
        `Gegenereerd op: ${format(new Date(), "d MMMM yyyy 'om' HH:mm", { locale: nl })}`,
        pageWidth / 2,
        35,
        { align: "center" }
      );
      
      const startY = 45;
      const colX = [14, 64, 99, 134, 164];
      const rowHeight = 8;
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.setFillColor(245, 245, 245);
      doc.rect(14, startY - 5, pageWidth - 28, rowHeight, "F");
      
      const headers = ["Metric", "Dit Kwartaal", "Vorig Kwartaal", "Verschil", "Trend"];
      headers.forEach((header, i) => {
        doc.text(header, colX[i], startY);
      });
      
      doc.setFont("helvetica", "normal");
      let currentY = startY + rowHeight + 2;
      
      metrics.forEach((metric, index) => {
        if (index % 2 === 0) {
          doc.setFillColor(250, 250, 250);
          doc.rect(14, currentY - 5, pageWidth - 28, rowHeight, "F");
        }
        
        doc.setTextColor(0, 0, 0);
        doc.text(metric.label, colX[0], currentY);
        doc.text(metric.format(metric.thisQuarter), colX[1], currentY);
        doc.text(metric.format(metric.lastQuarter), colX[2], currentY);
        
        const isPositive = metric.changePercent > 0;
        const isGood = metric.higherIsBetter ? isPositive : !isPositive;
        
        if (Math.abs(metric.changePercent) >= 0.5) {
          doc.setTextColor(isGood ? 34 : 220, isGood ? 139 : 38, isGood ? 34 : 38);
        } else {
          doc.setTextColor(128, 128, 128);
        }
        
        doc.text(`${metric.change > 0 ? "+" : ""}${metric.format(metric.change)}`, colX[3], currentY);
        doc.text(`${isPositive ? "+" : ""}${metric.changePercent.toFixed(1)}%`, colX[4], currentY);
        
        currentY += rowHeight;
      });
      
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text(
        `GetPawsy Analytics Report - ${quarterData.thisQuarterDays} dagen data dit kwartaal, ${quarterData.lastQuarterDays} dagen data vorig kwartaal`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: "center" }
      );
      
      const filename = `kwartaal-over-kwartaal-${format(new Date(), "yyyy-MM-dd")}.pdf`;
      doc.save(filename);
      
      toast.success("PDF bestand gedownload", { description: filename });
    } catch (err) {
      console.error("PDF export error:", err);
      toast.error("Fout bij exporteren naar PDF");
    } finally {
      setIsExporting(false);
    }
  };

  const ChangeBadge = ({ value, higherIsBetter }: { value: number; higherIsBetter: boolean }) => {
    const isPositive = value > 0;
    const isGood = higherIsBetter ? isPositive : !isPositive;
    
    if (Math.abs(value) < 0.5) {
      return (
        <Badge variant="secondary" className="text-xs font-medium">
          <Minus className="w-3 h-3 mr-1" />
          0%
        </Badge>
      );
    }
    
    return (
      <Badge 
        variant="secondary"
        className={cn(
          "text-xs font-medium",
          isGood 
            ? "bg-green-500/10 text-green-600 hover:bg-green-500/20" 
            : "bg-red-500/10 text-red-600 hover:bg-red-500/20"
        )}
      >
        {isPositive ? (
          <ArrowUpRight className="w-3 h-3 mr-1" />
        ) : (
          <ArrowDownRight className="w-3 h-3 mr-1" />
        )}
        {isPositive ? "+" : ""}{value.toFixed(1)}%
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !quarterData || !metrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Kwartaal-over-Kwartaal Vergelijking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Niet genoeg data beschikbaar voor kwartaal-over-kwartaal vergelijking
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Kwartaal-over-Kwartaal Vergelijking
          </CardTitle>
          <CardDescription>
            Vergelijk {quarterData.thisQuarterName} met {quarterData.lastQuarterName}
          </CardDescription>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={isExporting}>
              {isExporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Exporteren
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={exportToExcel}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Exporteer als Excel
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportToPDF}>
              <FileText className="w-4 h-4 mr-2" />
              Exporteer als PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Metric</TableHead>
                <TableHead className="text-right">
                  <div className="flex flex-col items-end">
                    <span>Dit Kwartaal</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      {quarterData.thisQuarterDays} dagen data
                    </span>
                  </div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="flex flex-col items-end">
                    <span>Vorig Kwartaal</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      {quarterData.lastQuarterDays} dagen data
                    </span>
                  </div>
                </TableHead>
                <TableHead className="text-right">Verschil</TableHead>
                <TableHead className="text-right w-[120px]">Trend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.map((metric) => {
                const Icon = metric.icon;
                return (
                  <TableRow key={metric.key}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{metric.label}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {metric.format(metric.thisQuarter)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {metric.format(metric.lastQuarter)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      <span className={cn(
                        metric.change > 0 
                          ? (metric.higherIsBetter ? "text-green-600" : "text-red-600")
                          : metric.change < 0 
                            ? (metric.higherIsBetter ? "text-red-600" : "text-green-600")
                            : "text-muted-foreground"
                      )}>
                        {metric.change > 0 ? "+" : ""}{metric.format(metric.change)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <ChangeBadge 
                        value={metric.changePercent} 
                        higherIsBetter={metric.higherIsBetter}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {metrics.filter(m => Math.abs(m.changePercent) >= 10).length > 0 && (
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
              <TrendingUp className="w-4 h-4 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Significante Veranderingen</p>
                <p className="text-muted-foreground">
                  {metrics
                    .filter(m => Math.abs(m.changePercent) >= 10)
                    .map(m => {
                      const isPositive = m.changePercent > 0;
                      const isGood = m.higherIsBetter ? isPositive : !isPositive;
                      return (
                        <span key={m.key} className="inline-block mr-2">
                          <span className={isGood ? "text-green-600" : "text-red-600"}>
                            {m.label}: {isPositive ? "+" : ""}{m.changePercent.toFixed(0)}%
                          </span>
                        </span>
                      );
                    })}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

QuarterOverQuarterComparison.displayName = "QuarterOverQuarterComparison";

export default QuarterOverQuarterComparison;

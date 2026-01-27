import { memo, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  FileBarChart,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus
} from "lucide-react";
import { 
  format, 
  subYears, 
  subQuarters,
  subMonths,
  subDays,
  startOfYear, 
  endOfYear,
  startOfQuarter,
  endOfQuarter,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  parseISO 
} from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";

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

interface PeriodMetrics {
  users: number;
  newUsers: number;
  sessions: number;
  pageViews: number;
  avgDuration: number;
  bounceRate: number;
  revenue: number;
  purchases: number;
}

interface ComparisonData {
  period: string;
  current: PeriodMetrics;
  previous: PeriodMetrics;
  currentLabel: string;
  previousLabel: string;
  daysData: { current: number; previous: number };
}

const CombinedAnalyticsReport = memo(() => {
  const [isExporting, setIsExporting] = useState(false);

  // Fetch data for all periods (2 years to cover everything)
  const { data: snapshots, isLoading, error } = useQuery({
    queryKey: ["ga4-combined-report"],
    queryFn: async () => {
      const startDate = subYears(new Date(), 2);
      
      const { data, error } = await supabase
        .from("ga4_daily_snapshots")
        .select("*")
        .gte("report_date", format(startDate, "yyyy-MM-dd"))
        .order("report_date", { ascending: true });

      if (error) throw error;
      return data as GA4Snapshot[];
    },
  });

  const allComparisons = useMemo(() => {
    if (!snapshots?.length) return null;

    const today = new Date();

    // Helper functions
    const sumMetric = (data: GA4Snapshot[], key: keyof GA4Snapshot) => 
      data.reduce((sum, d) => sum + (Number(d[key]) || 0), 0);

    const avgMetric = (data: GA4Snapshot[], key: keyof GA4Snapshot) => {
      if (data.length === 0) return 0;
      return sumMetric(data, key) / data.length;
    };

    const getMetrics = (data: GA4Snapshot[]): PeriodMetrics => ({
      users: sumMetric(data, "active_users"),
      newUsers: sumMetric(data, "new_users"),
      sessions: sumMetric(data, "sessions"),
      pageViews: sumMetric(data, "page_views"),
      avgDuration: avgMetric(data, "avg_session_duration"),
      bounceRate: avgMetric(data, "bounce_rate"),
      revenue: sumMetric(data, "revenue"),
      purchases: sumMetric(data, "purchases"),
    });

    const filterByRange = (start: Date, end: Date) => 
      snapshots.filter(s => {
        const date = parseISO(s.report_date);
        return date >= start && date <= end;
      });

    // Week-over-Week
    const thisWeekStart = startOfWeek(today, { weekStartsOn: 1 });
    const thisWeekEnd = endOfWeek(today, { weekStartsOn: 1 });
    const lastWeekStart = startOfWeek(subDays(thisWeekStart, 1), { weekStartsOn: 1 });
    const lastWeekEnd = endOfWeek(lastWeekStart, { weekStartsOn: 1 });
    
    const thisWeekData = filterByRange(thisWeekStart, thisWeekEnd);
    const lastWeekData = filterByRange(lastWeekStart, lastWeekEnd);

    // Month-over-Month
    const thisMonthStart = startOfMonth(today);
    const thisMonthEnd = endOfMonth(today);
    const lastMonthStart = startOfMonth(subMonths(today, 1));
    const lastMonthEnd = endOfMonth(subMonths(today, 1));
    
    const thisMonthData = filterByRange(thisMonthStart, thisMonthEnd);
    const lastMonthData = filterByRange(lastMonthStart, lastMonthEnd);

    // Quarter-over-Quarter
    const thisQuarterStart = startOfQuarter(today);
    const thisQuarterEnd = endOfQuarter(today);
    const lastQuarterStart = startOfQuarter(subQuarters(today, 1));
    const lastQuarterEnd = endOfQuarter(subQuarters(today, 1));
    
    const thisQuarterData = filterByRange(thisQuarterStart, thisQuarterEnd);
    const lastQuarterData = filterByRange(lastQuarterStart, lastQuarterEnd);

    const getQuarterName = (date: Date) => {
      const quarter = Math.floor(date.getMonth() / 3) + 1;
      return `Q${quarter} ${date.getFullYear()}`;
    };

    // Year-over-Year
    const thisYearStart = startOfYear(today);
    const thisYearEnd = endOfYear(today);
    const lastYearStart = startOfYear(subYears(today, 1));
    const lastYearEnd = endOfYear(subYears(today, 1));
    
    const thisYearData = filterByRange(thisYearStart, thisYearEnd);
    const lastYearData = filterByRange(lastYearStart, lastYearEnd);

    const comparisons: ComparisonData[] = [
      {
        period: "Week-over-Week",
        current: getMetrics(thisWeekData),
        previous: getMetrics(lastWeekData),
        currentLabel: `${format(thisWeekStart, "d MMM", { locale: nl })} - ${format(thisWeekEnd, "d MMM", { locale: nl })}`,
        previousLabel: `${format(lastWeekStart, "d MMM", { locale: nl })} - ${format(lastWeekEnd, "d MMM", { locale: nl })}`,
        daysData: { current: thisWeekData.length, previous: lastWeekData.length },
      },
      {
        period: "Maand-over-Maand",
        current: getMetrics(thisMonthData),
        previous: getMetrics(lastMonthData),
        currentLabel: format(thisMonthStart, "MMMM yyyy", { locale: nl }),
        previousLabel: format(lastMonthStart, "MMMM yyyy", { locale: nl }),
        daysData: { current: thisMonthData.length, previous: lastMonthData.length },
      },
      {
        period: "Kwartaal-over-Kwartaal",
        current: getMetrics(thisQuarterData),
        previous: getMetrics(lastQuarterData),
        currentLabel: getQuarterName(thisQuarterStart),
        previousLabel: getQuarterName(lastQuarterStart),
        daysData: { current: thisQuarterData.length, previous: lastQuarterData.length },
      },
      {
        period: "Jaar-over-Jaar",
        current: getMetrics(thisYearData),
        previous: getMetrics(lastYearData),
        currentLabel: format(thisYearStart, "yyyy"),
        previousLabel: format(lastYearStart, "yyyy"),
        daysData: { current: thisYearData.length, previous: lastYearData.length },
      },
    ];

    return comparisons;
  }, [snapshots]);

  const metricLabels = [
    { key: "users", label: "Actieve Gebruikers", higherIsBetter: true },
    { key: "newUsers", label: "Nieuwe Gebruikers", higherIsBetter: true },
    { key: "sessions", label: "Sessies", higherIsBetter: true },
    { key: "pageViews", label: "Paginaweergaven", higherIsBetter: true },
    { key: "avgDuration", label: "Gem. Sessieduur", higherIsBetter: true },
    { key: "bounceRate", label: "Bounce Rate", higherIsBetter: false },
    { key: "revenue", label: "Omzet", higherIsBetter: true },
    { key: "purchases", label: "Transacties", higherIsBetter: true },
  ];

  const formatValue = (key: string, value: number): string => {
    switch (key) {
      case "revenue":
        return `€${value.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      case "bounceRate":
        return `${value.toFixed(1)}%`;
      case "avgDuration":
        const mins = Math.floor(value / 60);
        const secs = Math.round(value % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
      default:
        return value.toLocaleString("nl-NL");
    }
  };

  const calculateChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  const exportToExcel = async () => {
    if (!allComparisons) return;
    
    setIsExporting(true);
    try {
      const wb = XLSX.utils.book_new();

      // Summary sheet
      const summaryData: Record<string, string | number>[] = [];
      
      metricLabels.forEach(({ key, label }) => {
        const row: Record<string, string | number> = { Metric: label };
        allComparisons.forEach(comp => {
          const current = comp.current[key as keyof PeriodMetrics];
          const previous = comp.previous[key as keyof PeriodMetrics];
          const change = calculateChange(current, previous);
          row[`${comp.period} - Huidig`] = formatValue(key, current);
          row[`${comp.period} - Vorig`] = formatValue(key, previous);
          row[`${comp.period} - Trend`] = `${change > 0 ? "+" : ""}${change.toFixed(1)}%`;
        });
        summaryData.push(row);
      });

      const summarySheet = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summarySheet, "Overzicht");

      // Individual period sheets
      allComparisons.forEach(comp => {
        const periodData = metricLabels.map(({ key, label }) => {
          const current = comp.current[key as keyof PeriodMetrics];
          const previous = comp.previous[key as keyof PeriodMetrics];
          const change = calculateChange(current, previous);
          return {
            Metric: label,
            [comp.currentLabel]: formatValue(key, current),
            [comp.previousLabel]: formatValue(key, previous),
            Verschil: `${change > 0 ? "+" : ""}${change.toFixed(1)}%`,
          };
        });

        const ws = XLSX.utils.json_to_sheet(periodData);
        ws["!cols"] = [{ wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws, comp.period.substring(0, 31));
      });

      const filename = `analytics-overzicht-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
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
    if (!allComparisons) return;
    
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      // Title page
      doc.setFontSize(24);
      doc.setFont("helvetica", "bold");
      doc.text("Analytics Overzichtsrapport", pageWidth / 2, 40, { align: "center" });
      
      doc.setFontSize(14);
      doc.setFont("helvetica", "normal");
      doc.text("GetPawsy - Periodieke Vergelijkingen", pageWidth / 2, 55, { align: "center" });
      
      doc.setFontSize(11);
      doc.setTextColor(128, 128, 128);
      doc.text(
        `Gegenereerd op: ${format(new Date(), "d MMMM yyyy 'om' HH:mm", { locale: nl })}`,
        pageWidth / 2,
        70,
        { align: "center" }
      );

      // Summary table on first page
      let currentY = 90;
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Samenvatting Trends", 14, currentY);
      currentY += 10;

      // Headers
      doc.setFontSize(9);
      doc.setFillColor(245, 245, 245);
      doc.rect(14, currentY - 5, pageWidth - 28, 8, "F");
      
      const summaryHeaders = ["Metric", "Week", "Maand", "Kwartaal", "Jaar"];
      const summaryColX = [14, 60, 95, 130, 165];
      summaryHeaders.forEach((h, i) => doc.text(h, summaryColX[i], currentY));
      currentY += 10;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);

      metricLabels.slice(0, 6).forEach(({ key, label, higherIsBetter }, idx) => {
        if (idx % 2 === 0) {
          doc.setFillColor(250, 250, 250);
          doc.rect(14, currentY - 4, pageWidth - 28, 7, "F");
        }

        doc.setTextColor(0, 0, 0);
        doc.text(label, summaryColX[0], currentY);

        allComparisons.forEach((comp, i) => {
          const current = comp.current[key as keyof PeriodMetrics];
          const previous = comp.previous[key as keyof PeriodMetrics];
          const change = calculateChange(current, previous);
          const isPositive = change > 0;
          const isGood = higherIsBetter ? isPositive : !isPositive;

          if (Math.abs(change) >= 0.5) {
            doc.setTextColor(isGood ? 34 : 220, isGood ? 139 : 38, isGood ? 34 : 38);
          } else {
            doc.setTextColor(128, 128, 128);
          }
          doc.text(`${isPositive ? "+" : ""}${change.toFixed(0)}%`, summaryColX[i + 1], currentY);
        });

        currentY += 7;
      });

      // Individual period pages
      allComparisons.forEach((comp, pageIndex) => {
        doc.addPage();
        let y = 20;

        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        doc.text(comp.period, pageWidth / 2, y, { align: "center" });
        y += 10;

        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        doc.text(`${comp.currentLabel} vs ${comp.previousLabel}`, pageWidth / 2, y, { align: "center" });
        y += 8;

        doc.setFontSize(9);
        doc.setTextColor(128, 128, 128);
        doc.text(
          `${comp.daysData.current} dagen huidig, ${comp.daysData.previous} dagen vorig`,
          pageWidth / 2,
          y,
          { align: "center" }
        );
        y += 15;

        // Table headers
        const colX = [14, 70, 110, 150, 175];
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        doc.setFillColor(245, 245, 245);
        doc.rect(14, y - 5, pageWidth - 28, 8, "F");

        ["Metric", "Huidig", "Vorig", "Verschil", "Trend"].forEach((h, i) => {
          doc.text(h, colX[i], y);
        });
        y += 10;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);

        metricLabels.forEach(({ key, label, higherIsBetter }, idx) => {
          if (idx % 2 === 0) {
            doc.setFillColor(250, 250, 250);
            doc.rect(14, y - 4, pageWidth - 28, 8, "F");
          }

          const current = comp.current[key as keyof PeriodMetrics];
          const previous = comp.previous[key as keyof PeriodMetrics];
          const change = calculateChange(current, previous);
          const diff = current - previous;
          const isPositive = change > 0;
          const isGood = higherIsBetter ? isPositive : !isPositive;

          doc.setTextColor(0, 0, 0);
          doc.text(label, colX[0], y);
          doc.text(formatValue(key, current), colX[1], y);
          doc.text(formatValue(key, previous), colX[2], y);

          if (Math.abs(change) >= 0.5) {
            doc.setTextColor(isGood ? 34 : 220, isGood ? 139 : 38, isGood ? 34 : 38);
          } else {
            doc.setTextColor(128, 128, 128);
          }

          doc.text(`${diff > 0 ? "+" : ""}${formatValue(key, diff)}`, colX[3], y);
          doc.text(`${isPositive ? "+" : ""}${change.toFixed(1)}%`, colX[4], y);

          y += 8;
        });
      });

      // Footer on all pages
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(128, 128, 128);
        doc.text(
          `GetPawsy Analytics - Pagina ${i} van ${totalPages}`,
          pageWidth / 2,
          pageHeight - 10,
          { align: "center" }
        );
      }
      
      const filename = `analytics-overzicht-${format(new Date(), "yyyy-MM-dd")}.pdf`;
      doc.save(filename);
      
      toast.success("PDF bestand gedownload", { description: filename });
    } catch (err) {
      console.error("PDF export error:", err);
      toast.error("Fout bij exporteren naar PDF");
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-6 w-64 bg-muted animate-pulse rounded" />
          <div className="h-4 w-96 bg-muted animate-pulse rounded" />
        </CardHeader>
        <CardContent>
          <div className="h-[200px] bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (error || !allComparisons) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileBarChart className="w-5 h-5 text-primary" />
            Gecombineerd Overzichtsrapport
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Niet genoeg data beschikbaar voor gecombineerd rapport
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
            <FileBarChart className="w-5 h-5 text-primary" />
            Gecombineerd Overzichtsrapport
          </CardTitle>
          <CardDescription>
            Exporteer alle vergelijkingen (week, maand, kwartaal, jaar) in één document
          </CardDescription>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="default" size="sm" disabled={isExporting}>
              {isExporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Rapport Exporteren
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={exportToExcel}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Exporteer als Excel (meerdere sheets)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportToPDF}>
              <FileText className="w-4 h-4 mr-2" />
              Exporteer als PDF (meerdere pagina's)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent>
        {/* Preview grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {allComparisons.map((comp) => {
            const revenueChange = calculateChange(comp.current.revenue, comp.previous.revenue);
            const usersChange = calculateChange(comp.current.users, comp.previous.users);
            
            return (
              <div key={comp.period} className="p-4 rounded-lg border bg-card">
                <h4 className="font-medium text-sm mb-2">{comp.period}</h4>
                <p className="text-xs text-muted-foreground mb-3">
                  {comp.currentLabel} vs {comp.previousLabel}
                </p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Omzet</span>
                    <span className={
                      revenueChange > 0 
                        ? "text-green-600 flex items-center gap-1" 
                        : revenueChange < 0 
                          ? "text-red-600 flex items-center gap-1" 
                          : "text-muted-foreground flex items-center gap-1"
                    }>
                      {revenueChange > 0 ? <TrendingUp className="w-3 h-3" /> : 
                       revenueChange < 0 ? <TrendingDown className="w-3 h-3" /> : 
                       <Minus className="w-3 h-3" />}
                      {revenueChange > 0 ? "+" : ""}{revenueChange.toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Gebruikers</span>
                    <span className={
                      usersChange > 0 
                        ? "text-green-600 flex items-center gap-1" 
                        : usersChange < 0 
                          ? "text-red-600 flex items-center gap-1" 
                          : "text-muted-foreground flex items-center gap-1"
                    }>
                      {usersChange > 0 ? <TrendingUp className="w-3 h-3" /> : 
                       usersChange < 0 ? <TrendingDown className="w-3 h-3" /> : 
                       <Minus className="w-3 h-3" />}
                      {usersChange > 0 ? "+" : ""}{usersChange.toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground mt-4 text-center">
          Het rapport bevat gedetailleerde vergelijkingen voor alle 8 metrics over alle tijdsperiodes
        </p>
      </CardContent>
    </Card>
  );
});

CombinedAnalyticsReport.displayName = "CombinedAnalyticsReport";

export default CombinedAnalyticsReport;

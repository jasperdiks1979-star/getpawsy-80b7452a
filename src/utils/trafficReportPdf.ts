import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";

interface TrafficReportData {
  totalSessions: number;
  totalEvents: number;
  cartSessions: number;
  checkoutSessions: number;
  purchaseSessions: number;
  addToCartSessions: number;
  viewCartSessions: number;
  productViewSessions: number;
  devices: Array<{ device_type: string; sessions: number }>;
  browsers: Array<{ browser: string; sessions: number }>;
  referrerCategories: Array<{ referrer_category: string; sessions: number }>;
  utmSources: Array<{ utm_source: string; utm_medium: string; utm_campaign: string; sessions: number }>;
  locations: Array<{ country: string; city: string; sessions: number }>;
  topPages: Array<{ page_path: string; visits: number }>;
  hourlyTraffic: Array<{ hour: string; sessions: number }>;
  funnelEvents: Array<{ activity_type: string; count: number; unique_sessions: number }>;
  conversionRate: number;
  cartToCheckoutRate: number;
  checkoutToPurchaseRate: number;
}

async function fetchTrafficData(): Promise<TrafficReportData> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Fetch all data in parallel, excluding internal traffic (Netherlands)
  const [
    devicesResult,
    browsersResult,
    referrersResult,
    utmResult,
    locationsResult,
    pagesResult,
    hourlyResult,
    funnelResult,
  ] = await Promise.all([
    supabase.from("visitor_activity")
      .select("device_type, session_id")
      .gte("created_at", cutoff)
      .or("is_internal.is.null,is_internal.eq.false"),
    supabase.from("visitor_activity")
      .select("browser, session_id")
      .gte("created_at", cutoff)
      .or("is_internal.is.null,is_internal.eq.false"),
    supabase.from("visitor_activity")
      .select("referrer_category, session_id")
      .gte("created_at", cutoff)
      .or("is_internal.is.null,is_internal.eq.false"),
    supabase.from("visitor_activity")
      .select("utm_source, utm_medium, utm_campaign, session_id")
      .gte("created_at", cutoff)
      .not("utm_source", "is", null)
      .or("is_internal.is.null,is_internal.eq.false"),
    supabase.from("visitor_activity")
      .select("country, city, session_id")
      .gte("created_at", cutoff)
      .or("is_internal.is.null,is_internal.eq.false"),
    supabase.from("visitor_activity")
      .select("page_path, session_id")
      .gte("created_at", cutoff)
      .not("page_path", "is", null)
      .or("is_internal.is.null,is_internal.eq.false"),
    supabase.from("visitor_activity")
      .select("created_at, session_id")
      .gte("created_at", cutoff)
      .or("is_internal.is.null,is_internal.eq.false"),
    supabase.from("visitor_activity")
      .select("activity_type, session_id")
      .gte("created_at", cutoff)
      .or("is_internal.is.null,is_internal.eq.false"),
  ]);

  // Process devices
  const deviceMap = new Map<string, Set<string>>();
  devicesResult.data?.forEach((row: any) => {
    const key = row.device_type || "unknown";
    if (!deviceMap.has(key)) deviceMap.set(key, new Set());
    deviceMap.get(key)!.add(row.session_id);
  });
  const devices = Array.from(deviceMap.entries())
    .map(([device_type, sessions]) => ({ device_type, sessions: sessions.size }))
    .sort((a, b) => b.sessions - a.sessions);

  // Process browsers
  const browserMap = new Map<string, Set<string>>();
  browsersResult.data?.forEach((row: any) => {
    const key = row.browser || "unknown";
    if (!browserMap.has(key)) browserMap.set(key, new Set());
    browserMap.get(key)!.add(row.session_id);
  });
  const browsers = Array.from(browserMap.entries())
    .map(([browser, sessions]) => ({ browser, sessions: sessions.size }))
    .sort((a, b) => b.sessions - a.sessions);

  // Process referrer categories
  const refMap = new Map<string, Set<string>>();
  referrersResult.data?.forEach((row: any) => {
    const key = row.referrer_category || "unknown";
    if (!refMap.has(key)) refMap.set(key, new Set());
    refMap.get(key)!.add(row.session_id);
  });
  const referrerCategories = Array.from(refMap.entries())
    .map(([referrer_category, sessions]) => ({ referrer_category, sessions: sessions.size }))
    .sort((a, b) => b.sessions - a.sessions);

  // Process UTM sources
  const utmMap = new Map<string, Set<string>>();
  utmResult.data?.forEach((row: any) => {
    const key = `${row.utm_source}|${row.utm_medium}|${row.utm_campaign}`;
    if (!utmMap.has(key)) utmMap.set(key, new Set());
    utmMap.get(key)!.add(row.session_id);
  });
  const utmSources = Array.from(utmMap.entries())
    .map(([key, sessions]) => {
      const [utm_source, utm_medium, utm_campaign] = key.split("|");
      return { utm_source, utm_medium, utm_campaign, sessions: sessions.size };
    })
    .sort((a, b) => b.sessions - a.sessions);

  // Process locations
  const locMap = new Map<string, Set<string>>();
  locationsResult.data?.forEach((row: any) => {
    const key = `${row.country || "Unknown"}|${row.city || "Unknown"}`;
    if (!locMap.has(key)) locMap.set(key, new Set());
    locMap.get(key)!.add(row.session_id);
  });
  const locations = Array.from(locMap.entries())
    .map(([key, sessions]) => {
      const [country, city] = key.split("|");
      return { country, city, sessions: sessions.size };
    })
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 20);

  // Process pages
  const pageMap = new Map<string, number>();
  pagesResult.data?.forEach((row: any) => {
    const key = row.page_path;
    pageMap.set(key, (pageMap.get(key) || 0) + 1);
  });
  const topPages = Array.from(pageMap.entries())
    .map(([page_path, visits]) => ({ page_path, visits }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 15);

  // Process hourly traffic
  const hourMap = new Map<string, Set<string>>();
  hourlyResult.data?.forEach((row: any) => {
    const hour = new Date(row.created_at).toISOString().slice(0, 13) + ":00";
    if (!hourMap.has(hour)) hourMap.set(hour, new Set());
    hourMap.get(hour)!.add(row.session_id);
  });
  const hourlyTraffic = Array.from(hourMap.entries())
    .map(([hour, sessions]) => ({ hour, sessions: sessions.size }))
    .sort((a, b) => a.hour.localeCompare(b.hour));

  // Process funnel events - count by activity type
  const funnelMap = new Map<string, { count: number; sessions: Set<string> }>();
  funnelResult.data?.forEach((row: any) => {
    const type = row.activity_type;
    if (!funnelMap.has(type)) {
      funnelMap.set(type, { count: 0, sessions: new Set() });
    }
    const entry = funnelMap.get(type)!;
    entry.count++;
    entry.sessions.add(row.session_id);
  });

  const funnelEvents = Array.from(funnelMap.entries())
    .map(([activity_type, data]) => ({
      activity_type,
      count: data.count,
      unique_sessions: data.sessions.size,
    }))
    .sort((a, b) => b.count - a.count);

  // Calculate totals from funnel data
  const allSessions = new Set<string>();
  const cartSessions = new Set<string>();
  const checkoutSessions = new Set<string>();
  const purchaseSessions = new Set<string>();
  const addToCartSessions = new Set<string>();
  const viewCartSessions = new Set<string>();
  const productViewSessions = new Set<string>();

  funnelResult.data?.forEach((row: any) => {
    allSessions.add(row.session_id);
    switch (row.activity_type) {
      case "cart":
        cartSessions.add(row.session_id);
        break;
      case "checkout":
        checkoutSessions.add(row.session_id);
        break;
      case "purchase":
        purchaseSessions.add(row.session_id);
        break;
      case "add_to_cart":
        addToCartSessions.add(row.session_id);
        break;
      case "view_cart":
        viewCartSessions.add(row.session_id);
        break;
      case "product_view":
        productViewSessions.add(row.session_id);
        break;
    }
  });

  // Calculate conversion rates
  const totalSessionCount = allSessions.size;
  const addToCartCount = addToCartSessions.size || cartSessions.size;
  const checkoutCount = checkoutSessions.size;
  const purchaseCount = purchaseSessions.size;

  const conversionRate = totalSessionCount > 0 ? (purchaseCount / totalSessionCount) * 100 : 0;
  const cartToCheckoutRate = addToCartCount > 0 ? (checkoutCount / addToCartCount) * 100 : 0;
  const checkoutToPurchaseRate = checkoutCount > 0 ? (purchaseCount / checkoutCount) * 100 : 0;

  return {
    totalSessions: allSessions.size,
    totalEvents: funnelResult.data?.length || 0,
    cartSessions: cartSessions.size,
    checkoutSessions: checkoutSessions.size,
    purchaseSessions: purchaseSessions.size,
    addToCartSessions: addToCartSessions.size,
    viewCartSessions: viewCartSessions.size,
    productViewSessions: productViewSessions.size,
    devices,
    browsers,
    referrerCategories,
    utmSources,
    locations,
    topPages,
    hourlyTraffic,
    funnelEvents,
    conversionRate,
    cartToCheckoutRate,
    checkoutToPurchaseRate,
  };
}

export async function generateTrafficReportPdf(): Promise<Blob> {
  const data = await fetchTrafficData();
  const doc = new jsPDF();
  
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;
  
  const addTitle = (text: string, size: number = 16) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", "bold");
    doc.text(text, 14, y);
    y += size * 0.5 + 4;
  };
  
  const addText = (text: string, size: number = 10) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", "normal");
    doc.text(text, 14, y);
    y += size * 0.4 + 2;
  };
  
  const addTableRow = (cols: string[], widths: number[], bold: boolean = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(9);
    let x = 14;
    cols.forEach((col, i) => {
      doc.text(col.substring(0, 40), x, y);
      x += widths[i];
    });
    y += 5;
  };
  
  const checkNewPage = (needed: number = 30) => {
    if (y > 270 - needed) {
      doc.addPage();
      y = 20;
    }
  };

  // Header
  const now = new Date();
  const reportDate = now.toLocaleDateString("en-US", { 
    day: "2-digit", 
    month: "long", 
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
  
  doc.setFillColor(59, 130, 246);
  doc.rect(0, 0, pageWidth, 35, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("Webshop Traffic Report", 14, 18);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Last 24 hours — Generated: ${reportDate}`, 14, 28);
  doc.setTextColor(0, 0, 0);
  y = 50;

  // Summary Stats
  addTitle("📊 Key Metrics", 14);
  y += 2;
  
  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(249, 250, 251);
  doc.roundedRect(14, y - 4, pageWidth - 28, 28, 3, 3, "FD");
  
  const statsX = [30, 65, 105, 145];
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(String(data.totalSessions), statsX[0], y + 10);
  doc.text(String(data.addToCartSessions || data.cartSessions), statsX[1], y + 10);
  doc.text(String(data.checkoutSessions), statsX[2], y + 10);
  doc.text(String(data.purchaseSessions), statsX[3], y + 10);
  
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("Sessions", statsX[0], y + 18);
  doc.text("Add to Cart", statsX[1], y + 18);
  doc.text("Checkout", statsX[2], y + 18);
  doc.text("Purchases", statsX[3], y + 18);
  doc.setTextColor(0, 0, 0);
  
  y += 38;

  // Conversion Funnel
  checkNewPage();
  addTitle("🎯 Conversion Funnel", 12);
  addTableRow(["Metric", "Rate"], [100, 60], true);
  addTableRow(["Overall Conversion Rate", `${data.conversionRate.toFixed(2)}%`], [100, 60]);
  addTableRow(["Cart → Checkout Rate", `${data.cartToCheckoutRate.toFixed(2)}%`], [100, 60]);
  addTableRow(["Checkout → Purchase Rate", `${data.checkoutToPurchaseRate.toFixed(2)}%`], [100, 60]);
  y += 8;

  // Funnel Events Breakdown
  checkNewPage();
  addTitle("📈 All Funnel Events", 12);
  addTableRow(["Event Type", "Total Events", "Unique Sessions"], [70, 50, 50], true);
  data.funnelEvents.forEach(event => {
    const eventLabel = event.activity_type
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
    addTableRow([eventLabel, String(event.count), String(event.unique_sessions)], [70, 50, 50]);
  });
  y += 5;

  // Devices
  checkNewPage();
  addTitle("📱 Devices", 12);
  addTableRow(["Device", "Sessions", "%"], [60, 40, 40], true);
  data.devices.forEach(d => {
    const pct = data.totalSessions > 0 ? ((d.sessions / data.totalSessions) * 100).toFixed(1) : "0";
    addTableRow([d.device_type, String(d.sessions), `${pct}%`], [60, 40, 40]);
  });
  y += 5;

  // Browsers
  checkNewPage();
  addTitle("🌐 Browsers", 12);
  addTableRow(["Browser", "Sessions", "%"], [60, 40, 40], true);
  data.browsers.slice(0, 5).forEach(b => {
    const pct = data.totalSessions > 0 ? ((b.sessions / data.totalSessions) * 100).toFixed(1) : "0";
    addTableRow([b.browser, String(b.sessions), `${pct}%`], [60, 40, 40]);
  });
  y += 5;

  // Traffic Sources
  checkNewPage();
  addTitle("📍 Traffic Sources", 12);
  addTableRow(["Category", "Sessions"], [80, 40], true);
  data.referrerCategories.forEach(r => {
    addTableRow([r.referrer_category, String(r.sessions)], [80, 40]);
  });
  y += 5;

  // UTM Campaigns
  if (data.utmSources.length > 0) {
    checkNewPage();
    addTitle("📌 Campaigns (UTM)", 12);
    addTableRow(["Source", "Medium", "Campaign", "Sessions"], [35, 35, 55, 30], true);
    data.utmSources.slice(0, 8).forEach(u => {
      addTableRow([
        u.utm_source || "-", 
        u.utm_medium || "-", 
        (u.utm_campaign || "-").substring(0, 20),
        String(u.sessions)
      ], [35, 35, 55, 30]);
    });
    y += 5;
  }

  // Locations
  checkNewPage(60);
  addTitle("🌍 Top Locations", 12);
  addTableRow(["Country", "City", "Sessions"], [50, 70, 30], true);
  data.locations.slice(0, 12).forEach(l => {
    addTableRow([l.country, l.city, String(l.sessions)], [50, 70, 30]);
  });
  y += 5;

  // Top Pages
  doc.addPage();
  y = 20;
  addTitle("📄 Most Visited Pages", 12);
  addTableRow(["Page", "Visits"], [130, 30], true);
  data.topPages.forEach(p => {
    const pageName = p.page_path.length > 50 ? p.page_path.substring(0, 50) + "..." : p.page_path;
    addTableRow([pageName, String(p.visits)], [130, 30]);
  });
  y += 5;

  // Hourly Traffic
  checkNewPage(80);
  addTitle("⏰ Traffic by Hour (UTC)", 12);
  addTableRow(["Time", "Sessions"], [80, 40], true);
  data.hourlyTraffic.forEach(h => {
    const hourDisplay = new Date(h.hour).toLocaleString("en-US", { 
      day: "2-digit", 
      month: "2-digit", 
      hour: "2-digit", 
      minute: "2-digit" 
    });
    addTableRow([hourDisplay, String(h.sessions)], [80, 40]);
  });

  // Footer on last page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, 290, { align: "center" });
    doc.text("GetPawsy.pet — Traffic Report (Internal traffic excluded)", 14, 290);
  }

  return doc.output("blob");
}

export async function downloadTrafficReportPdf(): Promise<void> {
  const blob = await generateTrafficReportPdf();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `traffic-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

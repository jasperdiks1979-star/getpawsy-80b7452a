import jsPDF from 'jspdf';
import {
  FREE_SHIPPING_THRESHOLD,
  FLAT_SHIPPING_RATE,
  DELIVERY_TIME_STANDARD,
  PROCESSING_TIME,
  RETURN_WINDOW_DAYS,
  SUPPORT_EMAIL,
} from '@/lib/shipping-constants';

/**
 * GetPawsy — Complete Admin & Compliance Guide PDF Generator
 * US Market Edition — Google Merchant Center Compliant
 * 
 * Single source of truth for:
 * - Business identity & transparency
 * - Shipping & returns policies
 * - Checkout consistency verification
 * - Google Merchant Center appeal documentation
 */

const MARGIN_LEFT = 20;
const MARGIN_RIGHT = 20;
const MARGIN_TOP = 25;
const MARGIN_BOTTOM = 30;
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const LINE_HEIGHT = 6.5;

let currentPage = 1;
let yPosition = MARGIN_TOP;

// Colors
const PRIMARY_COLOR: [number, number, number] = [79, 70, 229];
const SUCCESS_COLOR: [number, number, number] = [34, 197, 94];
const WARNING_COLOR: [number, number, number] = [234, 179, 8];
const DANGER_COLOR: [number, number, number] = [239, 68, 68];
const MUTED_COLOR: [number, number, number] = [107, 114, 128];
const ACCENT_COLOR: [number, number, number] = [59, 130, 246];

// ============= HELPER FUNCTIONS =============

const addPageNumber = (doc: jsPDF) => {
  doc.setFontSize(9);
  doc.setTextColor(...MUTED_COLOR);
  doc.text(`Page ${currentPage}`, PAGE_WIDTH / 2, PAGE_HEIGHT - 12, { align: 'center' });
  doc.setFontSize(8);
  doc.text('GetPawsy — Admin & Compliance Guide', MARGIN_LEFT, PAGE_HEIGHT - 12);
  doc.text('getpawsy.pet', PAGE_WIDTH - MARGIN_RIGHT, PAGE_HEIGHT - 12, { align: 'right' });
  doc.setTextColor(0, 0, 0);
};

const checkPageBreak = (doc: jsPDF, neededSpace: number = 30) => {
  if (yPosition + neededSpace > PAGE_HEIGHT - MARGIN_BOTTOM) {
    addPageNumber(doc);
    doc.addPage();
    currentPage++;
    yPosition = MARGIN_TOP;
  }
};

const addTitle = (doc: jsPDF, text: string, fontSize: number = 22) => {
  checkPageBreak(doc, 45);
  doc.setFontSize(fontSize);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PRIMARY_COLOR);
  doc.text(text, MARGIN_LEFT, yPosition);
  // Underline
  const w = doc.getTextWidth(text);
  doc.setDrawColor(...PRIMARY_COLOR);
  doc.setLineWidth(0.6);
  doc.line(MARGIN_LEFT, yPosition + 2, MARGIN_LEFT + Math.min(w, CONTENT_WIDTH), yPosition + 2);
  doc.setTextColor(0, 0, 0);
  yPosition += fontSize * 0.5 + 10;
};

const addSubtitle = (doc: jsPDF, text: string, fontSize: number = 13) => {
  checkPageBreak(doc, 25);
  yPosition += 4;
  doc.setFontSize(fontSize);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(50, 50, 50);
  doc.text(text, MARGIN_LEFT, yPosition);
  doc.setTextColor(0, 0, 0);
  yPosition += fontSize * 0.4 + 5;
};

const addParagraph = (doc: jsPDF, text: string, fontSize: number = 10.5) => {
  doc.setFontSize(fontSize);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  const lines = doc.splitTextToSize(text, CONTENT_WIDTH);
  for (const line of lines) {
    checkPageBreak(doc, LINE_HEIGHT + 5);
    doc.text(line, MARGIN_LEFT, yPosition);
    yPosition += LINE_HEIGHT;
  }
  doc.setTextColor(0, 0, 0);
  yPosition += 4;
};

const addBoldParagraph = (doc: jsPDF, text: string) => {
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 40, 40);
  const lines = doc.splitTextToSize(text, CONTENT_WIDTH);
  for (const line of lines) {
    checkPageBreak(doc, LINE_HEIGHT + 5);
    doc.text(line, MARGIN_LEFT, yPosition);
    yPosition += LINE_HEIGHT;
  }
  doc.setTextColor(0, 0, 0);
  yPosition += 4;
};

const addBox = (doc: jsPDF, title: string, content: string, bgColor: [number, number, number], borderColor: [number, number, number], titleColor: [number, number, number], prefix: string = '') => {
  checkPageBreak(doc, 40);
  const lines = doc.splitTextToSize(content, CONTENT_WIDTH - 16);
  const boxHeight = Math.max(25, lines.length * LINE_HEIGHT + 18);
  doc.setFillColor(...bgColor);
  doc.setDrawColor(...borderColor);
  doc.roundedRect(MARGIN_LEFT, yPosition - 3, CONTENT_WIDTH, boxHeight, 3, 3, 'FD');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...titleColor);
  doc.text(`${prefix}${title}`, MARGIN_LEFT + 6, yPosition + 5);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  let lineY = yPosition + 13;
  for (const line of lines) {
    doc.text(line, MARGIN_LEFT + 6, lineY);
    lineY += LINE_HEIGHT;
  }
  doc.setTextColor(0, 0, 0);
  yPosition += boxHeight + 6;
};

const addTipBox = (doc: jsPDF, title: string, content: string) => {
  addBox(doc, title, content, [236, 253, 245], SUCCESS_COLOR, SUCCESS_COLOR, 'TIP: ');
};

const addWarningBox = (doc: jsPDF, content: string) => {
  addBox(doc, '', content, [254, 252, 232], WARNING_COLOR, [120, 100, 20], 'WARNING: ');
};

const addInfoBox = (doc: jsPDF, title: string, content: string) => {
  addBox(doc, title, content, [238, 242, 255], PRIMARY_COLOR, PRIMARY_COLOR);
};

const addComplianceBox = (doc: jsPDF, title: string, content: string) => {
  addBox(doc, title, content, [240, 253, 244], [22, 163, 74], [22, 163, 74], 'COMPLIANT: ');
};

const addCriticalBox = (doc: jsPDF, title: string, content: string) => {
  addBox(doc, title, content, [254, 242, 242], DANGER_COLOR, DANGER_COLOR, 'CRITICAL: ');
};

const addChecklistItem = (doc: jsPDF, text: string, isPositive: boolean) => {
  checkPageBreak(doc, 12);
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  if (isPositive) {
    doc.setTextColor(...SUCCESS_COLOR);
    doc.text('[OK]', MARGIN_LEFT, yPosition);
  } else {
    doc.setTextColor(...DANGER_COLOR);
    doc.text('[X]', MARGIN_LEFT + 1, yPosition);
  }
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  doc.text(text, MARGIN_LEFT + 14, yPosition);
  doc.setTextColor(0, 0, 0);
  yPosition += LINE_HEIGHT + 2;
};

const addBulletPoint = (doc: jsPDF, text: string, indent: number = 0) => {
  checkPageBreak(doc, 12);
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  const bulletX = MARGIN_LEFT + indent;
  doc.text('•', bulletX, yPosition);
  const textLines = doc.splitTextToSize(text, CONTENT_WIDTH - indent - 8);
  doc.text(textLines[0], bulletX + 6, yPosition);
  yPosition += LINE_HEIGHT;
  for (let i = 1; i < textLines.length; i++) {
    doc.text(textLines[i], bulletX + 6, yPosition);
    yPosition += LINE_HEIGHT;
  }
  doc.setTextColor(0, 0, 0);
  yPosition += 1;
};

const addSpace = (_doc: jsPDF, space: number = 10) => {
  yPosition += space;
};

const startNewPage = (doc: jsPDF) => {
  addPageNumber(doc);
  doc.addPage();
  currentPage++;
  yPosition = MARGIN_TOP;
};

const addTableRow = (doc: jsPDF, col1: string, col2: string, isHeader: boolean = false) => {
  checkPageBreak(doc, 12);
  const col1Width = CONTENT_WIDTH * 0.4;
  if (isHeader) {
    doc.setFillColor(243, 244, 246);
    doc.rect(MARGIN_LEFT, yPosition - 4, CONTENT_WIDTH, 10, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 40);
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
  }
  doc.setFontSize(10);
  doc.text(col1, MARGIN_LEFT + 4, yPosition);
  const lines2 = doc.splitTextToSize(col2, CONTENT_WIDTH - col1Width - 8);
  doc.text(lines2[0], MARGIN_LEFT + col1Width, yPosition);
  yPosition += LINE_HEIGHT;
  for (let i = 1; i < lines2.length; i++) {
    doc.text(lines2[i], MARGIN_LEFT + col1Width, yPosition);
    yPosition += LINE_HEIGHT;
  }
  // Light separator line
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.2);
  doc.line(MARGIN_LEFT, yPosition, MARGIN_LEFT + CONTENT_WIDTH, yPosition);
  yPosition += 3;
  doc.setTextColor(0, 0, 0);
};

const addSectionDivider = (doc: jsPDF) => {
  checkPageBreak(doc, 15);
  yPosition += 5;
  doc.setDrawColor(...MUTED_COLOR);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_LEFT + 30, yPosition, PAGE_WIDTH - MARGIN_RIGHT - 30, yPosition);
  yPosition += 8;
};

// ============= MAIN GENERATOR =============

export const generateAdminManualPdf = (): jsPDF => {
  const doc = new jsPDF('p', 'mm', 'a4');
  currentPage = 1;
  yPosition = MARGIN_TOP;

  // =====================================
  // COVER PAGE
  // =====================================
  yPosition = 50;

  // Accent bar at top
  doc.setFillColor(...PRIMARY_COLOR);
  doc.rect(0, 0, PAGE_WIDTH, 8, 'F');

  doc.setFontSize(38);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PRIMARY_COLOR);
  doc.text('GetPawsy', PAGE_WIDTH / 2, yPosition, { align: 'center' });
  yPosition += 16;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED_COLOR);
  doc.text('A consumer brand operated by Skidzo', PAGE_WIDTH / 2, yPosition, { align: 'center' });
  yPosition += 20;

  // Decorative line
  doc.setDrawColor(...PRIMARY_COLOR);
  doc.setLineWidth(0.8);
  doc.line(PAGE_WIDTH / 2 - 45, yPosition, PAGE_WIDTH / 2 + 45, yPosition);
  yPosition += 15;

  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(50, 50, 50);
  doc.text('Complete Admin &', PAGE_WIDTH / 2, yPosition, { align: 'center' });
  yPosition += 10;
  doc.text('Compliance Guide', PAGE_WIDTH / 2, yPosition, { align: 'center' });
  yPosition += 14;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...ACCENT_COLOR);
  doc.text('US Market Edition', PAGE_WIDTH / 2, yPosition, { align: 'center' });
  yPosition += 25;

  // Key details box on cover
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(200, 200, 200);
  doc.roundedRect(MARGIN_LEFT + 15, yPosition, CONTENT_WIDTH - 30, 55, 4, 4, 'FD');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  const coverDetails = [
    `Domain: getpawsy.pet`,
    `Legal Entity: Skidzo (KVK: 78156955)`,
    `Market: United States Only`,
    `Currency: USD ($)`,
    `Support: ${SUPPORT_EMAIL}`,
    `Shipping: Free on $${FREE_SHIPPING_THRESHOLD}+ | $${FLAT_SHIPPING_RATE.toFixed(2)} flat rate under`,
    `Returns: ${RETURN_WINDOW_DAYS}-day return window`,
  ];
  let detailY = yPosition + 10;
  for (const detail of coverDetails) {
    doc.text(detail, PAGE_WIDTH / 2, detailY, { align: 'center' });
    detailY += 7;
  }

  yPosition += 70;
  doc.setFontSize(9);
  doc.setTextColor(...MUTED_COLOR);
  doc.text('This document is suitable for Google Merchant Center review,', PAGE_WIDTH / 2, yPosition, { align: 'center' });
  yPosition += 5;
  doc.text('internal admin reference, and trust verification.', PAGE_WIDTH / 2, yPosition, { align: 'center' });

  addPageNumber(doc);

  // =====================================
  // TABLE OF CONTENTS
  // =====================================
  startNewPage(doc);
  addTitle(doc, 'Table of Contents', 24);
  addSpace(doc, 8);

  const tocItems = [
    { title: '1.  Introduction', page: 3 },
    { title: '2.  Dashboard Overview', page: 5 },
    { title: '3.  Icons & Symbols Guide', page: 7 },
    { title: '4.  Visitor Behavior', page: 9 },
    { title: '5.  Products & Categories', page: 11 },
    { title: '6.  Inventory & Stock', page: 13 },
    { title: '7.  Cart & Checkout', page: 15 },
    { title: '8.  Analytics', page: 17 },
    { title: '9.  Advertising (Pinterest / Google)', page: 19 },
    { title: '10. Technical Glossary', page: 21 },
    { title: '11. When to Intervene', page: 23 },
    { title: '12. When NOT to Act', page: 25 },
    { title: '13. Trust & Google Compliance', page: 27 },
    { title: '14. Shipping Policy (Full)', page: 30 },
    { title: '15. Returns & Refunds Policy (Full)', page: 33 },
    { title: '16. Checkout Consistency Verification', page: 35 },
    { title: '17. Daily Calm Checklist', page: 37 },
    { title: '18. Google Appeal Text (Appendix)', page: 39 },
    { title: '19. Confidence Statement', page: 41 },
  ];

  doc.setFontSize(11);
  for (const item of tocItems) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text(item.title, MARGIN_LEFT + 5, yPosition);
    const titleWidth = doc.getTextWidth(item.title);
    const dotsStart = MARGIN_LEFT + 5 + titleWidth + 3;
    const dotsEnd = PAGE_WIDTH - MARGIN_RIGHT - 15;
    doc.setTextColor(...MUTED_COLOR);
    for (let x = dotsStart; x < dotsEnd; x += 3) {
      doc.text('.', x, yPosition);
    }
    doc.setTextColor(...PRIMARY_COLOR);
    doc.text(item.page.toString(), PAGE_WIDTH - MARGIN_RIGHT, yPosition, { align: 'right' });
    yPosition += 10;
    checkPageBreak(doc, 12);
  }

  addPageNumber(doc);

  // =====================================
  // CHAPTER 1 — INTRODUCTION
  // =====================================
  startNewPage(doc);
  addTitle(doc, '1. Introduction');
  addSpace(doc, 5);

  addParagraph(doc, `Welcome to the complete admin and compliance guide for GetPawsy. This document serves as your single source of truth for understanding your webshop, maintaining Google Merchant Center compliance, and operating your store with confidence.`);

  addInfoBox(doc, 'Business Identity', `GetPawsy is a consumer-facing pet supply brand. It is operated by Skidzo, a registered business entity (KVK: 78156955, VAT ID: NL003295015B69). Skidzo is legally responsible for all operations including customer service, order processing, fulfillment coordination, returns, and refunds. This dual-name structure (brand + legal entity) is standard practice and fully compliant with Google Merchant Center policies.`);

  addSubtitle(doc, 'What This Document Covers');
  addBulletPoint(doc, 'Complete shipping and returns policies aligned with checkout behavior');
  addBulletPoint(doc, 'Business transparency and identity verification');
  addBulletPoint(doc, 'Product representation and pricing consistency');
  addBulletPoint(doc, 'Google Merchant Center compliance checklist');
  addBulletPoint(doc, 'Ready-to-submit Google appeal text');
  addBulletPoint(doc, 'Admin dashboard guidance and daily operations');

  addSubtitle(doc, 'Calm Operation Philosophy');
  addParagraph(doc, `Running an e-commerce store can feel overwhelming, especially when metrics are low or inconsistent. This guide emphasizes a calm, data-driven approach. Most days, the best action is no action at all. Your store is built to operate autonomously. Your job is to monitor trends (not daily numbers) and intervene only when clear red flags appear.`);

  addTipBox(doc, 'The Golden Rule', 'Check your dashboard once per day. Draw conclusions only after at least 7 days of data. Everything below that threshold is noise, not signal.');

  addPageNumber(doc);

  // =====================================
  // CHAPTER 2 — DASHBOARD OVERVIEW
  // =====================================
  startNewPage(doc);
  addTitle(doc, '2. Dashboard Overview');
  addSpace(doc, 5);

  addParagraph(doc, `Your admin dashboard provides a real-time snapshot of store performance. Think of it like a car dashboard: it shows speed, fuel level, and warning lights. You don't panic at every fluctuation — you look for patterns.`);

  addInfoBox(doc, 'Key Dashboard Metrics', 'Visitors (today/this week) • Total Revenue • Number of Orders • Active Products • Conversion Rate • Average Order Value (AOV)');

  addSubtitle(doc, 'Visitors');
  addParagraph(doc, `Shows how many unique people visited your store. A "visitor" is anyone who loaded at least one page. Low visitor counts are normal for new stores without active advertising. Quality matters more than quantity.`);

  addSubtitle(doc, 'Revenue');
  addParagraph(doc, `Total amount received through completed orders. It is completely normal for this to be zero in early days. Every successful store started at zero.`);

  addSubtitle(doc, 'Orders & Conversion');
  addParagraph(doc, `The average e-commerce conversion rate is 1–3%. This means out of 100 visitors, only 1 to 3 will purchase. If you had 20 visitors and no orders today, that is statistically expected.`);

  addSubtitle(doc, 'Trends vs. Snapshots');
  addTipBox(doc, 'Focus on Trends', 'A trend is a pattern over weeks. A snapshot is one day. Always look at a minimum of 7 days of data before drawing any conclusions. Compare with the same period last month, not yesterday.');

  addPageNumber(doc);

  // =====================================
  // CHAPTER 3 — ICONS & SYMBOLS
  // =====================================
  startNewPage(doc);
  addTitle(doc, '3. Icons & Symbols Guide');
  addSpace(doc, 5);

  addParagraph(doc, `Your admin interface uses icons to represent different functions. Below is a visual reference explaining each icon, what it means, and whether any action is needed.`);

  addInfoBox(doc, 'General Rule', 'If there is no red color, no word "error" or "failed", and no explicit call to action — you likely do not need to do anything.');

  addSpace(doc, 5);

  const iconExplanations = [
    { icon: 'Box/Package', name: 'Products', meaning: 'Your product catalog. All items available for sale.', action: 'Only if products disappear or show errors.', noAction: 'Daily checking is not necessary.' },
    { icon: 'Shopping Cart', name: 'Cart', meaning: 'Cart activity. A positive signal of customer interest.', action: 'Only if customers report they cannot add items.', noAction: 'Low numbers matching low traffic is normal.' },
    { icon: 'Clock', name: 'Time / Recent Activity', meaning: 'Time-based information: recent activity, processing times.', action: 'Unless accompanied by a warning.', noAction: 'Purely informational.' },
    { icon: 'Bell', name: 'Notifications', meaning: 'System notifications about orders, sync status, etc.', action: 'Only red notifications or those containing "error" or "failed".', noAction: 'Most notifications are informational.' },
    { icon: 'Chart/Graph', name: 'Analytics', meaning: 'Performance trends over time. The real value is in the direction of the line, not individual numbers.', action: 'If the line drops consistently for 2+ weeks.', noAction: 'Daily fluctuations are normal.' },
    { icon: 'Dollar Sign', name: 'Revenue', meaning: 'Financial data: revenue, payments, AOV.', action: 'If payments fail to process or data seems incorrect.', noAction: 'Revenue is a result. Focus on causes (traffic, conversion).' },
    { icon: 'Eye', name: 'Visitors', meaning: 'Visitor or pageview counts showing interest in your store.', action: 'If it suddenly drops to zero while ads are running.', noAction: 'Normal fluctuations are expected.' },
    { icon: 'Funnel', name: 'Conversion Funnel', meaning: 'Shows the flow from homepage to product to cart to checkout.', action: 'If there is 0% conversion at a specific step after significant traffic.', noAction: 'It is normal for 50–80% of visitors to drop off at each step.' },
    { icon: 'Megaphone', name: 'Advertising', meaning: 'Ad settings or performance results.', action: 'If ads have been running for 7+ days with zero clicks.', noAction: 'During the first 5–10 business days — ads need a learning phase.' },
    { icon: 'Gear', name: 'Settings', meaning: 'Configuration options for your store.', action: 'Only when you specifically want to change something.', noAction: 'If something works, do not adjust it.' },
    { icon: 'Green Checkmark', name: 'Success', meaning: 'Everything is working correctly.', action: 'Never — this confirms the system is working.', noAction: 'Always. A green checkmark is good news.' },
    { icon: 'Yellow Triangle', name: 'Warning', meaning: 'A caution indicator, not an error.', action: 'If related to payment failures or critical processes.', noAction: 'For "low stock" or "slow load" — not always urgent.' },
  ];

  for (const item of iconExplanations) {
    checkPageBreak(doc, 35);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PRIMARY_COLOR);
    doc.text(`${item.icon}  —  ${item.name}`, MARGIN_LEFT, yPosition);
    doc.setTextColor(0, 0, 0);
    yPosition += 7;

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    const mLines = doc.splitTextToSize(item.meaning, CONTENT_WIDTH - 5);
    for (const l of mLines) { doc.text(l, MARGIN_LEFT + 3, yPosition); yPosition += LINE_HEIGHT; }
    yPosition += 1;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...SUCCESS_COLOR);
    doc.text('Action needed:', MARGIN_LEFT + 3, yPosition);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text(item.action, MARGIN_LEFT + 33, yPosition);
    yPosition += LINE_HEIGHT;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...MUTED_COLOR);
    doc.text('No action:', MARGIN_LEFT + 3, yPosition);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text(item.noAction, MARGIN_LEFT + 33, yPosition);
    yPosition += LINE_HEIGHT + 4;
  }

  addPageNumber(doc);

  // =====================================
  // CHAPTER 4 — VISITOR BEHAVIOR
  // =====================================
  startNewPage(doc);
  addTitle(doc, '4. Visitor Behavior');
  addSpace(doc, 5);

  addSubtitle(doc, 'Why Most Visitors Only Browse');
  addParagraph(doc, `The vast majority of your visitors will not purchase. This is not a failure of your store; this is how online shopping works.`);

  addInfoBox(doc, 'The Numbers', 'Only 1–3% of e-commerce visitors make a purchase. Out of every 100 people who visit your site, 97 to 99 will leave without buying. This is the global standard.');

  addSubtitle(doc, 'The Customer Journey');
  addParagraph(doc, `An average consumer visits a store multiple times before buying:`);
  addBulletPoint(doc, 'Day 1: Sees an ad, visits the site, browses, leaves');
  addBulletPoint(doc, 'Day 3: Remembers the product, searches for it');
  addBulletPoint(doc, 'Day 7: Returns after payday and finally purchases');

  addTipBox(doc, 'Returning Visitors', 'If your analytics show people returning to your site, that is an excellent sign. Returning visitors have a much higher chance of converting than first-time visitors.');

  addSubtitle(doc, 'What Numbers Really Mean');
  addParagraph(doc, `Visitor counts are not a direct indicator of success. One hundred targeted visitors from a good ad campaign are worth more than a thousand random visitors. Focus on quality over quantity.`);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 5 — PRODUCTS & CATEGORIES
  // =====================================
  startNewPage(doc);
  addTitle(doc, '5. Products & Categories');
  addSpace(doc, 5);

  addSubtitle(doc, 'Empty Categories Are Not Errors');
  addParagraph(doc, `It is completely normal for a parent category to contain no products while its subcategories are populated. For example, "Dog Food" may be empty while "Dry Food", "Wet Food", and "Treats" each contain products. This is proper organization, not a bug.`);

  addSubtitle(doc, 'Product Representation — Google Compliance');
  addParagraph(doc, `All products on GetPawsy accurately represent the items for sale. Product images match the actual products shipped. Prices shown on product pages are the prices customers pay. There are no misleading discounts, bait-and-switch tactics, or redirect tricks.`);

  addComplianceBox(doc, 'Product Integrity', `Every product listing includes: accurate title, real product image, correct price in USD, clear availability status, and consistent information from product page through checkout.`);

  addSubtitle(doc, 'Filters & Search');
  addParagraph(doc, `Customers can browse by category, use filters (price range, type), or search by keyword. Search results always lead to the correct product detail page with matching title, price, and image.`);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 6 — INVENTORY & STOCK
  // =====================================
  startNewPage(doc);
  addTitle(doc, '6. Inventory & Stock');
  addSpace(doc, 5);

  addSubtitle(doc, 'Fulfillment Model');
  addParagraph(doc, `GetPawsy partners with fulfillment centers to ship products to customers in the United States. When a customer places an order, it is forwarded to the appropriate fulfillment partner for processing and shipping. Stock levels reflect availability at fulfillment partner warehouses.`);

  addInfoBox(doc, 'What Stock Means', 'A stock number reflects availability at our fulfillment partners, not a physical warehouse owned by GetPawsy. When the "Add to Cart" button is visible and functional, the product is available for purchase.');

  addSubtitle(doc, 'When to Intervene');
  addBulletPoint(doc, 'A product explicitly shows "Out of Stock" on the website');
  addBulletPoint(doc, 'The "Add to Cart" button does not function');
  addBulletPoint(doc, 'A product is no longer visible in the catalog');

  addSubtitle(doc, 'When NOT to Intervene');
  addParagraph(doc, `Do not obsess over daily stock numbers. Fulfillment systems update automatically. Products that become unavailable are automatically marked or disabled.`);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 7 — CART & CHECKOUT
  // =====================================
  startNewPage(doc);
  addTitle(doc, '7. Cart & Checkout');
  addSpace(doc, 5);

  addSubtitle(doc, 'Checkout Flow');
  addParagraph(doc, `The checkout process is designed for transparency and trust:`);
  addBulletPoint(doc, '1. Customer adds product(s) to cart');
  addBulletPoint(doc, '2. Cart displays product price, quantity, and subtotal');
  addBulletPoint(doc, `3. Shipping cost is calculated: FREE on orders $${FREE_SHIPPING_THRESHOLD}+ or $${FLAT_SHIPPING_RATE.toFixed(2)} flat rate`);
  addBulletPoint(doc, '4. If cart is under $35, a message shows how much more to qualify for free shipping');
  addBulletPoint(doc, '5. Customer enters US shipping address');
  addBulletPoint(doc, '6. Final total = subtotal + shipping (if applicable) − discounts');
  addBulletPoint(doc, '7. Secure payment via Stripe');

  addCriticalBox(doc, 'Pricing Consistency', `The price shown on the product page MUST equal the price shown in the cart, which MUST equal the price shown at checkout. There are no hidden fees, no "calculated at checkout" language, and no surprise charges. Shipping costs follow a simple, transparent rule: $${FLAT_SHIPPING_RATE.toFixed(2)} under $${FREE_SHIPPING_THRESHOLD}, free at $${FREE_SHIPPING_THRESHOLD} or above.`);

  addSubtitle(doc, 'Shipping Address Restriction');
  addParagraph(doc, `Checkout only accepts United States shipping addresses. No international countries are visible or selectable. This aligns with our US-only shipping policy and Google Merchant Center configuration.`);

  addSubtitle(doc, 'Business Identity at Checkout');
  addParagraph(doc, `The checkout page displays or links to: GetPawsy branding, Skidzo legal information, support contact (${SUPPORT_EMAIL}), and SSL security indicators. Customers can clearly identify who they are purchasing from.`);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 8 — ANALYTICS
  // =====================================
  startNewPage(doc);
  addTitle(doc, '8. Analytics');
  addSpace(doc, 5);

  addSubtitle(doc, 'What Matters');
  addBulletPoint(doc, 'Conversion Rate — percentage of visitors who purchase (benchmark: 1–3%)');
  addBulletPoint(doc, 'Average Order Value (AOV) — total revenue / number of orders');
  addBulletPoint(doc, 'Add-to-Cart Rate — percentage who add items to cart (benchmark: 5–15%)');
  addBulletPoint(doc, 'Revenue trends over 7–30 day periods');

  addSubtitle(doc, 'What Doesn\'t Matter (Yet)');
  addBulletPoint(doc, 'Individual daily visitor counts for new stores');
  addBulletPoint(doc, 'Bounce rate in isolation (context matters)');
  addBulletPoint(doc, 'Social media follower counts');

  addTipBox(doc, 'Diagnostic Pattern', 'Good add-to-cart rate but low conversion? The problem is after the cart (checkout, shipping costs). Low add-to-cart rate? The problem is earlier (product presentation, pricing, offering).');

  addWarningBox(doc, 'Always view charts over at least 7 days, preferably 30. Compare with the same period last month. Look for consistent patterns, not individual spikes.');

  addPageNumber(doc);

  // =====================================
  // CHAPTER 9 — ADVERTISING
  // =====================================
  startNewPage(doc);
  addTitle(doc, '9. Advertising (Pinterest / Google)');
  addSpace(doc, 5);

  addSubtitle(doc, 'The Learning Phase');
  addParagraph(doc, `Online ad platforms (Pinterest, Google, Meta) need a learning phase of 5–10 business days. During this period, the algorithm collects data about who clicks your ads, who visits your site, and who purchases. You will see costs without proportional results. This is expected.`);

  addWarningBox(doc, 'The biggest mistake new advertisers make is drawing conclusions too quickly. After one day with high costs and no sales, they panic and stop the campaign. This is counterproductive. Wait at least 7–14 days.');

  addSubtitle(doc, 'Landing Page Accuracy — Critical for Google');
  addCriticalBox(doc, 'URL Matching', 'Every ad MUST link to the correct product page. If an ad for "Slow Feeder Bowl" links to a different product or a search page, Google will flag this as misrepresentation. Always verify that the Destination URL in your ad platform matches the actual product URL on getpawsy.pet.');

  addSubtitle(doc, 'Pinterest-Specific Guidance');
  addBulletPoint(doc, 'Add UTM parameters to Destination URL, not the tracking template field');
  addBulletPoint(doc, 'Verify product URLs before publishing campaigns');
  addBulletPoint(doc, 'If a product is removed, update or pause the corresponding ad immediately');
  addBulletPoint(doc, 'The Pinterest Tag tracks: PageVisit, ViewCategory, ViewProduct, AddToCart, Checkout');

  addSubtitle(doc, 'Google Ads Considerations');
  addParagraph(doc, `For Google Shopping: product feed data (title, price, availability, shipping) must exactly match what is displayed on the website. Any discrepancy can trigger a "Misrepresentation" flag. The product feed at getpawsy.pet is auto-generated and synchronized with on-site data.`);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 10 — TECHNICAL GLOSSARY
  // =====================================
  startNewPage(doc);
  addTitle(doc, '10. Technical Glossary');
  addSpace(doc, 5);

  addParagraph(doc, `Simple explanations of common e-commerce and advertising terms.`);

  addSpace(doc, 3);
  addTableRow(doc, 'Term', 'Meaning', true);
  addTableRow(doc, 'CTR (Click-Through Rate)', 'Percentage of people who click your ad after seeing it. Industry average: 1–3%.');
  addTableRow(doc, 'AOV (Average Order Value)', 'Average amount spent per order. Total revenue divided by number of orders.');
  addTableRow(doc, 'Conversion Rate', 'Percentage of visitors who complete a purchase. E-commerce average: 1–3%.');
  addTableRow(doc, 'CPC (Cost Per Click)', 'How much you pay each time someone clicks your ad.');
  addTableRow(doc, 'ROAS (Return on Ad Spend)', 'Revenue generated for every dollar spent on ads. ROAS of 3x = $3 revenue per $1 spent.');
  addTableRow(doc, 'Bounce Rate', 'Percentage of visitors who leave after viewing only one page.');
  addTableRow(doc, 'Impression', 'One instance of your ad being displayed to a user.');
  addTableRow(doc, 'Add-to-Cart Rate', 'Percentage of visitors who add an item to their shopping cart. Average: 5–15%.');
  addTableRow(doc, 'Cart Abandonment', 'When a customer adds items to cart but does not complete purchase. Average: 70%.');
  addTableRow(doc, 'SEO', 'Search Engine Optimization — improving visibility in search results without paid ads.');
  addTableRow(doc, 'SSL', 'Secure Sockets Layer — encryption that protects customer data. Shown as "https://" and padlock icon.');
  addTableRow(doc, 'RLS', 'Row-Level Security — database protection ensuring users only access their own data.');
  addTableRow(doc, 'GMC', 'Google Merchant Center — platform for managing product listings in Google Shopping.');

  addPageNumber(doc);

  // =====================================
  // CHAPTER 11 — WHEN TO INTERVENE
  // =====================================
  startNewPage(doc);
  addTitle(doc, '11. When to Intervene');
  addSpace(doc, 5);

  addParagraph(doc, `True red flags that require immediate attention:`);

  addSpace(doc, 3);
  addCriticalBox(doc, 'Payment Processing Down', 'If multiple customers report they cannot complete checkout, or Stripe shows errors. Test checkout immediately.');
  addSpace(doc, 2);
  addCriticalBox(doc, 'Site Completely Down', 'If getpawsy.pet shows an error page or blank page. Check your hosting status.');
  addSpace(doc, 2);
  addCriticalBox(doc, 'Google Merchant Center Suspension', 'If you receive a suspension notice, review this guide\'s compliance chapter and submit an appeal using the provided template.');
  addSpace(doc, 2);
  addCriticalBox(doc, 'Customer Complaints About Wrong Products', 'If customers receive items that don\'t match what they ordered. Contact your fulfillment partner immediately.');

  addSubtitle(doc, 'Less Urgent but Worth Monitoring');
  addBulletPoint(doc, 'Consistent decline in traffic over 2+ weeks (check ad status)');
  addBulletPoint(doc, 'Conversion rate drops below 0.5% with sufficient traffic');
  addBulletPoint(doc, 'Multiple customer emails about the same issue');

  addPageNumber(doc);

  // =====================================
  // CHAPTER 12 — WHEN NOT TO ACT
  // =====================================
  startNewPage(doc);
  addTitle(doc, '12. When NOT to Act');
  addSpace(doc, 5);

  addSubtitle(doc, 'Do Not Panic When...');
  addBulletPoint(doc, 'You have zero visitors at 3 AM — people sleep');
  addBulletPoint(doc, 'One day has no orders — statistically normal with low traffic');
  addBulletPoint(doc, 'A visitor left without buying — 97–99% of visitors do this');
  addBulletPoint(doc, 'Ad costs seem high on day 1 — the algorithm is learning');
  addBulletPoint(doc, 'A category shows "0 products" — products are in subcategories');

  addSubtitle(doc, 'Do Not Change...');
  addBulletPoint(doc, 'Prices every day based on gut feeling');
  addBulletPoint(doc, 'Ad campaigns before 7 days have passed');
  addBulletPoint(doc, 'Website design based on one visitor\'s behavior');
  addBulletPoint(doc, 'Settings that are currently working');

  addTipBox(doc, 'The Truth', 'Your store is designed to operate without daily intervention. If everything is functioning, the best thing you can do is: nothing. Let data accumulate.');

  addPageNumber(doc);

  // =====================================
  // CHAPTER 13 — TRUST & GOOGLE COMPLIANCE
  // =====================================
  startNewPage(doc);
  addTitle(doc, '13. Trust & Google Compliance');
  addSpace(doc, 5);

  addSubtitle(doc, 'Why Google Flagged "Misrepresentation"');
  addParagraph(doc, `Google Merchant Center may flag stores for "Misrepresentation" or "Incorrect representation" when it detects inconsistencies between what is advertised and what is presented on the website. Common triggers include:`);
  addBulletPoint(doc, 'Shipping information on the site not matching Merchant Center settings');
  addBulletPoint(doc, 'Unclear business identity (brand name differs from legal entity)');
  addBulletPoint(doc, 'Prices changing between product page and checkout');
  addBulletPoint(doc, 'Missing or vague return policy');
  addBulletPoint(doc, 'Ad destination URLs leading to wrong products');

  addSubtitle(doc, 'What Has Been Fixed');

  addComplianceBox(doc, '1. Business Identity Transparency', `Brand: GetPawsy | Legal Entity: Skidzo | Clearly stated on About, Contact, and Footer pages. "GetPawsy is a consumer brand operated by Skidzo." KVK and contact information are publicly visible.`);

  addSpace(doc, 2);

  addComplianceBox(doc, '2. Shipping Consistency', `Shipping policy, product pages, cart, and checkout ALL display the same rules: Free shipping on orders $${FREE_SHIPPING_THRESHOLD}+. Flat rate of $${FLAT_SHIPPING_RATE.toFixed(2)} on orders under $${FREE_SHIPPING_THRESHOLD}. Delivery: ${DELIVERY_TIME_STANDARD}. Processing: ${PROCESSING_TIME}. US only. No "calculated at checkout" language anywhere.`);

  addSpace(doc, 2);

  addComplianceBox(doc, '3. Pricing Integrity', `Product page price = Cart price = Checkout price. No hidden fees. No dynamic pricing changes. No bait-and-switch. Discounts are clearly labeled and consistently applied.`);

  addSpace(doc, 2);

  addComplianceBox(doc, '4. Returns Policy', `${RETURN_WINDOW_DAYS}-day return window clearly stated. Eligibility conditions specified. Process explained (email ${SUPPORT_EMAIL}). Refund timeline (5 business days). No vague language.`);

  addSpace(doc, 2);

  addComplianceBox(doc, '5. Product Representation', `Product images match actual items. Titles are accurate. Prices are correct. Availability status is current. No redirects to unrelated products.`);

  addSpace(doc, 2);

  addComplianceBox(doc, '6. Secure Checkout', `SSL encryption (https://) protects all customer data. Payment processing via Stripe. Contact information visible. Business identity linked.`);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 14 — SHIPPING POLICY (FULL)
  // =====================================
  startNewPage(doc);
  addTitle(doc, '14. Shipping Policy');
  addSpace(doc, 3);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...MUTED_COLOR);
  doc.text('As published on getpawsy.pet/shipping', MARGIN_LEFT, yPosition);
  doc.setTextColor(0, 0, 0);
  yPosition += 10;

  addSubtitle(doc, 'Shipping Coverage');
  addParagraph(doc, `GetPawsy ships exclusively within the United States. We do not currently offer international shipping.`);

  addSubtitle(doc, 'Shipping Costs');
  addBoldParagraph(doc, `Our shipping pricing is simple and transparent:`);
  addBulletPoint(doc, `Orders of $${FREE_SHIPPING_THRESHOLD} or more: FREE standard shipping`);
  addBulletPoint(doc, `Orders under $${FREE_SHIPPING_THRESHOLD}: Flat rate of $${FLAT_SHIPPING_RATE.toFixed(2)}`);
  addParagraph(doc, `There are no hidden fees, handling charges, or surprise costs. The shipping cost displayed in your cart is the final shipping cost at checkout.`);

  addSubtitle(doc, 'Processing Time');
  addParagraph(doc, `Orders are processed within ${PROCESSING_TIME}. Processing includes order verification, fulfillment preparation, and handoff to our shipping partners.`);

  addSubtitle(doc, 'Delivery Time');
  addParagraph(doc, `Standard delivery takes ${DELIVERY_TIME_STANDARD} after your order has been dispatched. Delivery times may vary depending on your location within the United States.`);

  addSubtitle(doc, 'Fulfillment');
  addParagraph(doc, `Orders are fulfilled through trusted fulfillment partners. We work with established fulfillment centers to ensure reliable processing and delivery to customers in the United States.`);

  addSubtitle(doc, 'Order Tracking');
  addParagraph(doc, `A tracking number is provided via email once your order has shipped. Please allow 24–48 hours for tracking information to become active in the carrier\'s system.`);

  addSubtitle(doc, 'Possible Delays');
  addParagraph(doc, `While we strive to meet our delivery estimates, occasional delays may occur due to severe weather, carrier disruptions, or high-volume periods (holidays, promotions). If your order is significantly delayed, please contact us at ${SUPPORT_EMAIL}.`);

  addSubtitle(doc, 'Business Identity');
  addParagraph(doc, `GetPawsy is a consumer brand operated by Skidzo, a registered business entity (KVK: 78156955). Skidzo is responsible for order processing, fulfillment coordination, and customer support.`);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 15 — RETURNS & REFUNDS POLICY
  // =====================================
  startNewPage(doc);
  addTitle(doc, '15. Returns & Refunds Policy');
  addSpace(doc, 3);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...MUTED_COLOR);
  doc.text('As published on getpawsy.pet/returns', MARGIN_LEFT, yPosition);
  doc.setTextColor(0, 0, 0);
  yPosition += 10;

  addSubtitle(doc, 'Return Window');
  addParagraph(doc, `You may request a return within ${RETURN_WINDOW_DAYS} days of receiving your order.`);

  addSubtitle(doc, 'Eligibility');
  addParagraph(doc, `To be eligible for a return, items must be:`);
  addBulletPoint(doc, 'Unused and in their original condition');
  addBulletPoint(doc, 'In the original packaging');
  addBulletPoint(doc, 'Accompanied by proof of purchase (order number)');

  addSubtitle(doc, 'How to Initiate a Return');
  addParagraph(doc, `To start a return, email ${SUPPORT_EMAIL} with:`);
  addBulletPoint(doc, 'Your order number');
  addBulletPoint(doc, 'The item(s) you wish to return');
  addBulletPoint(doc, 'The reason for your return');
  addParagraph(doc, `Our support team will respond within 24 business hours with return instructions and, if applicable, a return shipping label.`);

  addSubtitle(doc, 'Refund Timeline');
  addParagraph(doc, `Once your return is received and inspected, we will process your refund within 5 business days. Refunds are issued to the original payment method.`);

  addSubtitle(doc, 'Damaged or Incorrect Items');
  addParagraph(doc, `If you receive a damaged or incorrect item, please contact ${SUPPORT_EMAIL} within 48 hours of delivery with photos of the issue. We will arrange a replacement or full refund at no additional cost to you.`);

  addSubtitle(doc, 'Exchanges');
  addParagraph(doc, `We do not offer direct exchanges. To exchange an item, please initiate a return and place a new order for the desired product.`);

  addSubtitle(doc, 'Shipping Costs for Returns');
  addParagraph(doc, `For returns due to customer preference, the customer is responsible for return shipping costs. For returns due to damaged or incorrect items, GetPawsy covers all return shipping costs.`);

  addSubtitle(doc, 'Hygiene Exclusions');
  addParagraph(doc, `For hygiene and safety reasons, certain pet care items may not be eligible for return once opened. These exclusions, if any, are noted on the product page.`);

  addSubtitle(doc, 'Business Identity');
  addParagraph(doc, `Returns and refunds are managed by Skidzo, the legal entity operating GetPawsy. Contact: ${SUPPORT_EMAIL}.`);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 16 — CHECKOUT CONSISTENCY VERIFICATION
  // =====================================
  startNewPage(doc);
  addTitle(doc, '16. Checkout & Policy Consistency');
  addSpace(doc, 3);

  addParagraph(doc, `This chapter demonstrates that all pricing and shipping information is consistent across every customer touchpoint. This consistency is critical for Google Merchant Center compliance.`);

  addSubtitle(doc, 'Why Consistency Matters');
  addParagraph(doc, `Google Merchant Center suspends accounts when it detects mismatches between advertised information and what customers actually experience during checkout. Even small differences — like saying "free shipping" on a product page but showing a shipping fee at checkout — can trigger a "Misrepresentation" flag.`);

  addSubtitle(doc, 'Verification: Price Consistency');
  addSpace(doc, 3);

  addTableRow(doc, 'Touchpoint', 'Price Shown', true);
  addTableRow(doc, 'Product Page', 'Product price in USD (e.g., $24.99)');
  addTableRow(doc, 'Search Results', 'Same product price ($24.99)');
  addTableRow(doc, 'Cart', 'Same product price ($24.99) + quantity');
  addTableRow(doc, 'Checkout', 'Same product price ($24.99)');
  addTableRow(doc, 'Google Shopping Feed', 'Same product price ($24.99)');

  addSpace(doc, 3);

  addSubtitle(doc, 'Verification: Shipping Cost Consistency');
  addSpace(doc, 3);

  addTableRow(doc, 'Touchpoint', 'Shipping Information', true);
  addTableRow(doc, 'Shipping Policy Page', `Free on $${FREE_SHIPPING_THRESHOLD}+ | $${FLAT_SHIPPING_RATE.toFixed(2)} under $${FREE_SHIPPING_THRESHOLD}`);
  addTableRow(doc, 'Product Page Microcopy', `Free shipping on orders $${FREE_SHIPPING_THRESHOLD}+ | $${FLAT_SHIPPING_RATE.toFixed(2)} under`);
  addTableRow(doc, 'Cart', `Shows applicable rate + "Add $X more for free shipping" prompt`);
  addTableRow(doc, 'Checkout (under $35)', `Shipping: $${FLAT_SHIPPING_RATE.toFixed(2)}`);
  addTableRow(doc, 'Checkout ($35+)', 'Shipping: $0.00 (Free)');
  addTableRow(doc, 'Google Merchant Center', `$${FLAT_SHIPPING_RATE.toFixed(2)} under $${FREE_SHIPPING_THRESHOLD} / Free $${FREE_SHIPPING_THRESHOLD}+`);

  addSpace(doc, 3);

  addSubtitle(doc, 'Google Reviewer Checklist');
  addParagraph(doc, `What Google reviewers verify during a compliance check:`);
  addChecklistItem(doc, 'Product price matches across all pages', true);
  addChecklistItem(doc, 'Shipping cost at checkout matches stated policy', true);
  addChecklistItem(doc, 'No "calculated at checkout" language', true);
  addChecklistItem(doc, 'Business identity is clearly stated', true);
  addChecklistItem(doc, 'Contact information is accessible', true);
  addChecklistItem(doc, 'Return policy is clear and complete', true);
  addChecklistItem(doc, 'SSL certificate is active', true);
  addChecklistItem(doc, 'No misleading claims or fake urgency', true);
  addChecklistItem(doc, 'Ad landing pages match product advertised', true);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 17 — DAILY CALM CHECKLIST
  // =====================================
  startNewPage(doc);
  addTitle(doc, '17. Daily Calm Checklist');
  addSpace(doc, 5);

  addSubtitle(doc, 'Daily Check (5 minutes)');
  addParagraph(doc, `Your goal is not to analyze everything, but to verify there are no fires. Do this once per day, morning or evening.`);
  addSpace(doc, 3);
  addChecklistItem(doc, 'Open your admin and glance at the dashboard', true);
  addChecklistItem(doc, 'Check for red warnings or error notifications', true);
  addChecklistItem(doc, 'Briefly review notifications', true);
  addChecklistItem(doc, 'Check email for customer messages', true);
  addChecklistItem(doc, 'If everything looks green: move on with your day', true);

  addSpace(doc, 5);

  addSubtitle(doc, 'Do NOT Do Daily');
  addChecklistItem(doc, 'Log in every hour to check for changes', false);
  addChecklistItem(doc, 'Draw conclusions from a single day of data', false);
  addChecklistItem(doc, 'Adjust settings that are already working', false);
  addChecklistItem(doc, 'Panic at low numbers', false);

  addSpace(doc, 5);

  addSubtitle(doc, 'Weekly Check (30 minutes)');
  addChecklistItem(doc, 'Review analytics over the past 7 days', true);
  addChecklistItem(doc, 'Compare with the previous week', true);
  addChecklistItem(doc, 'Verify bestsellers are still available', true);
  addChecklistItem(doc, 'Review ad performance (if running ads)', true);
  addChecklistItem(doc, 'Check shipping status of open orders', true);
  addChecklistItem(doc, 'Read any reviews or customer feedback', true);
  addChecklistItem(doc, 'Make 1 note: what went well, what could improve?', true);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 18 — GOOGLE APPEAL TEXT
  // =====================================
  startNewPage(doc);
  addTitle(doc, '18. Google Appeal Text');
  addSpace(doc, 3);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...MUTED_COLOR);
  doc.text('Ready-to-submit text for Google Merchant Center reconsideration request', MARGIN_LEFT, yPosition);
  doc.setTextColor(0, 0, 0);
  yPosition += 10;

  addSubtitle(doc, 'Request for Review — Misrepresentation Issue Resolved');

  // Appeal text in a styled box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...PRIMARY_COLOR);
  doc.setLineWidth(0.5);
  const appealStartY = yPosition;

  const appealText = [
    'Dear Google Merchant Center Review Team,',
    '',
    'We are writing to request a review of our Google Merchant Center account following a "Misrepresentation" flag. We have conducted a thorough audit of our website (getpawsy.pet) and have resolved all identified issues.',
    '',
    'BUSINESS IDENTITY',
    `GetPawsy is a consumer-facing pet supply brand operated by Skidzo, a registered business entity (KVK: 78156955, VAT ID: NL003295015B69), based in Apeldoorn, Netherlands. This brand-entity relationship is clearly disclosed on our About page, Contact page, and website footer. Customer support is available at ${SUPPORT_EMAIL} with a 24-hour response commitment.`,
    '',
    'PRICING & SHIPPING CONSISTENCY',
    `We have verified that all pricing is consistent across every customer touchpoint: product pages, search results, cart, and checkout display identical prices. Our shipping policy is simple and transparent: orders of $${FREE_SHIPPING_THRESHOLD} or more qualify for free shipping; orders under $${FREE_SHIPPING_THRESHOLD} are charged a flat rate of $${FLAT_SHIPPING_RATE.toFixed(2)}. This exact logic is implemented in our checkout system and reflected in our Merchant Center shipping settings. We ship exclusively within the United States with a delivery time of ${DELIVERY_TIME_STANDARD}. There are no hidden fees, "calculated at checkout" language, or variable shipping costs.`,
    '',
    'RETURNS POLICY',
    `We offer a clear ${RETURN_WINDOW_DAYS}-day return policy. Items must be unused and in original packaging. Returns are initiated via ${SUPPORT_EMAIL}. Refunds are processed within 5 business days to the original payment method. For damaged or incorrect items, we provide free return shipping.`,
    '',
    'PRODUCT REPRESENTATION',
    'All product listings accurately represent the items sold. Product images, titles, descriptions, and prices are consistent across our website and product feed. Ad destination URLs lead directly to the correct product pages with matching information.',
    '',
    'TECHNICAL COMPLIANCE',
    'Our website uses SSL encryption for secure browsing and checkout. Payment processing is handled through Stripe. Our site architecture (React SPA) renders all content client-side, and we have verified that Googlebot can access and render all pages correctly.',
    '',
    'RESOLVED ISSUES',
    '• Shipping information is now 100% consistent across all pages and Merchant Center settings',
    '• Business identity (GetPawsy operated by Skidzo) is clearly disclosed',
    '• All product prices match from product page through checkout',
    '• Return policy is comprehensive, clear, and easily accessible',
    '• No misleading claims, fake urgency, or deceptive practices exist on our site',
    '',
    'We respectfully request a re-review of our account. We are committed to maintaining full compliance with Google Merchant Center policies and providing a transparent, trustworthy shopping experience for our customers.',
    '',
    'Sincerely,',
    'The GetPawsy Team (operated by Skidzo)',
    `${SUPPORT_EMAIL}`,
    'getpawsy.pet',
  ];

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(50, 50, 50);

  for (const line of appealText) {
    if (line === '') {
      yPosition += 4;
      continue;
    }
    // Bold for section headers
    if (line === line.toUpperCase() && line.length > 3 && !line.startsWith('•')) {
      checkPageBreak(doc, 12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...PRIMARY_COLOR);
      doc.text(line, MARGIN_LEFT + 6, yPosition);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(50, 50, 50);
      yPosition += LINE_HEIGHT;
    } else {
      const wrapped = doc.splitTextToSize(line, CONTENT_WIDTH - 12);
      for (const w of wrapped) {
        checkPageBreak(doc, LINE_HEIGHT + 3);
        doc.text(w, MARGIN_LEFT + 6, yPosition);
        yPosition += LINE_HEIGHT;
      }
    }
  }

  addPageNumber(doc);

  // =====================================
  // CHAPTER 19 — CONFIDENCE STATEMENT
  // =====================================
  startNewPage(doc);

  yPosition = 60;

  doc.setFillColor(...PRIMARY_COLOR);
  doc.rect(0, 0, PAGE_WIDTH, 8, 'F');

  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PRIMARY_COLOR);
  doc.text('Confidence Statement', PAGE_WIDTH / 2, yPosition, { align: 'center' });

  yPosition += 20;

  doc.setDrawColor(...PRIMARY_COLOR);
  doc.setLineWidth(0.5);
  doc.line(PAGE_WIDTH / 2 - 40, yPosition, PAGE_WIDTH / 2 + 40, yPosition);

  yPosition += 20;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  const confidenceLines = [
    'You are compliant.',
    '',
    'Your store is legitimate.',
    '',
    'Your shipping policies match your checkout.',
    '',
    'Your business identity is transparent.',
    '',
    'Your products are accurately represented.',
    '',
    'Your customers are protected.',
    '',
    'Growth takes time.',
    '',
    'You have done the work. Now let it breathe.',
  ];

  for (const line of confidenceLines) {
    if (line === '') {
      yPosition += 5;
      continue;
    }
    doc.text(line, PAGE_WIDTH / 2, yPosition, { align: 'center' });
    yPosition += 10;
  }

  yPosition += 20;

  doc.setDrawColor(...PRIMARY_COLOR);
  doc.setLineWidth(0.5);
  doc.line(PAGE_WIDTH / 2 - 40, yPosition, PAGE_WIDTH / 2 + 40, yPosition);

  yPosition += 20;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...MUTED_COLOR);
  doc.text('With confidence and calm,', PAGE_WIDTH / 2, yPosition, { align: 'center' });
  yPosition += 10;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PRIMARY_COLOR);
  doc.text('The GetPawsy Team', PAGE_WIDTH / 2, yPosition, { align: 'center' });
  yPosition += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...MUTED_COLOR);
  doc.text('Operated by Skidzo', PAGE_WIDTH / 2, yPosition, { align: 'center' });

  addPageNumber(doc);

  return doc;
};

export const downloadAdminManualPdf = (): void => {
  const doc = generateAdminManualPdf();
  doc.save('GetPawsy_Admin_Compliance_Guide_US.pdf');
};

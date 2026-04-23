import jsPDF from 'jspdf';
import type { ReleaseReportResult } from '@/hooks/useReleaseReport';
import { PAGE_CHANGELOGS, type PageChangelogKey } from '@/lib/page-changelogs';

interface BuildOptions {
  title: string;
  notes?: string;
  result: ReleaseReportResult;
}

/**
 * Maps each policy/contact page to the feed-validation field that proves
 * the change is live in the GMC feed. Used to render the Evidence Matrix
 * page in the auto-generated release PDF.
 */
const EVIDENCE_MAP: Record<PageChangelogKey, { surface: string; feedField: string }> = {
  contact:  { surface: '/contact',         feedField: 'site_readiness.contact · OrganizationJSON-LD.address.addressCountry=US' },
  about:    { surface: '/about',           feedField: 'site_readiness.about · OrganizationJSON-LD.address.addressLocality=New York' },
  shipping: { surface: '/shipping',        feedField: 'site_readiness.shipping · feed g:shipping country=US, service=Standard, $5.99 / free $35+' },
  returns:  { surface: '/return-policy',   feedField: 'site_readiness.returns · MerchantReturnPolicy.returnDays=30' },
  privacy:  { surface: '/privacy-policy',  feedField: 'site_readiness.privacy' },
  terms:    { surface: '/terms-of-service',feedField: 'site_readiness.terms' },
  cookies:  { surface: '/cookie-policy',   feedField: 'site_readiness.terms (cookies addendum)' },
};

/**
 * Generate a single-file PDF summary of a Report Release run.
 * Mirrors the DOCX/PDF artifact format used by GMC reviewers.
 */
export function downloadReleaseReportPdf({ title, notes, result }: BuildOptions) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  const checkPage = (needed = 12) => {
    if (y + needed > pageHeight - 15) {
      doc.addPage();
      y = 20;
    }
  };

  const h1 = (text: string) => {
    checkPage(18);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(15, 23, 42);
    doc.text(text, margin, y); y += 8;
    doc.setDrawColor(37, 99, 235); doc.setLineWidth(0.6);
    doc.line(margin, y, pageWidth - margin, y); y += 6;
    doc.setTextColor(0, 0, 0);
  };

  const h2 = (text: string) => {
    checkPage(12);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(15, 23, 42);
    doc.text(text, margin, y); y += 6;
    doc.setTextColor(0, 0, 0);
  };

  const body = (text: string) => {
    checkPage(8);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30, 41, 59);
    const lines = doc.splitTextToSize(text, contentWidth);
    doc.text(lines, margin, y); y += lines.length * 5 + 2;
    doc.setTextColor(0, 0, 0);
  };

  const small = (text: string) => {
    checkPage(6);
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(100, 116, 139);
    const lines = doc.splitTextToSize(text, contentWidth);
    doc.text(lines, margin, y); y += lines.length * 4 + 2;
    doc.setTextColor(0, 0, 0);
  };

  const kv = (rows: Array<[string, string]>) => {
    const labelW = 55;
    const lineH = 6;
    rows.forEach(([k, v]) => {
      const wrapped = doc.splitTextToSize(v || '—', contentWidth - labelW - 4);
      const blockH = Math.max(lineH, wrapped.length * 5 + 2);
      checkPage(blockH + 2);
      doc.setFillColor(241, 245, 249);
      doc.rect(margin, y - 4, labelW, blockH, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(15, 23, 42);
      doc.text(k, margin + 2, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30, 41, 59);
      doc.text(wrapped, margin + labelW + 4, y);
      y += blockH;
    });
    y += 2;
    doc.setTextColor(0, 0, 0);
  };

  const bullet = (text: string) => {
    checkPage(7);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30, 41, 59);
    const wrapped = doc.splitTextToSize(text, contentWidth - 6);
    doc.text('•', margin, y);
    doc.text(wrapped, margin + 5, y);
    y += wrapped.length * 5 + 1;
    doc.setTextColor(0, 0, 0);
  };

  const sync = result.sync_summary ?? {};
  const val = result.validation_summary ?? {};
  const completed = result.completed_at
    ? new Date(result.completed_at).toUTCString()
    : '—';

  // ---- Header ----
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(37, 99, 235);
  doc.text('GetPawsy LLC · Release Report', margin, 12);
  doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text('New York, NY · United States', pageWidth - margin, 12, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  h1(title);
  small(`Release ID: ${result.id} · Completed: ${completed}`);
  if (notes) {
    body(notes);
  }

  // ---- Summary metrics ----
  h2('Run summary');
  kv([
    ['Status', String(result.status ?? '—')],
    ['Sync mode', String(sync.mode_effective ?? '—')],
    ['Sync run ID', String(sync.runId ?? '—')],
    ['Products synced', `${sync.successCount ?? 0} / ${sync.totalProducts ?? 0} (errors: ${sync.errorCount ?? 0})`],
    ['Sync started', String(sync.startedAt ?? '—')],
    ['Sync completed', String(sync.completedAt ?? '—')],
  ]);

  // ---- Feed validation ----
  h2('Feed validation');
  kv([
    ['Validation OK', val.ok ? 'Yes' : 'No'],
    ['Total items in feed', String(val.totalItemsInFeed ?? 0)],
    ['Sample size', String(val.sampleSize ?? 0)],
    ['Sample passing', `${val.okCount ?? 0} / ${val.sampleSize ?? 0}`],
    ['Sample failing', String(val.failCount ?? 0)],
  ]);

  const reasons: Array<[string, number]> = Array.isArray(val.topFailReasons)
    ? val.topFailReasons
    : [];
  if (reasons.length > 0) {
    h2('Top failure reasons');
    reasons.forEach(([reason, count]) => bullet(`${reason} — ${count}`));
  } else {
    body('No failure reasons recorded — feed sample is clean.');
  }

  if (result.error_message) {
    h2('Error');
    body(result.error_message);
  }

  // ---- Evidence Matrix (per-page changelog ↔ feed validation field) ----
  doc.addPage();
  y = 20;
  h1('Evidence Matrix');
  small(
    'Per modified contact/policy page: what changed, the source URL, and the exact ' +
    'feed-validation field that proves the change is live. Attach this page to ' +
    'GMC Account Issues → Request Review.',
  );

  const tableX = margin;
  const colW = [38, 70, 60]; // Page · Changes · Feed validation field
  const headerH = 8;

  const drawHeader = () => {
    checkPage(headerH + 4);
    doc.setFillColor(15, 23, 42);
    doc.rect(tableX, y - 5, colW[0] + colW[1] + colW[2], headerH, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('Page / Build', tableX + 2, y);
    doc.text('Changes',      tableX + colW[0] + 2, y);
    doc.text('Feed field',   tableX + colW[0] + colW[1] + 2, y);
    y += headerH;
    doc.setTextColor(0, 0, 0);
  };

  drawHeader();

  let rowIdx = 0;
  (Object.keys(PAGE_CHANGELOGS) as PageChangelogKey[]).forEach((key) => {
    const entries = PAGE_CHANGELOGS[key];
    if (!entries?.length) return;
    const latest = entries[0];
    const ev = EVIDENCE_MAP[key];

    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30, 41, 59);
    const pageCell = doc.splitTextToSize(
      `${ev.surface}\n${latest.build}\n${latest.commit} · ${latest.date}`, colW[0] - 4,
    );
    const changesCell = doc.splitTextToSize(latest.changes.join(' • '), colW[1] - 4);
    const fieldCell = doc.splitTextToSize(ev.feedField, colW[2] - 4);

    const rowH = Math.max(
      pageCell.length * 4,
      changesCell.length * 4,
      fieldCell.length * 4,
    ) + 4;

    if (y + rowH > pageHeight - 15) {
      doc.addPage(); y = 20;
      drawHeader();
    }

    if (rowIdx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(tableX, y - 4, colW[0] + colW[1] + colW[2], rowH, 'F');
    }
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.1);
    doc.line(tableX, y - 4 + rowH, tableX + colW[0] + colW[1] + colW[2], y - 4 + rowH);

    doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(pageCell,    tableX + 2, y);
    doc.text(changesCell, tableX + colW[0] + 2, y);
    doc.text(fieldCell,   tableX + colW[0] + colW[1] + 2, y);
    y += rowH;
    rowIdx++;
  });

  y += 4;
  small(
    'Cross-reference: each "Feed field" can be re-verified by re-running ' +
    '"validate-merchant-feed" — its summary appears under Run summary on page 1.',
  );

  // ---- Footer attribution ----
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(100, 116, 139);
    doc.text(
      `Generated ${new Date().toUTCString()} · GetPawsy LLC · Page ${p} / ${totalPages}`,
      pageWidth / 2, pageHeight - 8, { align: 'center' },
    );
  }

  const safe = title.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'release';
  doc.save(`release-report-${safe}.pdf`);
}

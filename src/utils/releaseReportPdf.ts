import jsPDF from 'jspdf';
import type { ReleaseReportResult } from '@/hooks/useReleaseReport';

interface BuildOptions {
  title: string;
  notes?: string;
  result: ReleaseReportResult;
}

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

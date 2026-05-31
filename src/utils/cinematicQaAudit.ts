import jsPDF from "jspdf";

type Job = Record<string, any>;

export const QA_AUDIT_HEADERS = [
  "job_id",
  "product_slug",
  "product_name",
  "status",
  "approved_for_render",
  "auto_approval_blocked_reason",
  "validation_passed",
  "validation_v7_passed",
  "scene_diversity_v7_score",
  "camera_diversity_score",
  "hook_strength_v7_score",
  "text_safety_score",
  "pinterest_quality_score",
  "qa_composite_score",
  "v7_reject_reasons",
  "final_decision",
  "decision_reason",
  "output_mp4_url",
  "pinterest_pin_url",
  "created_at",
  "render_complete_at",
] as const;

export type QaAuditRow = Record<(typeof QA_AUDIT_HEADERS)[number], string>;

function finalDecision(job: Job): { decision: string; reason: string } {
  const v = (job?.validation_report ?? {}) as any;
  const v7Pass = job?.validation_v7_passed === true;
  const pq = Number(job?.pinterest_quality_score ?? 0);
  const reasons: string[] = Array.isArray(job?.v7_reject_reasons) ? job.v7_reject_reasons : [];

  if (job?.status === "published" || job?.pinterest_pin_url) {
    return { decision: "auto_approved_published", reason: "Pinned to Pinterest" };
  }
  if (job?.approved_for_render === true && v7Pass && pq > 90) {
    return { decision: "auto_approved", reason: `pinterest_quality_score=${pq}` };
  }
  if (job?.status === "creative_rejected" || v?.passed === false || reasons.length > 0) {
    return {
      decision: "rejected",
      reason: reasons.length ? reasons.join("; ") : (v?.fail_reasons?.join?.("; ") ?? "validation failed"),
    };
  }
  if (!v7Pass || pq <= 90) {
    return {
      decision: "awaiting_approval",
      reason: job?.auto_approval_blocked_reason
        ?? (pq <= 90 ? `pinterest_quality_score=${pq} ≤ 90` : "validation_v7_passed=false"),
    };
  }
  return { decision: job?.status ?? "unknown", reason: job?.status_message ?? "" };
}

export function buildAuditRow(job: Job): QaAuditRow {
  const { decision, reason } = finalDecision(job);
  const v = (job?.validation_report ?? {}) as any;
  const reasons: string[] = Array.isArray(job?.v7_reject_reasons) ? job.v7_reject_reasons : [];
  return {
    job_id: String(job?.id ?? ""),
    product_slug: String(job?.product_slug ?? ""),
    product_name: String(job?.product_name ?? ""),
    status: String(job?.status ?? ""),
    approved_for_render: String(job?.approved_for_render ?? ""),
    auto_approval_blocked_reason: String(job?.auto_approval_blocked_reason ?? ""),
    validation_passed: String(v?.passed ?? ""),
    validation_v7_passed: String(job?.validation_v7_passed ?? ""),
    scene_diversity_v7_score: String(job?.scene_diversity_v7_score ?? ""),
    camera_diversity_score: String(job?.camera_diversity_score ?? ""),
    hook_strength_v7_score: String(job?.hook_strength_v7_score ?? ""),
    text_safety_score: String(job?.text_safety_score ?? ""),
    pinterest_quality_score: String(job?.pinterest_quality_score ?? ""),
    qa_composite_score: String(job?.qa_composite_score ?? ""),
    v7_reject_reasons: reasons.join("; "),
    final_decision: decision,
    decision_reason: reason,
    output_mp4_url: String(job?.output_mp4_url ?? ""),
    pinterest_pin_url: String(job?.pinterest_pin_url ?? ""),
    created_at: String(job?.created_at ?? ""),
    render_complete_at: String(job?.render_complete_at ?? ""),
  };
}

function csvEscape(v: string): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toAuditCsv(jobs: Job[]): string {
  const rows = jobs.map(buildAuditRow);
  const lines = [
    QA_AUDIT_HEADERS.join(","),
    ...rows.map((r) => QA_AUDIT_HEADERS.map((h) => csvEscape(r[h])).join(",")),
  ];
  return lines.join("\n");
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadAuditCsv(jobs: Job[], filename = "cinematic-qa-audit.csv") {
  triggerDownload(new Blob([toAuditCsv(jobs)], { type: "text/csv;charset=utf-8" }), filename);
}

export function downloadJobAuditPdf(job: Job) {
  const row = buildAuditRow(job);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const left = 40;
  let y = 48;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Cinematic Ad — QA Audit Report", left, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, left, y);
  y += 18;

  const decisionColor: [number, number, number] =
    row.final_decision.startsWith("auto_approved") ? [16, 122, 64]
    : row.final_decision === "rejected" ? [178, 30, 30]
    : [180, 120, 0];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...decisionColor);
  doc.text(`Final decision: ${row.final_decision.toUpperCase()}`, left, y);
  doc.setTextColor(0, 0, 0);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const reasonLines = doc.splitTextToSize(`Reason: ${row.decision_reason || "—"}`, pageW - left * 2);
  doc.text(reasonLines, left, y);
  y += reasonLines.length * 13 + 8;

  const sections: Array<[string, Array<[string, string]>]> = [
    ["Product", [
      ["Job ID", row.job_id],
      ["Slug", row.product_slug],
      ["Name", row.product_name || "—"],
      ["Status", row.status],
      ["Created", row.created_at],
      ["Render complete", row.render_complete_at || "—"],
    ]],
    ["V7 Scores", [
      ["Pinterest quality", row.pinterest_quality_score || "—"],
      ["Scene diversity", row.scene_diversity_v7_score || "—"],
      ["Camera diversity", row.camera_diversity_score || "—"],
      ["Hook strength", row.hook_strength_v7_score || "—"],
      ["Text safety", row.text_safety_score || "—"],
      ["QA composite", row.qa_composite_score || "—"],
      ["v7 passed", row.validation_v7_passed || "—"],
      ["v5 passed", row.validation_passed || "—"],
      ["v7 reject reasons", row.v7_reject_reasons || "—"],
    ]],
    ["Approval", [
      ["approved_for_render", row.approved_for_render || "—"],
      ["blocked reason", row.auto_approval_blocked_reason || "—"],
      ["MP4", row.output_mp4_url || "—"],
      ["Pin URL", row.pinterest_pin_url || "—"],
    ]],
  ];

  for (const [title, rows] of sections) {
    if (y > 760) { doc.addPage(); y = 48; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(title, left, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    for (const [k, v] of rows) {
      if (y > 800) { doc.addPage(); y = 48; }
      doc.setTextColor(110, 110, 110);
      doc.text(`${k}:`, left, y);
      doc.setTextColor(0, 0, 0);
      const wrapped = doc.splitTextToSize(String(v ?? "—"), pageW - left - 160);
      doc.text(wrapped, left + 140, y);
      y += Math.max(13, wrapped.length * 13);
    }
    y += 8;
  }

  doc.save(`qa-audit-${row.job_id || "job"}.pdf`);
}

export function downloadJobAuditCsv(job: Job) {
  downloadAuditCsv([job], `qa-audit-${job?.id ?? "job"}.csv`);
}
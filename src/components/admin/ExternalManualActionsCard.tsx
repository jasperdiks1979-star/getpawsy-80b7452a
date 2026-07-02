import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Copy, ExternalLink, ShieldCheck } from "lucide-react";
import { useState } from "react";

type Action = {
  id: string;
  title: string;
  where: string;
  where_url?: string;
  priority: "P0" | "P1" | "P2";
  blocking: boolean;
  status: "READY_FOR_OWNER" | "IN_PROGRESS" | "DONE";
  eta_minutes: number;
  confidence_pct: number;
  revenue_impact: "HIGH" | "MEDIUM" | "LOW";
  copy_instructions: string;
};

const ACTIONS: Action[] = [
  {
    id: "stripe-public-name",
    title: "Rename Stripe public business name: Skidzo → GetPawsy",
    where: "Stripe Dashboard · Settings · Public details",
    where_url: "https://dashboard.stripe.com/settings/public",
    priority: "P0", blocking: true, status: "READY_FOR_OWNER",
    eta_minutes: 3, confidence_pct: 100, revenue_impact: "HIGH",
    copy_instructions:
      "Open Stripe → Settings → Public details. Set Public business name = GetPawsy. Statement descriptor = GETPAWSY. Business website = https://getpawsy.pet. Support email = support@getpawsy.pet. Save.",
  },
  {
    id: "stripe-apple-pay",
    title: "Verify Apple Pay domain for getpawsy.pet",
    where: "Stripe Dashboard · Payment methods",
    where_url: "https://dashboard.stripe.com/settings/payment_methods",
    priority: "P0", blocking: false, status: "READY_FOR_OWNER",
    eta_minutes: 2, confidence_pct: 100, revenue_impact: "MEDIUM",
    copy_instructions:
      "Payment methods → Apple Pay → Add domain → getpawsy.pet → Verify. Domain association file is hosted automatically by Stripe.",
  },
  {
    id: "stripe-google-pay",
    title: "Enable Google Pay in Stripe",
    where: "Stripe Dashboard · Payment methods",
    where_url: "https://dashboard.stripe.com/settings/payment_methods",
    priority: "P0", blocking: false, status: "READY_FOR_OWNER",
    eta_minutes: 1, confidence_pct: 100, revenue_impact: "MEDIUM",
    copy_instructions:
      "Payment methods → Google Pay → toggle Enabled. Save.",
  },
  {
    id: "stripe-branding",
    title: "Upload GetPawsy logo, icon, brand colors in Stripe branding",
    where: "Stripe Dashboard · Branding",
    where_url: "https://dashboard.stripe.com/settings/branding",
    priority: "P1", blocking: false, status: "READY_FOR_OWNER",
    eta_minutes: 5, confidence_pct: 100, revenue_impact: "MEDIUM",
    copy_instructions:
      "Branding → upload logo (512×512 min) and icon (128×128). Accent color = your paw-brand primary. Save.",
  },
  {
    id: "gsc-verify",
    title: "Confirm Google Search Console owns getpawsy.pet",
    where: "Google Search Console",
    where_url: "https://search.google.com/search-console",
    priority: "P1", blocking: false, status: "READY_FOR_OWNER",
    eta_minutes: 3, confidence_pct: 100, revenue_impact: "MEDIUM",
    copy_instructions:
      "Verify property https://getpawsy.pet if not already; submit sitemap https://getpawsy.pet/sitemap.xml. Enables organic-search insight for P1.1 CVR diagnostic.",
  },
];

function badgeCls(p: Action["priority"]) {
  return p === "P0" ? "bg-red-600 text-white" : p === "P1" ? "bg-amber-500 text-white" : "bg-slate-500 text-white";
}
function impactCls(i: Action["revenue_impact"]) {
  return i === "HIGH" ? "text-emerald-600" : i === "MEDIUM" ? "text-amber-600" : "text-muted-foreground";
}

export default function ExternalManualActionsCard() {
  const [copied, setCopied] = useState<string | null>(null);

  const doCopy = async (a: Action) => {
    try {
      await navigator.clipboard.writeText(
        `${a.title}\n${a.where}${a.where_url ? " — " + a.where_url : ""}\n\n${a.copy_instructions}`
      );
      setCopied(a.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  };

  const p0Count = ACTIONS.filter(a => a.priority === "P0").length;
  const blocking = ACTIONS.filter(a => a.blocking).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          External Manual Actions
          <Badge variant="secondary" className="ml-2">{ACTIONS.length} total</Badge>
          <Badge className="bg-red-600 text-white">{p0Count} P0</Badge>
          <Badge className="bg-amber-500 text-white">{blocking} blocking</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Everything below requires a third-party dashboard the app cannot control.
          All engineering is done; click Copy to grab the exact instructions.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {ACTIONS.map((a) => (
          <div
            key={a.id}
            className="rounded-lg border p-3 flex flex-col md:flex-row md:items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={badgeCls(a.priority)}>{a.priority}</Badge>
                {a.blocking && (
                  <Badge variant="outline" className="text-red-600 border-red-600">
                    <AlertTriangle className="h-3 w-3 mr-1" /> Blocking
                  </Badge>
                )}
                <Badge variant="secondary">READY_FOR_OWNER</Badge>
                <span className={`text-xs font-medium ${impactCls(a.revenue_impact)}`}>
                  {a.revenue_impact} impact
                </span>
                <span className="text-xs text-muted-foreground">
                  · ~{a.eta_minutes} min · {a.confidence_pct}% confidence
                </span>
              </div>
              <div className="mt-1 font-medium text-sm">{a.title}</div>
              <div className="text-xs text-muted-foreground">{a.where}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => doCopy(a)}
                title="Copy instructions"
              >
                <Copy className="h-3.5 w-3.5 mr-1" />
                {copied === a.id ? "Copied" : "Copy"}
              </Button>
              {a.where_url && (
                <Button
                  size="sm"
                  asChild
                >
                  <a href={a.where_url} target="_blank" rel="noopener noreferrer">
                    Open <ExternalLink className="h-3.5 w-3.5 ml-1" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
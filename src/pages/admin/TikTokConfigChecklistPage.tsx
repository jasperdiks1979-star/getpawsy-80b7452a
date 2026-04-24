import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Loader2,
  Copy,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

/**
 * TikTok Configuration Checklist
 *
 * One-page verifier that runs the `tiktok-oauth-diagnose` edge function and
 * groups every check into the four categories the user cares about:
 *   1. Client Key (matches the secret in our backend)
 *   2. App status (Live vs Sandbox / authorize URL probe)
 *   3. Login Kit products & scopes
 *   4. Redirect URIs registered in TikTok
 *
 * No backend logic changes — this page only renders results from the
 * existing diagnose function.
 */

type DiagnoseStatus = "pass" | "fail" | "warn" | "info";

type DiagnoseCheck = {
  name: string;
  status: DiagnoseStatus;
  detail: string;
  hint?: string;
};

type DiagnoseResult = {
  ok: boolean;
  summary: string;
  redirectUri?: string;
  elapsed_ms?: number;
  checks: DiagnoseCheck[];
};

const EXPECTED_REDIRECT_URIS = [
  "https://getpawsy.pet/auth/tiktok/callback",
  "https://getpawsy.lovable.app/auth/tiktok/callback",
] as const;

/**
 * Required scopes the start function must request.
 * Keep in sync with `supabase/functions/tiktok-oauth-start/index.ts`.
 */
const REQUIRED_SCOPES = ["user.info.basic", "video.publish", "video.upload"] as const;

type RedirectProbeCheck = {
  label: string;
  status: DiagnoseStatus;
  detail: string;
};

type RedirectProbeResult = {
  ok: boolean;
  authUrl: string;
  parsedRedirect: string | null;
  expectedRedirect: string;
  clientKey: string | null;
  scope: string | null;
  state: string | null;
  responseType: string | null;
  checks: RedirectProbeCheck[];
  startReturnedRedirect: string | null;
};

type CategoryKey = "client_key" | "app_status" | "login_kit" | "redirect_uri";

const CATEGORY_META: Record<
  CategoryKey,
  { title: string; description: string; portalHint: string }
> = {
  client_key: {
    title: "1. Client Key",
    description:
      "The TIKTOK_CLIENT_KEY stored in our backend must exactly match the Client Key shown in the TikTok Developer Portal for this app.",
    portalHint:
      "TikTok Developer Portal → Manage apps → your app → Basic information → Client Key",
  },
  app_status: {
    title: "2. App status (Live or Sandbox)",
    description:
      "TikTok will reject OAuth from any account that is not whitelisted while the app is in Sandbox / In Review. The app must be Live OR the TikTok account you're logging in with must be added as a sandbox user.",
    portalHint:
      "TikTok Developer Portal → your app → Status (top right) and Sandbox → Target users",
  },
  login_kit: {
    title: "3. Login Kit products & scopes",
    description:
      "Login Kit and Content Posting API must both be added to the app, and the scopes user.info.basic, video.publish and video.upload must be approved.",
    portalHint:
      "TikTok Developer Portal → your app → Add products → Login Kit + Content Posting API → Scopes",
  },
  redirect_uri: {
    title: "4. Redirect URIs",
    description:
      "Every URL we might OAuth from must be registered in the Login Kit redirect URI list. TikTok matches them character-for-character.",
    portalHint:
      "TikTok Developer Portal → your app → Login Kit → Redirect URI",
  },
};

function categorize(check: DiagnoseCheck): CategoryKey | null {
  const n = check.name.toLowerCase();
  if (n.includes("client_key") || n.includes("client key")) return "client_key";
  if (n.includes("client_secret") || n.includes("client secret")) return "client_key";
  if (n.includes("redirect")) return "redirect_uri";
  if (n.includes("scope") || n.includes("login kit") || n.includes("content posting")) {
    return "login_kit";
  }
  if (n.includes("authorize")) return "app_status";
  if (n.includes("token endpoint")) return "app_status";
  return null;
}

function StatusBadge({ status }: { status: DiagnoseStatus }) {
  const config: Record<
    DiagnoseStatus,
    { label: string; variant: "default" | "secondary" | "destructive" | "outline"; Icon: typeof CheckCircle2 }
  > = {
    pass: { label: "Pass", variant: "default", Icon: CheckCircle2 },
    fail: { label: "Fail", variant: "destructive", Icon: XCircle },
    warn: { label: "Warn", variant: "secondary", Icon: AlertTriangle },
    info: { label: "Info", variant: "outline", Icon: Info },
  };
  const { label, variant, Icon } = config[status];
  return (
    <Badge variant={variant} className="gap-1 text-[10px]">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

function CheckRow({ check }: { check: DiagnoseCheck }) {
  return (
    <div className="rounded-md border border-border/60 bg-card p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-medium text-foreground">{check.name}</div>
        <StatusBadge status={check.status} />
      </div>
      <div className="text-xs text-muted-foreground break-words">{check.detail}</div>
      {check.hint && (
        <div className="text-xs text-foreground/80 bg-muted/40 rounded px-2 py-1.5">
          <span className="font-semibold">How to fix: </span>
          {check.hint}
        </div>
      )}
    </div>
  );
}

function CategorySection({
  category,
  checks,
  extra,
}: {
  category: CategoryKey;
  checks: DiagnoseCheck[];
  extra?: React.ReactNode;
}) {
  const meta = CATEGORY_META[category];
  const overall: DiagnoseStatus = checks.some((c) => c.status === "fail")
    ? "fail"
    : checks.some((c) => c.status === "warn")
    ? "warn"
    : checks.length === 0
    ? "info"
    : "pass";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base">{meta.title}</CardTitle>
          <StatusBadge status={overall} />
        </div>
        <CardDescription className="text-xs">{meta.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {checks.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">
            No diagnostic checks ran for this category yet.
          </div>
        ) : (
          checks.map((c, i) => <CheckRow key={`${c.name}-${i}`} check={c} />)
        )}
        {extra}
        <div className="pt-1 text-[11px] text-muted-foreground">
          <span className="font-semibold">Where in TikTok: </span>
          {meta.portalHint}
        </div>
      </CardContent>
    </Card>
  );
}

export default function TikTokConfigChecklistPage() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DiagnoseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runDiagnose = async () => {
    setRunning(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("tiktok-oauth-diagnose", {
        body: { origin: window.location.origin },
      });
      if (error) throw error;
      setResult(data as DiagnoseResult);
      if ((data as DiagnoseResult)?.ok) {
        toast.success("All TikTok configuration checks passed");
      } else {
        toast.error(
          (data as DiagnoseResult)?.summary || "Some TikTok configuration checks failed",
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Diagnostic failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    void runDiagnose();
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  const grouped: Record<CategoryKey, DiagnoseCheck[]> = {
    client_key: [],
    app_status: [],
    login_kit: [],
    redirect_uri: [],
  };
  if (result?.checks) {
    for (const c of result.checks) {
      const cat = categorize(c);
      if (cat) grouped[cat].push(c);
    }
  }

  // Synthetic redirect URI rows so the user always sees the expected list,
  // even before the diagnose returns.
  const redirectExtra = (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-foreground">
        Required redirect URIs (must all be registered):
      </div>
      {EXPECTED_REDIRECT_URIS.map((uri) => (
        <div
          key={uri}
          className="flex items-center justify-between gap-2 rounded border border-border/60 bg-muted/30 px-2 py-1.5"
        >
          <code className="text-[11px] break-all">{uri}</code>
          <Button size="sm" variant="ghost" onClick={() => copy(uri)} className="h-7 px-2">
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <Link
            to="/admin/tiktok-automation"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to TikTok Automation
          </Link>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            TikTok Configuration Checklist
          </h1>
          <p className="text-sm text-muted-foreground">
            Verifies the values in your backend against the TikTok Developer Portal so OAuth doesn't
            fail with <code className="text-[11px]">invalid_client_key</code>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a
              href="https://developers.tiktok.com/apps"
              target="_blank"
              rel="noreferrer"
              className="gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              Open Developer Portal
            </a>
          </Button>
          <Button onClick={runDiagnose} disabled={running} size="sm">
            {running ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Re-run checks
          </Button>
        </div>
      </div>

      {result && (
        <Card>
          <CardContent className="py-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <StatusBadge status={result.ok ? "pass" : "fail"} />
              <span className="text-sm font-medium">{result.summary}</span>
            </div>
            {typeof result.elapsed_ms === "number" && (
              <span className="text-xs text-muted-foreground">
                Checked in {result.elapsed_ms} ms
              </span>
            )}
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">
            <strong>Diagnostic could not run:</strong> {error}
            <div className="text-xs text-muted-foreground mt-1">
              Make sure you're logged in as an admin and try again.
            </div>
          </CardContent>
        </Card>
      )}

      {running && !result && (
        <Card>
          <CardContent className="py-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Running configuration checks…
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        <CategorySection category="client_key" checks={grouped.client_key} />
        <CategorySection category="app_status" checks={grouped.app_status} />
        <CategorySection category="login_kit" checks={grouped.login_kit} />
        <CategorySection
          category="redirect_uri"
          checks={grouped.redirect_uri}
          extra={redirectExtra}
        />
      </div>
    </div>
  );
}
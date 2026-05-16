import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Sparkles, Video, ExternalLink, Send, Download, Cloud, Copy, RefreshCw, ShieldCheck, FileText, ChevronDown, ChevronRight, AlertTriangle, Activity, RotateCcw, PlayCircle, Trash2, KeyRound, Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type Job = {
  id: string;
  product_slug: string;
  hook_variant: string;
  status: string;
  status_message: string | null;
  vo_url: string | null;
  vo_script: string | null;
  output_mp4_url: string | null;
  scene_assets: Array<{ index: number; image_url: string; caption: string; duration_seconds: number; ai_generated: boolean }>;
  caption_variants?: string[][] | null;
  vo_script_variants?: string[] | null;
  variant_index?: number | null;
  pinterest_asset_id: string | null;
  pushed_to_pinterest_at: string | null;
  pinterest_pin_id?: string | null;
  pinterest_pin_url?: string | null;
  pinterest_publish_error?: string | null;
  pinterest_publish_attempts?: number | null;
  last_pinterest_attempt_at?: string | null;
  render_complete_at?: string | null;
  pinterest_uploaded_at?: string | null;
  published_at?: string | null;
  error_message: string | null;
  created_at: string;
  prepared_at: string | null;
  render_attempts?: number | null;
  render_worker_id?: string | null;
  render_queued_at?: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  preparing: "bg-blue-500/10 text-blue-600",
  prepared: "bg-emerald-500/10 text-emerald-600",
  render_queued: "bg-indigo-500/10 text-indigo-600",
  rendering: "bg-amber-500/10 text-amber-600",
  rendered: "bg-emerald-600/15 text-emerald-700",
  render_complete: "bg-emerald-600/15 text-emerald-700",
  pinterest_uploaded: "bg-sky-500/15 text-sky-700",
  published: "bg-pink-500/15 text-pink-700",
  failed: "bg-destructive/10 text-destructive",
  worker_stale: "bg-orange-500/15 text-orange-700",
};

type HealthSnapshot = {
  workerLive: boolean;
  workerStale: boolean;
  lastClaimAt: string | null;
  lastClaimAgeMs: number | null;
  lastClaimWorkerId: string | null;
  lastClaimJobId: string | null;
  lastCompleteAt: string | null;
  currentJob: { id: string; product_slug: string; render_worker_id: string | null; render_started_at: string | null } | null;
  staleCandidates: Array<{ id: string; product_slug: string; render_queued_at: string | null }>;
  flaggedStale: Array<{ id: string; product_slug: string }>;
  staleThresholdMs: number;
  workerLiveWindowMs: number;
  heartbeat?: { worker_id: string; last_poll_at: string; last_claim_at: string | null; last_job_id: string | null } | null;
  heartbeatAgeMs?: number | null;
  lastTouchedAt?: string | null;
  lastTouchedAgeMs?: number | null;
};

type HealthResponse = {
  ok: boolean;
  message?: string;
  code?: string;
  activeBackend?: {
    supabase_url: string;
    supabase_host: string;
    functions_base_url: string;
    required_github_secret: { name: string; value: string; must_match_queue_table: boolean };
  };
  secrets?: Record<string, boolean>;
  snapshot?: HealthSnapshot;
  workerHealth?: { ok: boolean; data?: any; error?: string };
  ghPat?: { source: "db" | "env" | "none"; present: boolean; updatedAt: string | null; masked: string | null };
};

type PublicWorkerHealth = {
  ok: boolean;
  route: string;
  workerLive: boolean;
  lastHeartbeat: string | null;
  lastClaim: string | null;
  currentJobId?: string | null;
  queueDepth: number;
  message?: string;
};

type GhSecretValidation = {
  ok: boolean;
  repo: string | null;
  workflow: string;
  ref: string;
  ghPatPresent: boolean;
  ghRepoPresent: boolean;
  ghApiStatus: number | null;
  ghApiOk: boolean;
  message?: string;
  secrets: Record<string, { present: boolean; updatedAt?: string | null }>;
  missing: string[];
  hint?: string;
};

type PatCheck = { ok: boolean; status: number | null; message: string };
type PatValidation = {
  ok: boolean;
  format: { ok: boolean; kind: string };
  repoTested: string;
  workflow: string;
  checks: {
    api_access: PatCheck;
    repo_access: PatCheck;
    actions_permission: PatCheck;
    secrets_permission: PatCheck;
    workflow_dispatch: PatCheck;
  };
  scopes: string[] | null;
  tokenKind: string;
  hint?: string;
};

const PAT_TEST_REPO = "jasperdiks1979-star/getpawsy-80b7452a";
const PAT_CHECK_LABELS: Array<{ key: keyof PatValidation["checks"]; label: string }> = [
  { key: "api_access", label: "GitHub API access" },
  { key: "repo_access", label: "Repository access" },
  { key: "actions_permission", label: "Actions permission" },
  { key: "secrets_permission", label: "Secrets permission" },
  { key: "workflow_dispatch", label: "workflow_dispatch" },
];

function isValidPatFormatClient(t: string): boolean {
  return /^ghp_[A-Za-z0-9]{30,}$/.test(t) || /^github_pat_[A-Za-z0-9_]{40,}$/.test(t);
}

type SecretSpec = {
  name: string;
  scope: "cloud" | "github";
  label: string;
  whereToFind: string;
  link?: { label: string; url: string };
};

const SECRET_CATALOG: SecretSpec[] = [
  {
    name: "SUPABASE_URL",
    scope: "github",
    label: "Backend project URL",
    whereToFind: "Lovable Cloud → Settings → Project URL (also injected as VITE_SUPABASE_URL).",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    scope: "github",
    label: "Backend service role key",
    whereToFind: "Lovable Cloud → Settings → API → service_role key. Never share publicly.",
  },
  {
    name: "RENDER_WORKER_SECRET",
    scope: "github",
    label: "Render worker shared secret",
    whereToFind: "Same value as RENDER_WORKER_SECRET in Cloud → Functions → Secrets. Must match on both sides.",
  },
  {
    name: "GH_PAT",
    scope: "cloud",
    label: "GitHub Personal Access Token",
    whereToFind: "github.com → Settings → Developer settings → Personal access tokens. Needs 'repo' scope (classic) or 'Actions: write' + 'Secrets: read' (fine-grained).",
    link: { label: "Open GitHub PAT settings", url: "https://github.com/settings/tokens" },
  },
  {
    name: "GH_REPO",
    scope: "cloud",
    label: "GitHub repository (owner/repo)",
    whereToFind: "Format: your-org/your-repo. The repo that hosts .github/workflows/render-cinematic-ad.yml.",
  },
];

type ApiRouteProbe = {
  checkedUrl: string;
  fallbackUrl: string;
  status: number | null;
  contentType: string | null;
  spaFallbackDetected: boolean;
  error?: string;
};

const WORKER_HEALTH_API_PATH = "/api/health/worker";
const WORKER_HEALTH_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/worker-health`;

function fmtAge(ms: number | null): string {
  if (ms === null) return "never";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

export default function CinematicAdsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openPreview, setOpenPreview] = useState<Record<string, boolean>>({});
  const [productSlug, setProductSlug] = useState("enclosed-cat-litter-box-extra-large-flip-top");
  const [hookVariant, setHookVariant] = useState("default");
  const [smoke, setSmoke] = useState<any>(null);
  const [smokeBusy, setSmokeBusy] = useState(false);
  const [e2e, setE2e] = useState<any>(null);
  const [e2eBusy, setE2eBusy] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [publicWorkerHealth, setPublicWorkerHealth] = useState<PublicWorkerHealth | null>(null);
  const [apiRouteProbe, setApiRouteProbe] = useState<ApiRouteProbe | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [debugPanel, setDebugPanel] = useState<any>(null);
  const [debugBusy, setDebugBusy] = useState(false);
  const [ghSecrets, setGhSecrets] = useState<GhSecretValidation | null>(null);
  const [ghSecretsBusy, setGhSecretsBusy] = useState(false);
  const [patValidation, setPatValidation] = useState<PatValidation | null>(null);
  const [patBusy, setPatBusy] = useState(false);
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [newToken, setNewToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [tokenSaving, setTokenSaving] = useState(false);
  const [lastSavedMask, setLastSavedMask] = useState<string | null>(null);

  const ADMIN_SUPABASE_HOST = (() => {
    try { return new URL(import.meta.env.VITE_SUPABASE_URL as string).host; } catch { return "unknown"; }
  })();

  const loadDebugPanel = async () => {
    setDebugBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-worker-control", { body: { action: "debug_panel" } });
      if (error) throw error;
      setDebugPanel(data);
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
    } finally {
      setDebugBusy(false);
    }
  };

  const validateGithubSecrets = async () => {
    setGhSecretsBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-worker-control", {
        body: { action: "validate_github_secrets" },
      });
      if (error) throw error;
      const validation: GhSecretValidation | undefined = (data as any)?.github;
      if (!validation) throw new Error((data as any)?.message ?? "validation response missing");
      setGhSecrets(validation);
      if (validation.ok) {
        toast.success(`All ${Object.keys(validation.secrets).length} GitHub secrets present on ${validation.repo}.`);
      } else if (validation.missing?.length) {
        toast.error(`Missing GitHub secrets: ${validation.missing.join(", ")}`);
      } else {
        toast.error(validation.message ?? "GitHub secrets validation failed");
      }
      // Refresh Cloud-side secret presence too.
      if ((data as any)?.secrets) {
        setHealth((prev) => ({ ...(prev ?? { ok: true }), secrets: (data as any).secrets } as HealthResponse));
      }
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
    } finally {
      setGhSecretsBusy(false);
    }
  };

  const validatePat = async () => {
    setPatBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-worker-control", {
        body: { action: "validate_github_pat", repo: PAT_TEST_REPO },
      });
      if (error) throw error;
      const v = (data as any)?.pat as PatValidation | undefined;
      if (!v) throw new Error((data as any)?.message ?? "validation response missing");
      setPatValidation(v);
      if (v.ok) toast.success("PAT valid — all 5 checks passed.");
      else toast.error(v.hint ?? "PAT validation failed. See diagnostics.");
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
    } finally {
      setPatBusy(false);
    }
  };

  const saveNewToken = async () => {
    if (!isValidPatFormatClient(newToken)) {
      toast.error("Token format invalid. Expect ghp_… or github_pat_….");
      return;
    }
    setTokenSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-worker-control", {
        body: { action: "update_github_pat", token: newToken, retry_dispatch: true },
      });
      if (error) {
        let body: any = (error as any)?.context?.body;
        if (typeof body === "string") { try { body = JSON.parse(body); } catch { /* noop */ } }
        if (body?.pat) setPatValidation(body.pat as PatValidation);
        throw new Error(body?.message ?? error.message);
      }
      if (!data?.ok) {
        if ((data as any)?.pat) setPatValidation((data as any).pat as PatValidation);
        throw new Error((data as any)?.message ?? "save failed");
      }
      setPatValidation((data as any).pat as PatValidation);
      setLastSavedMask((data as any).masked ?? null);
      setNewToken("");
      setShowToken(false);
      setTokenModalOpen(false);
      toast.success("New GitHub PAT saved and validated.");
      const dispatched = (data as any).dispatched;
      if (dispatched?.dispatched) {
        toast.success(`Auto-dispatched job ${String(dispatched.jobId).slice(0, 8)} to ${dispatched.workflow}`);
      } else if (dispatched?.error) {
        toast.warning(`Token saved but auto-dispatch failed: ${dispatched.error}`);
      }
      loadHealth();
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
    } finally {
      setTokenSaving(false);
    }
  };

  const runSmokeTest = async () => {
    setSmokeBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-smoke-test", { body: {} });
      if (error) throw error;
      setSmoke(data);
      if (data?.summary?.failed > 0) toast.error(`Smoke test: ${data.summary.failed} failed, ${data.summary.warned} warn`);
      else toast.success(`Smoke test passed (${data?.summary?.passed} OK, ${data?.summary?.warned} warn)`);
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
    finally { setSmokeBusy(false); }
  };

  const runE2eTest = async () => {
    setE2eBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-e2e-test", { body: {} });
      if (error) throw error;
      setE2e(data);
      if (data?.ok) toast.success(`E2E pipeline test passed in ${data.durationMs}ms`);
      else toast.error(`E2E test failed (${data?.summary?.failed} step(s))`);
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
    finally { setE2eBusy(false); }
  };

  const load = async () => {
    const { data, error } = await supabase
      .from("cinematic_ad_jobs" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) { toast.error(error.message); return; }
    setJobs((data as unknown as Job[]) ?? []);
  };

  useEffect(() => {
    load().finally(() => setLoading(false));
    loadHealth();
    const interval = setInterval(() => { loadHealth(); }, 30_000);
    const ch = supabase
      .channel("cinematic_ad_jobs_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "cinematic_ad_jobs" }, () => load())
      .subscribe();
    return () => { clearInterval(interval); supabase.removeChannel(ch); };
  }, []);

  const generate = async () => {
    setBusyId("__new__");
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-prepare", {
        body: { product_slug: productSlug, hook_variant: hookVariant },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? "prepare failed");
      toast.success("Assets prepared. Render the MP4 locally with the Remotion script, then push to Pinterest.");
      load();
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
    finally { setBusyId(null); }
  };

  const pushToPinterest = async (jobId: string) => {
    setBusyId(jobId);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-push-pinterest", { body: { job_id: jobId } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? "push failed");
      toast.success("Registered as Pinterest video asset.");
      load();
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
    finally { setBusyId(null); }
  };

  const sendToRenderWorker = async (jobId: string) => {
    setBusyId(jobId);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-queue-render", { body: { job_id: jobId } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? "queue failed");
      toast.success("Queued for render worker.");
      // copy command to clipboard for convenience
      try { await navigator.clipboard.writeText(data.command); } catch { /* noop */ }
      load();
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
    finally { setBusyId(null); }
  };

  const loadHealth = async () => {
    setHealthBusy(true);
    try {
      const apiProbe: ApiRouteProbe = {
        checkedUrl: WORKER_HEALTH_API_PATH,
        fallbackUrl: WORKER_HEALTH_FUNCTION_URL,
        status: null,
        contentType: null,
        spaFallbackDetected: false,
      };
      try {
        const routeRes = await fetch(`${WORKER_HEALTH_API_PATH}?t=${Date.now()}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        apiProbe.status = routeRes.status;
        apiProbe.contentType = routeRes.headers.get("content-type");
        apiProbe.spaFallbackDetected = (apiProbe.contentType ?? "").includes("text/html");
      } catch (probeErr: any) {
        apiProbe.error = probeErr?.message ?? String(probeErr);
      }
      setApiRouteProbe(apiProbe);

      const [controlResult, publicRes] = await Promise.all([
        supabase.functions.invoke("cinematic-ad-worker-control", { body: { action: "health" } }),
        fetch(`${WORKER_HEALTH_FUNCTION_URL}?t=${Date.now()}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        }),
      ]);
      const { data, error } = controlResult;
      if (error) throw error;
      const publicContentType = publicRes.headers.get("content-type") ?? "";
      if (publicContentType.includes("text/html")) {
        throw new Error("Backend API route unavailable — SPA fallback detected");
      }
      setPublicWorkerHealth(await publicRes.json());
      setHealth(data as HealthResponse);
    } catch (e: any) {
      setHealth({ ok: false, message: e?.message ?? String(e) });
    } finally {
      setHealthBusy(false);
    }
  };

  const retryRender = async (jobId: string) => {
    setBusyId(jobId);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-worker-control", { body: { action: "retry_render", job_id: jobId } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? "retry_render failed");
      const adminHost = ADMIN_SUPABASE_HOST;
      const serverHost = (data as any).supabase_host;
      const fresh = (data as any).fresh;
      console.log("[retry-render][client]", {
        jobId, prevStatus: (data as any).prevStatus, newStatus: (data as any).newStatus,
        adminHost, serverHost, fresh,
      });
      if (serverHost && adminHost !== serverHost) {
        toast.warning(`Admin/server Supabase host mismatch: admin=${adminHost} server=${serverHost}`);
      } else {
        toast.success(`Re-queued (${(data as any).prevStatus} → ${(data as any).newStatus}). DB host: ${serverHost ?? adminHost}`);
      }
      load();
      loadHealth();
      loadDebugPanel();
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
    finally { setBusyId(null); }
  };

  const retryPublish = async (jobId: string) => {
    setBusyId(jobId);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-worker-control", { body: { action: "retry_publish", job_id: jobId } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? "retry_publish failed");
      toast.success("Pinterest publish chain re-triggered.");
      load();
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
    finally { setBusyId(null); }
  };

  const copyText = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copied`); }
    catch { toast.error("Clipboard blocked"); }
  };

  const ghCommand = (jobId: string) =>
    `gh workflow run render-cinematic-ad.yml -f job_id=${jobId}`;

  const runGithubWorker = async (jobId?: string) => {
    setBusyId(jobId ?? "__gh__");
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-worker-control", {
        body: jobId ? { action: "trigger_github_workflow", job_id: jobId } : { action: "trigger_github_workflow", claim_next: true },
      });
      if (error) {
        // Try to read body for our friendly GH_SECRETS_MISSING code.
        let body: any = (error as any)?.context?.body;
        if (typeof body === "string") { try { body = JSON.parse(body); } catch { /* noop */ } }
        if (body?.code === "GH_SECRETS_MISSING" && body?.validation) {
          setGhSecrets(body.validation as GhSecretValidation);
          toast.error(body.message ?? "GitHub repo is missing required secrets.");
          return;
        }
        throw error;
      }
      if (!data?.ok) {
        if ((data as any)?.code === "GH_SECRETS_MISSING" && (data as any)?.validation) {
          setGhSecrets((data as any).validation as GhSecretValidation);
          toast.error((data as any).message ?? "GitHub repo is missing required secrets.");
          return;
        }
        throw new Error((data as any)?.message ?? "trigger failed");
      }
      if (data.dispatched === false) {
        toast.info(data.message ?? "Nothing to dispatch");
      } else {
        toast.success(`Dispatched job ${String(data.jobId).slice(0, 8)} to ${data.workflow}`);
        if (data.runsUrl) window.open(data.runsUrl, "_blank", "noopener");
      }
      load(); loadHealth();
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      if (/GH_PAT|GH_REPO/.test(msg)) {
        toast.error(`GitHub trigger not configured: ${msg}. Add GH_PAT (repo scope) and GH_REPO (owner/repo) in Cloud secrets.`);
      } else {
        toast.error(msg);
      }
    } finally { setBusyId(null); }
  };

  const resetStaleJobs = async () => {
    if (!confirm("Reset all worker_stale jobs back to render_queued?")) return;
    setBusyId("__reset__");
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-worker-control", {
        body: { action: "reset_stale" },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? "reset failed");
      toast.success(`Reset ${data.reset ?? 0} stale job(s) to render_queued`);
      load(); loadHealth();
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
    finally { setBusyId(null); }
  };

  const groups = {
    prepared: jobs.filter(j => j.status === "prepared"),
    render_queued: jobs.filter(j => j.status === "render_queued"),
    rendering: jobs.filter(j => j.status === "rendering"),
    rendered: jobs.filter(j => j.status === "rendered"),
    worker_stale: jobs.filter(j => j.status === "worker_stale"),
    failed: jobs.filter(j => j.status === "failed"),
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-6xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="size-6 text-primary" /> Cinematic Ads
        </h1>
        <p className="text-sm text-muted-foreground">
          Hybrid Remotion + Nano Banana pipeline. Generate cinematic 9:16 promo videos for Pinterest, TikTok &amp; Reels.
        </p>
      </header>

      {/* Debug panel — surfaces exact DB state so worker/admin mismatches are visible */}
      <Card className="border-dashed">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="size-4" /> Queue debug panel
          </CardTitle>
          <Button size="sm" variant="outline" onClick={loadDebugPanel} disabled={debugBusy}>
            {debugBusy ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
            <span className="ml-1">Refresh</span>
          </Button>
        </CardHeader>
        <CardContent className="text-xs space-y-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
            <span>Admin Supabase host: <code className="text-foreground">{ADMIN_SUPABASE_HOST}</code></span>
            <span>Server host: <code className="text-foreground">{debugPanel?.supabase_host ?? "—"}</code></span>
            <span>Table: <code className="text-foreground">{debugPanel?.table ?? "cinematic_ad_jobs"}</code></span>
          </div>
          {debugPanel?.supabase_host && debugPanel.supabase_host !== ADMIN_SUPABASE_HOST && (
            <Alert variant="destructive" className="py-2">
              <AlertTitle className="text-xs">Host mismatch</AlertTitle>
              <AlertDescription className="text-xs">
                Admin and worker-control edge function are on different Supabase projects. Render worker env likely points elsewhere too.
              </AlertDescription>
            </Alert>
          )}
          {debugPanel?.status_counts && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(debugPanel.status_counts).map(([k, v]) => (
                <Badge key={k} variant="outline" className="text-[10px]">{k}: {String(v)}</Badge>
              ))}
            </div>
          )}
          {debugPanel?.latest_rows?.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead className="text-muted-foreground">
                  <tr><th className="text-left pr-2">id</th><th className="text-left pr-2">status</th><th className="text-left pr-2">queued</th><th className="text-left pr-2">started</th><th className="text-left pr-2">updated</th></tr>
                </thead>
                <tbody>
                  {debugPanel.latest_rows.map((r: any) => (
                    <tr key={r.id} className="border-t border-border/50">
                      <td className="pr-2 font-mono">{r.id.slice(0, 8)}</td>
                      <td className="pr-2">{r.status}</td>
                      <td className="pr-2">{r.render_queued_at ? new Date(r.render_queued_at).toLocaleTimeString() : "—"}</td>
                      <td className="pr-2">{r.render_started_at ? new Date(r.render_started_at).toLocaleTimeString() : "—"}</td>
                      <td className="pr-2">{r.updated_at ? new Date(r.updated_at).toLocaleTimeString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!debugPanel && <div className="text-muted-foreground">Click Refresh to load DB snapshot.</div>}
        </CardContent>
      </Card>

      {health?.code === "MISSING_SECRETS" && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Render pipeline misconfigured</AlertTitle>
          <AlertDescription className="text-xs">
            {health.message}
            {health.secrets && (
              <ul className="mt-2 list-disc pl-5">
                {Object.entries(health.secrets).map(([k, v]) => (
                  <li key={k} className={v ? "text-emerald-700" : "text-destructive"}>
                    {k}: {v ? "set" : "missing"}
                  </li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      {health?.snapshot && health.snapshot.workerStale && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Render worker is not claiming jobs</AlertTitle>
          <AlertDescription className="text-xs space-y-1">
            <div>
              Last claim: {fmtAge(health.snapshot.lastClaimAgeMs)} · last heartbeat: {fmtAge(health.snapshot.heartbeatAgeMs ?? null)}
              {health.snapshot.lastClaimWorkerId && ` · worker ${health.snapshot.lastClaimWorkerId}`}
            </div>
            {health.snapshot.staleCandidates.length + health.snapshot.flaggedStale.length > 0 && (
              <div>
                {health.snapshot.staleCandidates.length + health.snapshot.flaggedStale.length} job(s) stuck in render_queued for &gt; 10 min.
                Verify the Render.com worker is running and that <code>RENDER_WORKER_SECRET</code> matches.
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* GitHub Secrets diagnostics — block dispatch when repo secrets are missing */}
      <Card className="border-dashed">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="size-4" /> GitHub Secrets setup
            {ghSecrets && (
              <Badge className={ghSecrets.ok ? "bg-emerald-500/15 text-emerald-700" : "bg-destructive/10 text-destructive"}>
                {ghSecrets.ok ? "all present" : `${ghSecrets.missing.length} missing`}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Button size="sm" variant="outline" onClick={() => setTokenModalOpen(true)}>
              <KeyRound className="size-3 mr-1" />
              Update GitHub Token
            </Button>
            <Button size="sm" variant="outline" onClick={validatePat} disabled={patBusy}>
              {patBusy ? <Loader2 className="size-3 animate-spin mr-1" /> : <KeyRound className="size-3 mr-1" />}
              Validate GitHub PAT
            </Button>
            <Button size="sm" variant="outline" onClick={validateGithubSecrets} disabled={ghSecretsBusy}>
              {ghSecretsBusy ? <Loader2 className="size-3 animate-spin mr-1" /> : <ShieldCheck className="size-3 mr-1" />}
              Validate GitHub Secrets
            </Button>
          </div>
        </CardHeader>
        <CardContent className="text-xs space-y-3">
          {/* GH_PAT status + per-permission checks */}
          <div className="rounded-md border p-3 space-y-2 bg-muted/30">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <KeyRound className="size-4" />
                <span className="font-medium">GitHub Personal Access Token</span>
                {health?.ghPat?.present ? (
                  <Badge className="bg-emerald-500/15 text-emerald-700">
                    stored · {health.ghPat.source}
                  </Badge>
                ) : (
                  <Badge className="bg-destructive/10 text-destructive">not set</Badge>
                )}
              </div>
              <div className="text-muted-foreground">
                {(lastSavedMask ?? health?.ghPat?.masked) && (
                  <>Masked: <code className="text-foreground">{lastSavedMask ?? health?.ghPat?.masked}</code></>
                )}
                {health?.ghPat?.updatedAt && (
                  <span className="ml-2">· rotated {new Date(health.ghPat.updatedAt).toLocaleString()}</span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="ghost" className="h-7 px-2">
                <a href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-3 mr-1" /> Open GitHub PAT settings
                </a>
              </Button>
            </div>

            {/* Inline token input — same logic as the modal, just always visible */}
            <div className="space-y-1 pt-1 border-t">
              <Label htmlFor="gh-pat-inline" className="text-xs">Paste new GH_PAT</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="gh-pat-inline"
                    type={showToken ? "text" : "password"}
                    autoComplete="off"
                    spellCheck={false}
                    value={newToken}
                    onChange={(e) => setNewToken(e.target.value.trim())}
                    placeholder="ghp_… or github_pat_…"
                    className="pr-9 font-mono text-xs h-8"
                  />
                  <button
                    type="button"
                    aria-label={showToken ? "Hide token" : "Show token"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowToken((v) => !v)}
                  >
                    {showToken ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
                <Button
                  size="sm"
                  onClick={saveNewToken}
                  disabled={tokenSaving || !isValidPatFormatClient(newToken)}
                >
                  {tokenSaving ? <Loader2 className="size-3 animate-spin mr-1" /> : <KeyRound className="size-3 mr-1" />}
                  Save &amp; validate
                </Button>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {newToken.length === 0
                  ? "Validated against repo before saving. Auto-retries queued render dispatch."
                  : isValidPatFormatClient(newToken)
                    ? <span className="text-emerald-700">Format OK — click Save &amp; validate.</span>
                    : <span className="text-destructive">Format invalid. Expect ghp_… or github_pat_….</span>}
              </div>
            </div>

            {patValidation && (
              <>
                <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {PAT_CHECK_LABELS.map(({ key, label }) => {
                    const c = patValidation.checks[key];
                    return (
                      <div key={key} className="flex items-start gap-2">
                        {c.ok ? (
                          <CheckCircle2 className="size-3.5 mt-0.5 text-emerald-600 shrink-0" />
                        ) : (
                          <XCircle className="size-3.5 mt-0.5 text-destructive shrink-0" />
                        )}
                        <div className="flex-1">
                          <div className="font-medium">{label}</div>
                          <div className="text-muted-foreground">
                            {c.message}{c.status ? ` (HTTP ${c.status})` : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="text-muted-foreground flex flex-wrap gap-x-3">
                  <span>kind: <code className="text-foreground">{patValidation.tokenKind}</code></span>
                  <span>tested against: <code className="text-foreground">{patValidation.repoTested}</code></span>
                  {patValidation.scopes && patValidation.scopes.length > 0 && (
                    <span>scopes: <code className="text-foreground">{patValidation.scopes.join(", ")}</code></span>
                  )}
                </div>
                {!patValidation.ok && patValidation.hint && (
                  <Alert variant="destructive" className="py-2 mt-1">
                    <AlertTriangle className="size-4" />
                    <AlertTitle className="text-xs">Fix this before dispatching</AlertTitle>
                    <AlertDescription className="text-xs">{patValidation.hint}</AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </div>

          <p className="text-muted-foreground">
            The render workflow (<code>.github/workflows/render-cinematic-ad.yml</code>) needs three repo-level secrets on GitHub
            and two on Lovable Cloud to dispatch from the admin. We never read or display secret values — only whether they exist.
          </p>

          <div className="flex flex-wrap gap-2">
            {ghSecrets?.repo && (
              <Button asChild size="sm" variant="outline">
                <a href={`https://github.com/${ghSecrets.repo}/settings/secrets/actions`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-3 mr-1" /> Open GitHub repo secrets
                </a>
              </Button>
            )}
            <Button asChild size="sm" variant="outline">
              <a
                href={`https://supabase.com/dashboard/project/${import.meta.env.VITE_SUPABASE_PROJECT_ID}/settings/api`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="size-3 mr-1" /> Open backend API settings
              </a>
            </Button>
            {ghSecrets?.repo && (
              <Button asChild size="sm" variant="outline">
                <a href={`https://github.com/${ghSecrets.repo}/actions/workflows/${ghSecrets.workflow}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-3 mr-1" /> Workflow runs
                </a>
              </Button>
            )}
          </div>

          {ghSecrets && !ghSecrets.ok && (
            <Alert variant="destructive" className="py-2">
              <AlertTriangle className="size-4" />
              <AlertTitle className="text-xs">Render dispatch is blocked</AlertTitle>
              <AlertDescription className="text-xs space-y-1">
                <div>{ghSecrets.message}</div>
                {ghSecrets.hint && <div className="text-muted-foreground">{ghSecrets.hint}</div>}
              </AlertDescription>
            </Alert>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left pr-2 pb-1">Secret</th>
                  <th className="text-left pr-2 pb-1">Where it lives</th>
                  <th className="text-left pr-2 pb-1">Status</th>
                  <th className="text-left pr-2 pb-1">How to find it</th>
                  <th className="text-left pb-1"></th>
                </tr>
              </thead>
              <tbody>
                {SECRET_CATALOG.map((spec) => {
                  const cloudPresent = health?.secrets?.[spec.name];
                  const ghEntry = ghSecrets?.secrets?.[spec.name];
                  const present = spec.scope === "github"
                    ? (ghEntry?.present ?? null)
                    : (cloudPresent ?? null);
                  const statusLabel = present === null
                    ? "unknown"
                    : present ? "present" : "missing";
                  const statusClass = present === null
                    ? "bg-muted text-muted-foreground"
                    : present ? "bg-emerald-500/15 text-emerald-700" : "bg-destructive/10 text-destructive";
                  return (
                    <tr key={spec.name} className="border-t border-border/50 align-top">
                      <td className="pr-2 py-1 font-mono">{spec.name}</td>
                      <td className="pr-2 py-1">
                        <Badge variant="outline" className="text-[10px]">
                          {spec.scope === "github" ? "GitHub repo" : "Lovable Cloud"}
                        </Badge>
                        <div className="text-muted-foreground mt-0.5">{spec.label}</div>
                      </td>
                      <td className="pr-2 py-1">
                        <Badge className={statusClass}>{statusLabel}</Badge>
                        {spec.scope === "github" && ghEntry?.updatedAt && (
                          <div className="text-muted-foreground mt-0.5 text-[10px]">
                            updated {new Date(ghEntry.updatedAt).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td className="pr-2 py-1 text-muted-foreground max-w-[28ch]">
                        {spec.whereToFind}
                        {spec.link && (
                          <a
                            href={spec.link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-1 underline text-primary"
                          >
                            {spec.link.label}
                          </a>
                        )}
                      </td>
                      <td className="py-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2"
                          onClick={() => copyText(spec.name, `${spec.name} name`)}
                          title="Copy secret name"
                        >
                          <Copy className="size-3" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {ghSecrets && (
            <div className="text-muted-foreground">
              Repo: <code className="text-foreground">{ghSecrets.repo ?? "—"}</code> ·
              workflow: <code className="text-foreground">{ghSecrets.workflow}</code>@<code className="text-foreground">{ghSecrets.ref}</code> ·
              GitHub API status: <code className="text-foreground">{ghSecrets.ghApiStatus ?? "—"}</code>
            </div>
          )}
          {!ghSecrets && (
            <div className="text-muted-foreground">
              Click <strong>Validate GitHub Secrets</strong> to query the GitHub API for repo-secret presence (names only, never values).
            </div>
          )}
        </CardContent>
      </Card>

      {/* Secure rotation modal */}
      <Dialog open={tokenModalOpen} onOpenChange={setTokenModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-4" /> Update GitHub Token
            </DialogTitle>
            <DialogDescription className="text-xs">
              Paste a new GitHub Personal Access Token. Accepted formats:
              <code className="mx-1">ghp_…</code> (classic, <code>repo</code> scope) or
              <code className="mx-1">github_pat_…</code> (fine-grained: Actions R/W, Secrets R/W, Contents R, Metadata R).
              We validate it against <code>{PAT_TEST_REPO}</code> before saving and never display the value back.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="gh-pat-input" className="text-xs">New GH_PAT</Label>
              <div className="relative">
                <Input
                  id="gh-pat-input"
                  type={showToken ? "text" : "password"}
                  autoComplete="off"
                  spellCheck={false}
                  value={newToken}
                  onChange={(e) => setNewToken(e.target.value.trim())}
                  placeholder="ghp_… or github_pat_…"
                  className="pr-10 font-mono text-xs"
                />
                <button
                  type="button"
                  aria-label={showToken ? "Hide token" : "Show token"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowToken((v) => !v)}
                >
                  {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {newToken.length === 0
                  ? "Paste a token to enable Save."
                  : isValidPatFormatClient(newToken)
                    ? <span className="text-emerald-700">Format OK — will be validated on save.</span>
                    : <span className="text-destructive">Format invalid. Expect ghp_… or github_pat_….</span>}
              </div>
            </div>
            <Alert className="py-2">
              <ShieldCheck className="size-4" />
              <AlertDescription className="text-xs">
                On save we'll re-run worker diagnostics and auto-retry any queued render dispatch.
                The token is stored encrypted at rest and only readable by backend functions.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setTokenModalOpen(false); setNewToken(""); setShowToken(false); }} disabled={tokenSaving}>
              Cancel
            </Button>
            <Button onClick={saveNewToken} disabled={tokenSaving || !isValidPatFormatClient(newToken)}>
              {tokenSaving ? <Loader2 className="size-3 animate-spin mr-1" /> : <KeyRound className="size-3 mr-1" />}
              Save &amp; validate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="size-4" /> Render worker health
            {(publicWorkerHealth || health?.snapshot) && (
              <Badge className={(publicWorkerHealth?.workerLive ?? health?.snapshot?.workerLive) ? "bg-emerald-500/15 text-emerald-700" : "bg-orange-500/15 text-orange-700"}>
                {(publicWorkerHealth?.workerLive ?? health?.snapshot?.workerLive) ? "live" : "stale"}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs space-y-2">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={loadHealth} disabled={healthBusy}>
              {healthBusy ? <Loader2 className="size-3 animate-spin mr-1" /> : <RefreshCw className="size-3 mr-1" />}
              Refresh
            </Button>
            <Button size="sm" onClick={() => runGithubWorker()} disabled={busyId === "__gh__"}>
              {busyId === "__gh__" ? <Loader2 className="size-3 animate-spin mr-1" /> : <PlayCircle className="size-3 mr-1" />}
              Run GitHub Render Worker Now
            </Button>
            {(health?.snapshot?.flaggedStale?.length ?? 0) > 0 && (
              <Button size="sm" variant="destructive" onClick={resetStaleJobs} disabled={busyId === "__reset__"}>
                {busyId === "__reset__" ? <Loader2 className="size-3 animate-spin mr-1" /> : <Trash2 className="size-3 mr-1" />}
                Reset stale jobs ({health.snapshot.flaggedStale.length})
              </Button>
            )}
            <span className="text-muted-foreground">
              Polled every 30s · liveness from heartbeats &amp; job activity. Backend JSON: <code>{WORKER_HEALTH_FUNCTION_URL}</code>.
            </span>
          </div>
          {apiRouteProbe?.spaFallbackDetected && (
            <Alert variant="destructive" className="py-2">
              <AlertTriangle className="size-4" />
              <AlertTitle className="text-xs">Backend API route unavailable — SPA fallback detected</AlertTitle>
              <AlertDescription className="text-xs">
                <code>{apiRouteProbe.checkedUrl}</code> returned <code>{apiRouteProbe.contentType}</code>, so the admin is using the direct backend function instead.
              </AlertDescription>
            </Alert>
          )}
          {publicWorkerHealth && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded border border-border/60 p-2">
              <div><div className="text-muted-foreground">Backend route</div><div className="font-mono truncate">{publicWorkerHealth.route}</div></div>
              <div><div className="text-muted-foreground">Worker live</div><div className="font-mono">{String(publicWorkerHealth.workerLive)}</div></div>
              <div><div className="text-muted-foreground">Queue depth</div><div className="font-mono">{publicWorkerHealth.queueDepth}</div></div>
              <div><div className="text-muted-foreground">Message</div><div className="font-mono truncate">{publicWorkerHealth.message ?? "—"}</div></div>
            </div>
          )}
          {!health && <div className="text-muted-foreground">Loading…</div>}
          {health && !health.ok && health.code !== "MISSING_SECRETS" && (
            <div className="text-destructive">Health check failed: {health.message}</div>
          )}
          {health?.snapshot && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div><div className="text-muted-foreground">Worker live</div><div className="font-mono">{String(health.snapshot.workerLive)}</div></div>
              <div><div className="text-muted-foreground">Last claim</div><div className="font-mono">{fmtAge(health.snapshot.lastClaimAgeMs)}</div></div>
              <div><div className="text-muted-foreground">Last claim worker</div><div className="font-mono truncate">{health.snapshot.lastClaimWorkerId ?? "—"}</div></div>
              <div><div className="text-muted-foreground">Last heartbeat</div><div className="font-mono">{fmtAge(health.snapshot.heartbeatAgeMs ?? null)}</div></div>
              <div><div className="text-muted-foreground">Last job touch</div><div className="font-mono">{fmtAge(health.snapshot.lastTouchedAgeMs ?? null)}</div></div>
              <div><div className="text-muted-foreground">Current job</div><div className="font-mono truncate">{health.snapshot.currentJob?.id?.slice(0, 8) ?? "—"}</div></div>
              <div><div className="text-muted-foreground">Last render complete</div><div className="font-mono">{health.snapshot.lastCompleteAt ? new Date(health.snapshot.lastCompleteAt).toLocaleString() : "—"}</div></div>
              <div><div className="text-muted-foreground">Stale (queued &gt; 10m)</div><div className="font-mono">{health.snapshot.staleCandidates.length + health.snapshot.flaggedStale.length}</div></div>
              <div><div className="text-muted-foreground">Threshold</div><div className="font-mono">{Math.round(health.snapshot.staleThresholdMs / 60000)}m</div></div>
            </div>
          )}
          {health?.workerHealth && !health.workerHealth.ok && (
            <div className="text-[11px] text-muted-foreground">
              Health endpoint unavailable ({health.workerHealth.error ?? "unreachable"}). This is normal for Render Background Workers — liveness is derived from DB activity.
            </div>
          )}
          {health?.secrets && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] pt-1 border-t">
              {Object.entries(health.secrets).map(([k, v]) => (
                <span key={k} className={v ? "text-emerald-700" : "text-destructive"}>
                  {v ? "✓" : "✗"} {k}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Generate Viral Ad</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Product slug</label>
              <Input value={productSlug} onChange={(e) => setProductSlug(e.target.value)} placeholder="product-slug" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Hook variant</label>
              <Input value={hookVariant} onChange={(e) => setHookVariant(e.target.value)} placeholder="default" />
            </div>
          </div>
          <Button onClick={generate} disabled={busyId === "__new__"} className="w-full sm:w-auto">
            {busyId === "__new__" ? <Loader2 className="size-4 animate-spin mr-2" /> : <Sparkles className="size-4 mr-2" />}
            Prepare cinematic assets
          </Button>
          <p className="text-xs text-muted-foreground">
            Step 1 (this button): generates 6 AI scene stills + ElevenLabs voiceover (Sarah). Step 2: render MP4 locally
            via <code className="text-[10px] bg-muted px-1 py-0.5 rounded">remotion/scripts/render-cinematic-ad.mjs</code>.
            Step 3: click <strong>Push to Pinterest</strong> to register the MP4.
          </p>
        </CardContent>
      </Card>

      <Card className="border-primary/20">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Cloud className="size-4" /> External Render Worker</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>
            Lovable Cloud cannot run ffmpeg/Chromium. Click <strong>Send to Render Worker</strong> on a prepared job to queue it; then either trigger the GitHub Actions workflow or let your Render.com / Railway worker pick it up.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => copyText("gh workflow run render-cinematic-ad.yml -f job_id=<JOB_UUID>", "GitHub Actions command")}>
              <Copy className="size-3 mr-1" /> Copy GitHub Actions command
            </Button>
            <Button size="sm" variant="outline" onClick={() => copyText("Render.com → New Background Worker → see render-worker/README.md for env vars + start command.", "Render.com instructions")}>
              <Copy className="size-3 mr-1" /> Copy Render.com setup
            </Button>
            <Button size="sm" variant="ghost" onClick={() => load()}>
              <RefreshCw className="size-3 mr-1" /> Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="size-4" /> Pipeline Smoke Test
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button size="sm" onClick={runSmokeTest} disabled={smokeBusy}>
            {smokeBusy ? <Loader2 className="size-4 animate-spin mr-1" /> : <ShieldCheck className="size-4 mr-1" />}
            Run end-to-end smoke test
          </Button>
          <Button size="sm" variant="secondary" onClick={runE2eTest} disabled={e2eBusy} className="ml-2">
            {e2eBusy ? <Loader2 className="size-4 animate-spin mr-1" /> : <ShieldCheck className="size-4 mr-1" />}
            Run automated E2E pipeline test
          </Button>
          <p className="text-[11px] text-muted-foreground">
            E2E test creates a throwaway job, walks queue → claim → upload → webhook, validates the public MP4 URL, then deletes the test job. No external worker required.
          </p>
          {e2e && (
            <div className="text-xs space-y-2">
              <div className="flex flex-wrap gap-3">
                <span className={e2e.ok ? "text-emerald-700 font-semibold" : "text-destructive font-semibold"}>
                  {e2e.ok ? "Pipeline OK ✓" : "Pipeline FAILED"}
                </span>
                <span className="text-muted-foreground">{e2e.durationMs}ms · trace {e2e.traceId}</span>
              </div>
              <div className="border rounded divide-y">
                {(e2e.steps ?? []).map((s: any, i: number) => (
                  <div key={i} className="p-2 flex items-start gap-2">
                    <Badge className={s.status === "OK" ? "bg-emerald-500/10 text-emerald-700" : "bg-destructive/10 text-destructive"}>
                      {s.status}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{s.name} <span className="text-muted-foreground font-normal">({s.ms}ms)</span></div>
                      {s.reason !== "ok" && <div className="text-muted-foreground break-words">{s.reason}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {smoke?.summary && (
            <div className="text-xs flex flex-wrap gap-3">
              <span className="text-emerald-600">OK: {smoke.summary.passed}</span>
              <span className="text-amber-600">WARN: {smoke.summary.warned}</span>
              <span className="text-destructive">FAIL: {smoke.summary.failed}</span>
              <span className={smoke.summary.productionReady ? "text-emerald-700 font-semibold" : "text-muted-foreground"}>
                {smoke.summary.productionReady ? "Production-ready ✓" : "Not yet production-ready"}
              </span>
              {smoke.job_used && <span className="font-mono text-muted-foreground">job: {String(smoke.job_used).slice(0,8)}</span>}
            </div>
          )}
          {Array.isArray(smoke?.checks) && (
            <div className="border rounded divide-y">
              {smoke.checks.map((c: any) => (
                <div key={c.traceId} className="p-2 text-xs flex items-start gap-2">
                  <Badge className={
                    c.status === "OK" ? "bg-emerald-500/10 text-emerald-700"
                    : c.status === "WARN" ? "bg-amber-500/10 text-amber-700"
                    : "bg-destructive/10 text-destructive"
                  }>{c.status}</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-muted-foreground break-words">{c.reason}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">trace {c.traceId} · {new Date(c.ts).toLocaleTimeString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</div>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No jobs yet.</p>
        ) : (
          (["prepared","render_queued","rendering","rendered","worker_stale","failed"] as const).map((groupKey) => {
            const groupJobs = groups[groupKey];
            if (groupJobs.length === 0) return null;
            return (
            <div key={groupKey} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase text-muted-foreground tracking-wide">
                {groupKey.replace("_"," ")} <span className="ml-1 opacity-60">({groupJobs.length})</span>
              </h2>
              {groupJobs.map((j) => (
              <Card key={j.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <div className="space-y-0.5">
                      <div className="font-mono text-xs text-muted-foreground">{j.id.slice(0, 8)}</div>
                      <div className="font-medium text-sm">{j.product_slug}</div>
                      <div className="text-xs text-muted-foreground">hook: {j.hook_variant} · {new Date(j.created_at).toLocaleString()}</div>
                      {(j.render_attempts ?? 0) > 0 && (
                        <div className="text-[10px] text-muted-foreground">attempts: {j.render_attempts}{j.render_worker_id ? ` · ${j.render_worker_id}` : ""}</div>
                      )}
                    </div>
                    <Badge className={STATUS_COLOR[j.status] ?? "bg-muted"}>{j.status}</Badge>
                  </div>
                  {j.status_message && <p className="text-xs text-muted-foreground">{j.status_message}</p>}
                  {j.error_message && <p className="text-xs text-destructive">{j.error_message}</p>}

                  {(j.vo_script || (j.scene_assets && j.scene_assets.length > 0)) && (() => {
                    const isOpen = openPreview[j.id] ?? (j.status === "prepared" || j.status === "render_queued");
                    const variantCount = Math.min(
                      (j.vo_script_variants?.length ?? 0) || 1,
                      ...((j.caption_variants ?? []).map((row) => row?.length ?? 0).filter((n) => n > 0)),
                    );
                    const hasVariants = variantCount > 1;
                    return (
                      <div className="rounded border bg-muted/30">
                        <button
                          type="button"
                          onClick={() => setOpenPreview((s) => ({ ...s, [j.id]: !isOpen }))}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium hover:bg-muted/50 rounded-t"
                        >
                          <span className="flex items-center gap-1.5">
                            {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                            <FileText className="size-3.5" />
                            Copy preview — review captions & voiceover before render
                          </span>
                          {hasVariants && (
                            <span className="text-[10px] text-muted-foreground font-normal">
                              variant {(j.variant_index ?? 0) + 1} / {variantCount}
                            </span>
                          )}
                        </button>
                        {isOpen && (
                          <div className="px-3 pb-3 pt-1 space-y-3 text-xs">
                            {j.vo_script && (
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">
                                    Voiceover script
                                    <span className="ml-2 font-normal normal-case">
                                      {j.vo_script.split(/\s+/).filter(Boolean).length} words
                                    </span>
                                  </span>
                                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => copyText(j.vo_script ?? "", "VO script")}>
                                    <Copy className="size-3 mr-1" /> Copy
                                  </Button>
                                </div>
                                <p className="leading-relaxed whitespace-pre-wrap">{j.vo_script}</p>
                                {(j.vo_script_variants?.length ?? 0) > 1 && (
                                  <details className="pt-1">
                                    <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
                                      {j.vo_script_variants!.length} VO variants available
                                    </summary>
                                    <ol className="list-decimal pl-5 pt-1 space-y-1 text-muted-foreground">
                                      {j.vo_script_variants!.map((v, i) => (
                                        <li key={i} className={i === (j.variant_index ?? 0) ? "text-foreground font-medium" : ""}>
                                          {v}
                                        </li>
                                      ))}
                                    </ol>
                                  </details>
                                )}
                              </div>
                            )}

                            {j.scene_assets && j.scene_assets.length > 0 && (
                              <div className="space-y-1">
                                <span className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">
                                  Scene captions
                                </span>
                                <ol className="space-y-1.5">
                                  {j.scene_assets
                                    .slice()
                                    .sort((a, b) => a.index - b.index)
                                    .map((s) => {
                                      const altRow = j.caption_variants?.[s.index - 1] ?? [];
                                      const alts = altRow.filter((c) => c && c !== s.caption);
                                      return (
                                        <li key={s.index} className="flex items-start gap-2">
                                          <span className="font-mono text-[10px] text-muted-foreground mt-0.5 shrink-0 w-5">
                                            {s.index}.
                                          </span>
                                          <div className="flex-1 min-w-0">
                                            <div className="font-medium">{s.caption}</div>
                                            {alts.length > 0 && (
                                              <div className="text-[10px] text-muted-foreground">
                                                alts: {alts.join(" · ")}
                                              </div>
                                            )}
                                          </div>
                                          <span className="text-[10px] text-muted-foreground shrink-0">
                                            {s.duration_seconds}s
                                          </span>
                                        </li>
                                      );
                                    })}
                                </ol>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {j.scene_assets?.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {j.scene_assets.map((s) => (
                        <div key={s.index} className="space-y-1">
                          <img src={s.image_url} alt={`Scene ${s.index}: ${s.caption}`} className="aspect-[9/16] w-full object-cover rounded border" loading="lazy" />
                          <div className="text-[10px] text-muted-foreground truncate" title={s.caption}>{s.index}. {s.caption}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {j.vo_url && (
                    <audio controls src={j.vo_url} className="w-full h-10" preload="none" />
                  )}

                  {j.output_mp4_url && (
                    <video controls src={j.output_mp4_url} className="w-full max-w-[240px] aspect-[9/16] rounded border bg-black" preload="none" />
                  )}

                  {(j.pinterest_pin_url || j.pinterest_publish_error || (j.pinterest_publish_attempts ?? 0) > 0) && (
                    <div className="rounded border bg-muted/30 p-3 text-xs space-y-1.5">
                      <div className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">
                        Pinterest publish
                      </div>
                      {j.pinterest_pin_url ? (
                        <div className="flex items-center gap-2">
                          <Badge className="bg-pink-500/15 text-pink-700">live</Badge>
                          <a href={j.pinterest_pin_url} target="_blank" rel="noopener noreferrer" className="text-primary underline truncate">
                            {j.pinterest_pin_url}
                          </a>
                        </div>
                      ) : (
                        <div className="text-muted-foreground">
                          {j.status === "pinterest_uploaded" ? "Uploaded; awaiting pin creation." : "Not yet published."}
                        </div>
                      )}
                      {(j.pinterest_publish_attempts ?? 0) > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          attempts: {j.pinterest_publish_attempts}
                          {j.last_pinterest_attempt_at && ` · last ${new Date(j.last_pinterest_attempt_at).toLocaleString()}`}
                        </div>
                      )}
                      {j.pinterest_publish_error && (
                        <div className="text-destructive break-words">{j.pinterest_publish_error}</div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {(j.status === "prepared" || j.status === "failed") && (
                      <Button size="sm" onClick={() => sendToRenderWorker(j.id)} disabled={busyId === j.id}>
                        {busyId === j.id ? <Loader2 className="size-4 animate-spin mr-1" /> : <Cloud className="size-4 mr-1" />}
                        Send to Render Worker
                      </Button>
                    )}
                    {(j.status === "render_queued" || j.status === "rendering" || j.status === "worker_stale" || j.status === "failed") && (
                      <Button size="sm" variant="outline" onClick={() => retryRender(j.id)} disabled={busyId === j.id}>
                        {busyId === j.id ? <Loader2 className="size-4 animate-spin mr-1" /> : <RotateCcw className="size-4 mr-1" />}
                        Retry render
                      </Button>
                    )}
                    {j.output_mp4_url && (j.status !== "published" || j.pinterest_publish_error) && (
                      <Button size="sm" variant="outline" onClick={() => retryPublish(j.id)} disabled={busyId === j.id}>
                        {busyId === j.id ? <Loader2 className="size-4 animate-spin mr-1" /> : <Send className="size-4 mr-1" />}
                        Retry publish
                      </Button>
                    )}
                    {(j.status === "prepared" || j.status === "render_queued" || j.status === "failed") && (
                      <>
                        <Button size="sm" onClick={() => runGithubWorker(j.id)} disabled={busyId === j.id}>
                          {busyId === j.id ? <Loader2 className="size-3 animate-spin mr-1" /> : <PlayCircle className="size-3 mr-1" />}
                          Run GitHub now
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => copyText(ghCommand(j.id), "GH command")}>
                          <Copy className="size-3 mr-1" /> Copy GH command
                        </Button>
                      </>
                    )}
                    {j.output_mp4_url && (
                      <>
                        <Button size="sm" variant="outline" asChild>
                          <a href={j.output_mp4_url} download><Download className="size-4 mr-1" /> Download MP4</a>
                        </Button>
                        <Button size="sm" onClick={() => pushToPinterest(j.id)} disabled={busyId === j.id || !!j.pinterest_asset_id}>
                          {busyId === j.id ? <Loader2 className="size-4 animate-spin mr-1" /> : <Send className="size-4 mr-1" />}
                          {j.pinterest_asset_id ? "Pushed to Pinterest" : "Push to Pinterest"}
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <a href={j.output_mp4_url} target="_blank" rel="noopener" title="Open MP4 — download then upload to TikTok/IG manually">
                            <Video className="size-4 mr-1" /> TikTok / IG
                          </a>
                        </Button>
                      </>
                    )}
                    {j.pinterest_asset_id && (
                      <Badge variant="outline" className="text-xs">Pinterest asset {j.pinterest_asset_id.slice(0, 8)}</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
              ))}
            </div>
            );
          })
        )}
      </section>
    </div>
  );
}
import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, GitBranch, CheckCircle2, AlertCircle, GitMerge, ExternalLink, Settings, BellRing, Play } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const LS_KEY = "gp.github.repo";
const LS_TOKEN = "gp.github.token";
const LS_RENDER_URL = "gp.render.healthUrl";
const LS_RENDER_API_KEY = "gp.render.apiKey";
const LS_RENDER_SERVICE = "gp.render.serviceId";

type Commit = {
  sha: string;
  commit: { message: string; author: { name: string; date: string } };
  html_url: string;
};

type Branch = { name: string; commit: { sha: string } };

export default function GitHubSyncStatusPage() {
  const [repo, setRepo] = useState<string>(() => localStorage.getItem(LS_KEY) || "");
  const [input, setInput] = useState(repo);
  const [token, setToken] = useState<string>(() => localStorage.getItem(LS_TOKEN) || "");
  const [tokenInput, setTokenInput] = useState(token);
  const [merging, setMerging] = useState<string | null>(null);
  const [mainCommit, setMainCommit] = useState<Commit | null>(null);
  const [lovableBranches, setLovableBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const [renderUrl, setRenderUrl] = useState<string>(() => localStorage.getItem(LS_RENDER_URL) || "");
  const [renderUrlInput, setRenderUrlInput] = useState(renderUrl);
  const [renderApiKey, setRenderApiKey] = useState<string>(() => localStorage.getItem(LS_RENDER_API_KEY) || "");
  const [renderApiKeyInput, setRenderApiKeyInput] = useState(renderApiKey);
  const [renderServiceId, setRenderServiceId] = useState<string>(() => localStorage.getItem(LS_RENDER_SERVICE) || "");
  const [renderServiceIdInput, setRenderServiceIdInput] = useState(renderServiceId);
  const [deployedCommit, setDeployedCommit] = useState<string | null>(null);
  const [deployStatus, setDeployStatus] = useState<string | null>(null);
  const [deployFetchedAt, setDeployFetchedAt] = useState<Date | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployLoading, setDeployLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!repo) return;
    setLoading(true);
    setError(null);
    try {
      const [commitRes, branchesRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${repo}/commits/main`),
        fetch(`https://api.github.com/repos/${repo}/branches?per_page=100`),
      ]);
      if (!commitRes.ok) throw new Error(`main commit: ${commitRes.status}`);
      if (!branchesRes.ok) throw new Error(`branches: ${branchesRes.status}`);
      const commit: Commit = await commitRes.json();
      const branches: Branch[] = await branchesRes.json();
      setMainCommit(commit);
      setLovableBranches(
        branches.filter((b) => /lovable/i.test(b.name) && b.commit.sha !== commit.sha),
      );
      setLastFetched(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => {
    if (repo) refresh();
  }, [repo, refresh]);

  useEffect(() => {
    if (!repo) return;
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [repo, refresh]);

  const save = () => {
    const cleaned = input.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
    localStorage.setItem(LS_KEY, cleaned);
    setRepo(cleaned);
  };

  const saveToken = () => {
    const t = tokenInput.trim();
    if (t) localStorage.setItem(LS_TOKEN, t);
    else localStorage.removeItem(LS_TOKEN);
    setToken(t);
    toast({ title: t ? "Token saved" : "Token cleared" });
  };

  const ghHeaders = (): HeadersInit => ({
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  const mergeBranch = async (branch: string) => {
    if (!token) {
      window.open(
        `https://github.com/${repo}/compare/main...${branch}?expand=1`,
        "_blank",
        "noreferrer",
      );
      return;
    }
    setMerging(branch);
    try {
      // 1. Find or create PR
      const listRes = await fetch(
        `https://api.github.com/repos/${repo}/pulls?state=open&head=${repo.split("/")[0]}:${branch}&base=main`,
        { headers: ghHeaders() },
      );
      if (!listRes.ok) throw new Error(`list pulls: ${listRes.status}`);
      const existing: Array<{ number: number; html_url: string }> = await listRes.json();
      let pr = existing[0];
      if (!pr) {
        const createRes = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
          method: "POST",
          headers: { ...ghHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `Sync ${branch} → main`,
            head: branch,
            base: "main",
            body: "Auto-opened from GitHub Sync Status panel.",
          }),
        });
        if (!createRes.ok) {
          const txt = await createRes.text();
          throw new Error(`create PR: ${createRes.status} ${txt}`);
        }
        pr = await createRes.json();
      }
      // 2. Merge PR
      const mergeRes = await fetch(
        `https://api.github.com/repos/${repo}/pulls/${pr.number}/merge`,
        {
          method: "PUT",
          headers: { ...ghHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ merge_method: "merge" }),
        },
      );
      if (!mergeRes.ok) {
        const txt = await mergeRes.text();
        throw new Error(`merge: ${mergeRes.status} ${txt}`);
      }
      toast({ title: "Merged into main", description: branch });
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Merge failed", description: msg, variant: "destructive" });
    } finally {
      setMerging(null);
    }
  };

  const inSync = lovableBranches.length === 0;

  const refreshDeploy = useCallback(async () => {
    setDeployError(null);
    if (!renderUrl && !(renderApiKey && renderServiceId)) {
      setDeployedCommit(null);
      setDeployStatus(null);
      return;
    }
    setDeployLoading(true);
    try {
      if (renderApiKey && renderServiceId) {
        const res = await fetch(
          `https://api.render.com/v1/services/${renderServiceId}/deploys?limit=1`,
          { headers: { Authorization: `Bearer ${renderApiKey}`, Accept: "application/json" } },
        );
        if (!res.ok) throw new Error(`render api: ${res.status}`);
        const arr = await res.json();
        const dep = Array.isArray(arr) ? arr[0]?.deploy : null;
        if (!dep) throw new Error("no deploys returned");
        setDeployedCommit(dep.commit?.id || null);
        setDeployStatus(dep.status || null);
      } else {
        const res = await fetch(renderUrl, { cache: "no-store" });
        if (!res.ok) throw new Error(`health: ${res.status}`);
        const data = await res.json();
        const sha =
          data.commit || data.sha || data.gitCommit || data.git_commit || data.RENDER_GIT_COMMIT || null;
        if (!sha) throw new Error("response missing commit/sha field");
        setDeployedCommit(String(sha));
        setDeployStatus(data.status || "live");
      }
      setDeployFetchedAt(new Date());
    } catch (e) {
      setDeployError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeployLoading(false);
    }
  }, [renderUrl, renderApiKey, renderServiceId]);

  useEffect(() => {
    refreshDeploy();
    const id = setInterval(refreshDeploy, 30_000);
    return () => clearInterval(id);
  }, [refreshDeploy]);

  const saveRender = () => {
    const url = renderUrlInput.trim();
    const key = renderApiKeyInput.trim();
    const svc = renderServiceIdInput.trim();
    url ? localStorage.setItem(LS_RENDER_URL, url) : localStorage.removeItem(LS_RENDER_URL);
    key ? localStorage.setItem(LS_RENDER_API_KEY, key) : localStorage.removeItem(LS_RENDER_API_KEY);
    svc ? localStorage.setItem(LS_RENDER_SERVICE, svc) : localStorage.removeItem(LS_RENDER_SERVICE);
    setRenderUrl(url);
    setRenderApiKey(key);
    setRenderServiceId(svc);
    toast({ title: "Render config saved" });
  };

  const deployedShort = deployedCommit?.slice(0, 7);
  const mainShort = mainCommit?.sha.slice(0, 7);
  const deployMatches =
    deployedCommit && mainCommit
      ? deployedCommit.startsWith(mainCommit.sha.slice(0, 7)) ||
        mainCommit.sha.startsWith(deployedCommit.slice(0, 7))
      : null;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">GitHub Sync Status</h1>
        <p className="text-muted-foreground mt-1">
          Live view of GitHub <code className="text-xs">main</code> branch and pending Lovable edit branches.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Repository</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="repo">owner/repo (e.g. getpawsy/getpawsy-storefront)</Label>
          <div className="flex gap-2">
            <Input
              id="repo"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="owner/repo"
            />
            <Button onClick={save}>Save</Button>
            <Button variant="outline" onClick={refresh} disabled={!repo || loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          {repo && (
            <p className="text-xs text-muted-foreground">
              Tracking <code>{repo}</code>
              {lastFetched && ` · updated ${lastFetched.toLocaleTimeString()}`}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <GitBranch className="h-4 w-4" /> Working branch → main
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Force future Lovable edits to commit directly to <code>main</code> instead of a separate{" "}
            <code>lovable/...</code> branch. This is a Lovable account setting and must be toggled in the
            Lovable UI — the buttons below jump straight to the right pages.
          </p>
          <ol className="text-sm list-decimal list-inside space-y-1 text-muted-foreground">
            <li>Open Account Settings → Labs and disable "GitHub Branch Switching", or</li>
            <li>Open the chat + menu → GitHub and switch the active branch to <code>main</code>.</li>
          </ol>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild size="sm">
              <a
                href="https://lovable.dev/settings/labs"
                target="_blank"
                rel="noreferrer"
                className="gap-1"
              >
                <Settings className="h-3 w-3" />
                Open Labs settings
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a
                href="https://docs.lovable.dev/integrations/github"
                target="_blank"
                rel="noreferrer"
                className="gap-1"
              >
                GitHub integration docs
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground pt-1">
            Verify success below: when "Pending Lovable branches" stays at 0 after your next save, future
            commits are landing on <code>main</code>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">GitHub token (optional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="token">
            Personal access token with <code>repo</code> scope. Stored only in this browser.
          </Label>
          <div className="flex gap-2">
            <Input
              id="token"
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="ghp_…"
              autoComplete="off"
            />
            <Button onClick={saveToken}>Save</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {token ? "Token set — Merge button will auto-create + merge PR." : "Without a token, Merge opens GitHub's PR page."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Deploy confirmation (Render)</CardTitle>
          <Button variant="outline" size="sm" onClick={refreshDeploy} disabled={deployLoading}>
            <RefreshCw className={`h-4 w-4 ${deployLoading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="renderUrl">
              Worker health URL returning <code>{`{ commit }`}</code> (preferred)
            </Label>
            <Input
              id="renderUrl"
              value={renderUrlInput}
              onChange={(e) => setRenderUrlInput(e.target.value)}
              placeholder="https://your-worker.onrender.com/healthz"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="renderKey">…or Render API key</Label>
              <Input
                id="renderKey"
                type="password"
                value={renderApiKeyInput}
                onChange={(e) => setRenderApiKeyInput(e.target.value)}
                placeholder="rnd_…"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="renderSvc">Render service ID</Label>
              <Input
                id="renderSvc"
                value={renderServiceIdInput}
                onChange={(e) => setRenderServiceIdInput(e.target.value)}
                placeholder="srv-…"
              />
            </div>
          </div>
          <Button onClick={saveRender} size="sm">
            Save Render config
          </Button>

          {deployError && (
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{deployError}</span>
            </div>
          )}

          {deployedCommit && (
            <div className="border rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Render deployed commit</p>
                {deployMatches === true && (
                  <Badge variant="default" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Matches main
                  </Badge>
                )}
                {deployMatches === false && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" /> Behind main
                  </Badge>
                )}
              </div>
              <div className="font-mono text-xs break-all">{deployedCommit}</div>
              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
                {deployStatus && <span>status: {deployStatus}</span>}
                {deployFetchedAt && <span>checked: {deployFetchedAt.toLocaleTimeString()}</span>}
                {mainShort && deployedShort && (
                  <span>
                    deployed <code>{deployedShort}</code> vs main <code>{mainShort}</code>
                  </span>
                )}
              </div>
              {deployMatches === false && (
                <p className="text-xs text-destructive">
                  Render is not on the latest <code>main</code>. Trigger a redeploy in Render or wait for auto-deploy.
                </p>
              )}
            </div>
          )}
          {!deployedCommit && !deployError && (
            <p className="text-xs text-muted-foreground">
              Configure a worker health URL or Render API key + service ID to enable deploy confirmation.
            </p>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Failed to load from GitHub</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {repo && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="h-4 w-4" /> main
            </CardTitle>
            {inSync ? (
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> In sync
              </Badge>
            ) : (
              <Badge variant="destructive">{lovableBranches.length} pending</Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {mainCommit ? (
              <>
                <a
                  href={mainCommit.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-sm underline break-all"
                >
                  {mainCommit.sha}
                </a>
                <p className="text-sm">{mainCommit.commit.message.split("\n")[0]}</p>
                <p className="text-xs text-muted-foreground">
                  {mainCommit.commit.author.name} ·{" "}
                  {new Date(mainCommit.commit.author.date).toLocaleString()}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
          </CardContent>
        </Card>
      )}

      {repo && lovableBranches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending Lovable branches</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {lovableBranches.map((b) => (
              <div
                key={b.name}
                className="flex items-center justify-between border rounded-md p-3"
              >
                <div>
                  <p className="font-medium text-sm">{b.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{b.commit.sha}</p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`https://github.com/${repo}/compare/main...${b.name}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs underline inline-flex items-center gap-1"
                  >
                    Compare <ExternalLink className="h-3 w-3" />
                  </a>
                  <Button
                    size="sm"
                    onClick={() => mergeBranch(b.name)}
                    disabled={merging === b.name}
                    className="gap-1"
                  >
                    <GitMerge className="h-3 w-3" />
                    {merging === b.name ? "Merging…" : token ? "Merge to main" : "Open PR"}
                  </Button>
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground pt-2">
              These branches contain commits not yet on <code>main</code>. Add a token above for one-click merge, or click Open PR.
            </p>
          </CardContent>
        </Card>
      )}

      <SyncAlertsCard />
    </div>
  );
}

type SyncAlert = {
  id: string;
  created_at: string;
  branch: string;
  branch_sha: string;
  main_sha: string;
  ahead_by: number;
  behind_by: number;
  message: string | null;
  resolved: boolean;
};

function SyncAlertsCard() {
  const [alerts, setAlerts] = useState<SyncAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [notifyOn, setNotifyOn] = useState<boolean>(
    () => typeof Notification !== "undefined" && Notification.permission === "granted",
  );

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("github_sync_alerts")
      .select("*")
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error && data) setAlerts(data as SyncAlert[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("github_sync_alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "github_sync_alerts" },
        (payload) => {
          const row = payload.new as SyncAlert;
          setAlerts((prev) => [row, ...prev.filter((a) => a.id !== row.id)]);
          toast({
            title: "GitHub sync alert",
            description: row.message ?? `${row.branch} ahead of main`,
            variant: "destructive",
          });
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
              new Notification("GitHub sync alert", {
                body: row.message ?? `${row.branch} is ${row.ahead_by} commit(s) ahead of main`,
                tag: row.id,
              });
            } catch {
              /* noop */
            }
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "github_sync_alerts" },
        (payload) => {
          const row = payload.new as SyncAlert;
          setAlerts((prev) =>
            row.resolved ? prev.filter((a) => a.id !== row.id) : prev.map((a) => (a.id === row.id ? row : a)),
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  const enableNotifications = async () => {
    if (typeof Notification === "undefined") {
      toast({ title: "Notifications not supported in this browser" });
      return;
    }
    const perm = await Notification.requestPermission();
    setNotifyOn(perm === "granted");
    toast({ title: perm === "granted" ? "Notifications enabled" : "Notifications denied" });
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("github-sync-check", { body: {} });
      if (error) throw error;
      toast({ title: "Check complete", description: (data as { message?: string })?.message ?? "ok" });
      await load();
    } catch (e) {
      toast({ title: "Check failed", description: String((e as Error).message ?? e), variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const resolve = async (id: string) => {
    const { error } = await supabase
      .from("github_sync_alerts")
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast({ title: "Could not resolve", description: error.message, variant: "destructive" });
      return;
    }
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <BellRing className="h-4 w-4" /> Sync alerts (background check)
        </CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={enableNotifications} disabled={notifyOn}>
            {notifyOn ? "Notifications on" : "Enable browser alerts"}
          </Button>
          <Button variant="outline" size="sm" onClick={runNow} disabled={running} className="gap-1">
            <Play className={`h-3 w-3 ${running ? "animate-pulse" : ""}`} />
            {running ? "Checking…" : "Run check now"}
          </Button>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          A background job runs every 15 min and writes an alert here if any edit branch has commits not yet on
          <code> main</code>. New alerts also pop up in this browser.
        </p>
        {alerts.length === 0 && !loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground border rounded-md p-3">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            No open alerts — your edit branches are on main.
          </div>
        )}
        {alerts.map((a) => (
          <div key={a.id} className="flex items-center justify-between border rounded-md p-3">
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{a.branch}</p>
              <p className="text-xs text-muted-foreground">
                {a.ahead_by} ahead · {a.behind_by} behind · {new Date(a.created_at).toLocaleString()}
              </p>
              <p className="font-mono text-xs text-muted-foreground truncate">{a.branch_sha}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => resolve(a.id)}>
              Mark resolved
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
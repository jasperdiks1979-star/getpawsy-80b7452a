import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, GitBranch, CheckCircle2, AlertCircle, GitMerge, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";

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
    </div>
  );
}
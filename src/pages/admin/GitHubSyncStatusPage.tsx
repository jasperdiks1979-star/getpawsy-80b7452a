import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, GitBranch, CheckCircle2, AlertCircle } from "lucide-react";

const LS_KEY = "gp.github.repo";

type Commit = {
  sha: string;
  commit: { message: string; author: { name: string; date: string } };
  html_url: string;
};

type Branch = { name: string; commit: { sha: string } };

export default function GitHubSyncStatusPage() {
  const [repo, setRepo] = useState<string>(() => localStorage.getItem(LS_KEY) || "");
  const [input, setInput] = useState(repo);
  const [mainCommit, setMainCommit] = useState<Commit | null>(null);
  const [lovableBranches, setLovableBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

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
                <a
                  href={`https://github.com/${repo}/compare/main...${b.name}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs underline"
                >
                  Compare → main
                </a>
              </div>
            ))}
            <p className="text-xs text-muted-foreground pt-2">
              These branches contain commits not yet on <code>main</code>. Open a PR on GitHub to merge.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
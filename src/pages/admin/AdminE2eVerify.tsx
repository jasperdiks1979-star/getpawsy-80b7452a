/**
 * AdminE2eVerify — temporary admin-only magic-link login + one-click E2E
 * verification of the Pinterest Ad Studio render pipeline.
 *
 * Remove this file (and routes/edge functions) after verification is done.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const ADMIN_ALLOWLIST = ["jasperdiks@hotmail.com"];
const DEFAULT_PRODUCT = "automatic-cat-litter-box-self-cleaning-app-control";

type Step = {
  name: string;
  status: "ok" | "fail" | "timeout" | "skip";
  ms: number;
  started_at: string;
  finished_at: string;
  detail?: unknown;
};

type Result = {
  ok: boolean;
  traceId: string;
  product_slug?: string;
  job_id?: string;
  preflight_status?: string;
  render_started_at?: string | null;
  render_completed_at?: string | null;
  output_mp4_url?: string | null;
  preview_url?: string;
  publish_enabled?: boolean;
  publish_blockers?: string[];
  steps?: Step[];
  total_ms?: number;
  message?: string;
};

function decodeExp(jwt: string | undefined): number | null {
  if (!jwt) return null;
  try {
    const [, payload] = jwt.split(".");
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp : null;
  } catch { return null; }
}

function formatCountdown(s: number) {
  if (s <= 0) return "expired";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}

export default function AdminE2eVerify() {
  const navigate = useNavigate();
  const { user, session, isAdmin, isLoading } = useAuth();
  const [routeEnabled, setRouteEnabled] = useState<boolean | null>(null);
  const [email, setEmail] = useState(ADMIN_ALLOWLIST[0]);
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [sending, setSending] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [productSlug, setProductSlug] = useState(DEFAULT_PRODUCT);
  const [now, setNow] = useState(Date.now());
  const ranAutoRedirect = useRef(false);
  const ranAutoVerify = useRef(false);

  // Live JWT countdown
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Feature flag check
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "e2e_route_enabled")
        .maybeSingle();
      // RLS hides the row from non-admins → null/undefined = treated as disabled UI
      if (!user) { setRouteEnabled(true); return; } // allow magic-link form
      setRouteEnabled(data?.value === true);
    })();
  }, [user]);

  const exp = useMemo(() => decodeExp(session?.access_token), [session?.access_token]);
  const secondsLeft = exp ? Math.max(0, exp - Math.floor(now / 1000)) : null;

  async function sendMagicLink() {
    if (!ADMIN_ALLOWLIST.includes(email.trim().toLowerCase())) {
      toast.error("Email not on admin allowlist");
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/admin/e2e-verify`,
        },
      });
      if (error) throw error;
      toast.success("Magic link sent. Check your inbox (≤ 1 min).");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send magic link");
    } finally {
      setSending(false);
    }
  }

  async function signInWithPassword() {
    if (!password) { toast.error("Enter your password"); return; }
    setSigningIn(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;
      sessionStorage.setItem("e2e_auto_run", "1");
      toast.success("Signed in.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setSigningIn(false);
    }
  }

  async function runVerification() {
    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-e2e-verify", {
        body: { product_slug: productSlug, hook_variant: "problem_solution" },
      });
      if (error) throw error;
      setResult(data as Result);
      if ((data as Result)?.ok) toast.success("End-to-end verification passed");
      else toast.error((data as Result)?.message ?? "Verification did not complete");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invocation failed");
    } finally {
      setRunning(false);
    }
  }

  // Auto-run verification immediately after a successful admin sign-in
  useEffect(() => {
    if (ranAutoVerify.current) return;
    if (!user || !isAdmin || isLoading) return;
    if (routeEnabled === false) return;
    if (sessionStorage.getItem("e2e_auto_run") !== "1") return;
    ranAutoVerify.current = true;
    sessionStorage.removeItem("e2e_auto_run");
    runVerification();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isAdmin, isLoading, routeEnabled]);

  async function disableRoute() {
    if (!confirm("Disable the magic-link E2E route? Re-enable requires editing the DB.")) return;
    const { error } = await supabase.functions.invoke("cinematic-ad-e2e-verify-disable");
    if (error) { toast.error(error.message); return; }
    toast.success("Route disabled.");
    setRouteEnabled(false);
  }

  // Auto-redirect to studio once verification produced an MP4
  useEffect(() => {
    if (result?.ok && result.preview_url && !ranAutoRedirect.current) {
      ranAutoRedirect.current = true;
      // Surface but do not jump away — leave the link visible
    }
  }, [result]);

  if (isLoading) {
    return <div className="p-10 text-center"><Loader2 className="animate-spin inline-block" /></div>;
  }

  if (routeEnabled === false && user) {
    return (
      <div className="p-10 text-center">
        <h2 className="text-xl font-semibold">Route disabled</h2>
        <p className="text-muted-foreground mt-2">This temporary verification page has been turned off.</p>
      </div>
    );
  }

  // Unauthenticated → magic-link form
  if (!user) {
    return (
      <div className="max-w-md mx-auto p-6 mt-10">
        <Card>
          <CardHeader>
            <CardTitle>Admin magic link</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Temporary admin-only login for Pinterest Ad Studio verification.
              No password required — a one-time login link will be sent to your email.
            </p>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin email"
              autoComplete="email"
            />
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="admin password (instant sign-in)"
              autoComplete="current-password"
              onKeyDown={(e) => { if (e.key === "Enter") signInWithPassword(); }}
            />
            <Button onClick={signInWithPassword} disabled={signingIn} className="w-full">
              {signingIn ? <Loader2 className="animate-spin mr-2" /> : null}
              Sign in with password
            </Button>
            <div className="text-center text-xs text-muted-foreground">— or —</div>
            <Button onClick={sendMagicLink} disabled={sending} className="w-full">
              {sending ? <Loader2 className="animate-spin mr-2" /> : null}
              Send magic link
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Authenticated non-admin
  if (!isAdmin) {
    return (
      <div className="p-10 text-center">
        <h2 className="text-xl font-semibold">Not authorized</h2>
        <p className="text-muted-foreground mt-2">Your account does not have the admin role.</p>
        <Button variant="outline" className="mt-4" onClick={() => supabase.auth.signOut()}>Sign out</Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pinterest Ad Studio — E2E Verification</h1>
        <Button variant="outline" size="sm" onClick={() => navigate("/admin/pinterest-ad-studio")}>
          Open Studio →
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Session</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted-foreground">User:</span> {user.email}</div>
          <div><span className="text-muted-foreground">User ID:</span> <code className="text-xs">{user.id}</code></div>
          <div><span className="text-muted-foreground">Role:</span> <Badge>{isAdmin ? "admin" : "user"}</Badge></div>
          <div>
            <span className="text-muted-foreground">Session:</span>{" "}
            <Badge variant={secondsLeft && secondsLeft > 0 ? "default" : "destructive"}>
              {secondsLeft && secondsLeft > 0 ? "active" : "expired"}
            </Badge>
          </div>
          <div>
            <span className="text-muted-foreground">JWT expires in:</span>{" "}
            <span className="font-mono">{secondsLeft != null ? formatCountdown(secondsLeft) : "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">JWT exp:</span>{" "}
            <span className="font-mono text-xs">{exp ? new Date(exp * 1000).toISOString() : "—"}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Run full E2E verification</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <label className="block text-sm">
            Product slug
            <Input value={productSlug} onChange={(e) => setProductSlug(e.target.value)} className="mt-1" />
          </label>
          <Button onClick={runVerification} disabled={running} size="lg">
            {running ? <Loader2 className="animate-spin mr-2" /> : null}
            Run Full E2E Verification
          </Button>
          <p className="text-xs text-muted-foreground">
            Runs: prepare → preflight → queue → dispatch → claim → render → preview → publish-readiness.
            Polling deadline ≈ 9 minutes.
          </p>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Result {result.ok ? "✅ PASS" : "❌ FAIL"}</span>
              <span className="text-xs text-muted-foreground font-mono">{result.traceId}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">Job ID:</span> <code className="text-xs">{result.job_id ?? "—"}</code></div>
              <div><span className="text-muted-foreground">Preflight:</span> <Badge>{result.preflight_status ?? "—"}</Badge></div>
              <div><span className="text-muted-foreground">Started:</span> <span className="font-mono text-xs">{result.render_started_at ?? "—"}</span></div>
              <div><span className="text-muted-foreground">Completed:</span> <span className="font-mono text-xs">{result.render_completed_at ?? "—"}</span></div>
              <div className="col-span-2"><span className="text-muted-foreground">MP4:</span>{" "}
                {result.output_mp4_url
                  ? <a className="underline break-all text-xs" href={result.output_mp4_url} target="_blank" rel="noreferrer">{result.output_mp4_url}</a>
                  : <span className="text-destructive">none</span>}
              </div>
              <div><span className="text-muted-foreground">Publish:</span>{" "}
                <Badge variant={result.publish_enabled ? "default" : "destructive"}>
                  {result.publish_enabled ? "enabled" : "blocked"}
                </Badge>
              </div>
              <div><span className="text-muted-foreground">Total:</span> {((result.total_ms ?? 0) / 1000).toFixed(1)}s</div>
            </div>

            {result.output_mp4_url && (
              <video src={result.output_mp4_url} controls className="w-full rounded-md max-h-96" />
            )}

            {result.publish_blockers && result.publish_blockers.length > 0 && (
              <div className="text-sm text-destructive">
                Blockers: {result.publish_blockers.join(", ")}
              </div>
            )}

            {result.preview_url && (
              <Button variant="outline" size="sm" onClick={() => navigate(result.preview_url!)}>
                Open in Pinterest Ad Studio
              </Button>
            )}

            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Step trace ({result.steps?.length ?? 0})</summary>
              <table className="w-full mt-2 text-xs">
                <thead><tr className="text-left">
                  <th>Step</th><th>Status</th><th>ms</th><th>Started</th>
                </tr></thead>
                <tbody>
                  {result.steps?.map((s, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-1">{s.name}</td>
                      <td><Badge variant={s.status === "ok" ? "default" : "destructive"}>{s.status}</Badge></td>
                      <td className="font-mono">{s.ms}</td>
                      <td className="font-mono">{s.started_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <pre className="mt-3 max-h-80 overflow-auto bg-muted/30 p-2 rounded">
                {JSON.stringify(result.steps, null, 2)}
              </pre>
            </details>
          </CardContent>
        </Card>
      )}

      <Card className="border-destructive/40">
        <CardHeader><CardTitle className="text-destructive">Teardown</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Disable this temporary route after verification is complete. The page will 404 for everyone.
          </p>
          <Button variant="destructive" onClick={disableRoute}>Disable magic-link route</Button>
        </CardContent>
      </Card>
    </div>
  );
}
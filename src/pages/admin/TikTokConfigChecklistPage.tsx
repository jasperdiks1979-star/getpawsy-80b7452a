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
  Download,
  FileText,
  Bug,
} from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
 * Origins the live probes can target. The selector lets the admin verify
 * each registered TikTok redirect URI without having to physically open the
 * admin from that hostname.
 */
const PROBE_ORIGINS = [
  { value: "https://getpawsy.pet", label: "getpawsy.pet (apex)" },
  { value: "https://getpawsy.lovable.app", label: "getpawsy.lovable.app (preview)" },
] as const;
type ProbeOrigin = (typeof PROBE_ORIGINS)[number]["value"];

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

type CallbackProbeCheck = {
  label: string;
  status: DiagnoseStatus;
  detail: string;
};

type CallbackProbeResult = {
  ok: boolean;
  state: string;
  clientTicket: string;
  matchResponse: {
    ok: boolean;
    stateValid: boolean;
    clientTicketStatus: string;
    redirectUri?: string;
  } | null;
  mismatchResponse: {
    ok: boolean;
    stateValid: boolean;
    clientTicketStatus: string;
  } | null;
  checks: CallbackProbeCheck[];
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
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<RedirectProbeResult | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [callbackProbing, setCallbackProbing] = useState(false);
  const [callbackProbe, setCallbackProbe] = useState<CallbackProbeResult | null>(null);
  const [callbackProbeError, setCallbackProbeError] = useState<string | null>(null);

  // Default the selector to whichever production origin matches the current
  // browser host; fall back to the apex when running from preview/localhost.
  const initialOrigin: ProbeOrigin =
    typeof window !== "undefined" &&
    PROBE_ORIGINS.some((o) => o.value === window.location.origin.replace(/\/$/, ""))
      ? (window.location.origin.replace(/\/$/, "") as ProbeOrigin)
      : "https://getpawsy.pet";
  const [probeOrigin, setProbeOrigin] = useState<ProbeOrigin>(initialOrigin);

  // Timestamps for the most recent successful (or attempted) probe runs.
  // Surfaced in the export so the report carries provenance.
  const [diagnoseRanAt, setDiagnoseRanAt] = useState<string | null>(null);
  const [probeRanAt, setProbeRanAt] = useState<string | null>(null);
  const [callbackProbeRanAt, setCallbackProbeRanAt] = useState<string | null>(null);

  // When true, the live redirect probe is run against an intentionally
  // misconfigured expected URL + allow-list so admins can see what the
  // failure modes look like end-to-end. Pure UI/validation simulation —
  // it never mutates secrets, the backend, or the TikTok app config.
  const [simulating, setSimulating] = useState(false);
  const [lastWasSimulated, setLastWasSimulated] = useState(false);
  // Which misconfig scenario the simulator should pretend is happening.
  // - wrong_path: registered URI exists but the path is different
  //   (e.g. `/auth/tiktok/callback-MISCONFIGURED` instead of `/callback`).
  // - wrong_origin: registered URI is on a completely different host
  //   (e.g. an old preview domain that no longer matches production).
  // - missing_allowlist: the URI generated by the backend is correct,
  //   but the TikTok Developer Portal allow-list is empty / forgotten.
  type SimScenario = "wrong_path" | "wrong_origin" | "missing_allowlist";
  const [simScenario, setSimScenario] = useState<SimScenario>("wrong_path");
  const [lastSimScenario, setLastSimScenario] = useState<SimScenario | null>(null);
  // Opt-in: when enabled, clicking any "Copy fix" button immediately
  // re-runs the live (non-simulated) redirect probe so admins can confirm
  // the change after pasting the URI into the TikTok Developer Portal.
  const [autoRerunOnCopy, setAutoRerunOnCopy] = useState(false);

  const runDiagnose = async () => {
    setRunning(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("tiktok-oauth-diagnose", {
        body: { origin: window.location.origin },
      });
      if (error) throw error;
      setResult(data as DiagnoseResult);
      setDiagnoseRanAt(new Date().toISOString());
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
      setDiagnoseRanAt(new Date().toISOString());
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  };

  /**
   * Live probe: invoke `tiktok-oauth-start`, parse the returned authorize URL,
   * and validate the `redirect_uri` query parameter character-for-character
   * against the expected URL for the current origin. Also verifies scope,
   * response_type, client_key presence and that the start function and the URL
   * agree on the redirect.
   */
  const runRedirectProbe = async (
    originOverride?: ProbeOrigin,
    opts?: { simulateMisconfig?: boolean; scenario?: SimScenario },
  ) => {
    setProbing(true);
    setProbeError(null);
    setProbe(null);
    const simulate = !!opts?.simulateMisconfig;
    const scenario: SimScenario = opts?.scenario ?? simScenario;
    // Clear the "Simulated" badge + destructive callout immediately so a
    // live re-run never visually overlaps with stale simulated results.
    setLastWasSimulated(simulate);
    setLastSimScenario(simulate ? scenario : null);
    if (!simulate) {
      setSimulating(false);
    }
    try {
      const origin = (originOverride ?? probeOrigin).replace(/\/$/, "");
      // In simulation mode, pretend we expected something the backend will
      // not produce. The real backend response is unchanged — we only swap
      // the *expected* value and/or the allow-list to mimic three classic
      // TikTok misconfiguration failure modes.
      let expectedRedirect = `${origin}/auth/tiktok/callback`;
      let allowList: readonly string[] = EXPECTED_REDIRECT_URIS;
      if (simulate) {
        if (scenario === "wrong_path") {
          expectedRedirect = `${origin}/auth/tiktok/callback-MISCONFIGURED`;
          allowList = [`${origin}/auth/tiktok/callback-MISCONFIGURED`];
        } else if (scenario === "wrong_origin") {
          expectedRedirect = "https://old-preview.example.invalid/auth/tiktok/callback";
          allowList = ["https://old-preview.example.invalid/auth/tiktok/callback"];
        } else if (scenario === "missing_allowlist") {
          // Expected URL is still correct, but the registered list is empty
          // — the realistic case where someone forgot to register any URI
          // in the TikTok Developer Portal.
          expectedRedirect = `${origin}/auth/tiktok/callback`;
          allowList = [];
        }
      }

      const { data, error } = await supabase.functions.invoke<{
        ok: boolean;
        authUrl?: string;
        redirectUri?: string;
        error?: string;
      }>("tiktok-oauth-start", {
        body: { origin },
      });

      if (error) throw new Error(error.message || "Failed to invoke tiktok-oauth-start");
      if (!data?.ok || !data.authUrl) {
        throw new Error(data?.error || "tiktok-oauth-start returned no authorize URL");
      }

      const url = new URL(data.authUrl);
      const parsedRedirect = url.searchParams.get("redirect_uri");
      const clientKey = url.searchParams.get("client_key");
      const scope = url.searchParams.get("scope");
      const responseType = url.searchParams.get("response_type");
      const state = url.searchParams.get("state");
      const startReturnedRedirect = data.redirectUri ?? null;

      const checks: RedirectProbeCheck[] = [];

      // 1. Authorize host
      checks.push({
        label: "Authorize host is tiktok.com",
        status: url.hostname === "www.tiktok.com" ? "pass" : "fail",
        detail: `Got https://${url.hostname}${url.pathname}`,
      });

      // 2. redirect_uri present
      if (!parsedRedirect) {
        checks.push({
          label: "redirect_uri present in authorize URL",
          status: "fail",
          detail: "The generated authorize URL has no redirect_uri parameter.",
        });
      } else {
        checks.push({
          label: "redirect_uri present in authorize URL",
          status: "pass",
          detail: parsedRedirect,
        });

        // 3. Exact match vs expected
        checks.push({
          label: "redirect_uri matches expected for current origin",
          status: parsedRedirect === expectedRedirect ? "pass" : "fail",
          detail:
            parsedRedirect === expectedRedirect
              ? `Exact match: ${expectedRedirect}`
              : `Expected ${expectedRedirect}, got ${parsedRedirect}`,
        });

        // 4. Must be in registered list
        const inRegistered = allowList.includes(parsedRedirect);
        checks.push({
          label: "redirect_uri is in the registered allow-list",
          status: inRegistered ? "pass" : "fail",
          detail: inRegistered
            ? "This URL is one of the URIs that must be registered in TikTok."
            : simulate
            ? scenario === "missing_allowlist"
              ? `SIMULATION (missing_allowlist): pretending the TikTok Developer Portal has zero registered redirect URIs. In real life TikTok returns error=invalid_redirect on the very first OAuth attempt — fix by registering ${parsedRedirect} under Login Kit → Redirect URI.`
              : scenario === "wrong_origin"
              ? `SIMULATION (wrong_origin): pretending the only registered URI is on a different host (${allowList.join(", ")}). In real life TikTok returns error=invalid_redirect — fix by registering ${parsedRedirect} for this domain in the TikTok Developer Portal.`
              : `SIMULATION (wrong_path): pretending the only registered URI is ${allowList.join(", ")}. In real life TikTok returns error=invalid_redirect — fix by registering the exact path ${parsedRedirect} in Login Kit → Redirect URI.`
            : `Not in [${EXPECTED_REDIRECT_URIS.join(", ")}]. Add it in the TikTok Developer Portal.`,
        });

        // 5. Start function and URL must agree
        if (startReturnedRedirect) {
          checks.push({
            label: "Start function `redirectUri` matches authorize URL",
            status: startReturnedRedirect === parsedRedirect ? "pass" : "fail",
            detail:
              startReturnedRedirect === parsedRedirect
                ? "Backend metadata agrees with the URL it generated."
                : `Backend reported ${startReturnedRedirect} but URL contains ${parsedRedirect}`,
          });
        }
      }

      // 6. client_key present
      checks.push({
        label: "client_key present",
        status: clientKey ? "pass" : "fail",
        detail: clientKey
          ? `${clientKey.slice(0, 4)}…${clientKey.slice(-4)} (${clientKey.length} chars)`
          : "Missing client_key in the authorize URL.",
      });

      // 7. response_type=code
      checks.push({
        label: "response_type is 'code'",
        status: responseType === "code" ? "pass" : "fail",
        detail: `Got '${responseType ?? ""}'`,
      });

      // 8. Scopes
      const scopes = (scope ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const missing = REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
      checks.push({
        label: "All required scopes requested",
        status: missing.length === 0 ? "pass" : "fail",
        detail:
          missing.length === 0
            ? `OK: ${scopes.join(", ")}`
            : `Missing: ${missing.join(", ")} (got: ${scopes.join(", ") || "none"})`,
      });

      // 9. CSRF state
      checks.push({
        label: "CSRF state generated",
        status: state && state.length >= 16 ? "pass" : "warn",
        detail: state ? `length=${state.length}` : "No state parameter in URL.",
      });

      const ok = checks.every((c) => c.status === "pass" || c.status === "info");

      setProbe({
        ok,
        authUrl: data.authUrl,
        parsedRedirect,
        expectedRedirect,
        clientKey,
        scope,
        state,
        responseType,
        checks,
        startReturnedRedirect,
      });
      setProbeRanAt(new Date().toISOString());

      if (ok) {
        toast.success(
          simulate
            ? "Simulation produced no failures — unexpected, the simulator is broken."
            : "Redirect URI probe passed",
        );
      } else if (simulate) {
        toast.warning(
          `Simulated misconfig (${scenario.replace("_", " ")}) — failures below show what a real broken redirect URI looks like.`,
        );
      } else {
        toast.error("Redirect URI probe found issues");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Probe failed";
      setProbeError(msg);
      setProbeRanAt(new Date().toISOString());
      toast.error(msg);
    } finally {
      setProbing(false);
      setSimulating(false);
    }
  };

  useEffect(() => {
    void runDiagnose();
    void runRedirectProbe(initialOrigin);
    void runCallbackProbe(initialOrigin);
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Re-run both live probes against the selected target origin.
   * Used by the "Re-run for {origin}" button and by the selector's
   * onValueChange handler.
   */
  const rerunProbesForOrigin = (origin: ProbeOrigin) => {
    setProbeOrigin(origin);
    void runRedirectProbe(origin);
    void runCallbackProbe(origin);
  };

  /**
   * Run the redirect probe in "simulated misconfig" mode against the
   * currently selected target origin. Used by the demo button so admins
   * can preview the exact error UI before they hit it for real.
   */
  const runSimulatedMisconfig = () => {
    setSimulating(true);
    void runRedirectProbe(probeOrigin, {
      simulateMisconfig: true,
      scenario: simScenario,
    });
  };

  /**
   * Callback validation probe: runs `tiktok-oauth-start` to mint a fresh
   * state + client_ticket, then calls `tiktok-oauth-callback` twice in
   * `validate_only` mode:
   *  1. With the correct ticket → must return clientTicketStatus=match
   *  2. With a tampered ticket  → must return clientTicketStatus=mismatch
   *
   * Confirms end-to-end that the callback validates state + ticket as we
   * expect, without burning a real TikTok authorization code.
   */
  const runCallbackProbe = async (originOverride?: ProbeOrigin) => {
    setCallbackProbing(true);
    setCallbackProbeError(null);
    setCallbackProbe(null);
    try {
      const origin = (originOverride ?? probeOrigin).replace(/\/$/, "");

      const startRes = await supabase.functions.invoke<{
        ok: boolean;
        authUrl?: string;
        clientTicket?: string;
        state?: string;
        error?: string;
      }>("tiktok-oauth-start", { body: { origin } });
      if (startRes.error) throw new Error(startRes.error.message || "start failed");
      const startData = startRes.data;
      if (!startData?.ok || !startData.state || !startData.clientTicket) {
        throw new Error(startData?.error || "start did not return state/clientTicket");
      }

      const state = startData.state;
      const clientTicket = startData.clientTicket;

      // 1. Match call
      const matchRes = await supabase.functions.invoke<{
        ok: boolean;
        stateValid?: boolean;
        clientTicketStatus?: string;
        redirectUri?: string;
        error?: string;
      }>("tiktok-oauth-callback", {
        body: {
          state,
          client_ticket: clientTicket,
          origin,
          validate_only: true,
          debug: true,
        },
      });
      if (matchRes.error) throw new Error(matchRes.error.message || "callback (match) failed");
      const matchData = matchRes.data ?? null;

      // 2. Mismatch call (tampered ticket)
      const tamperedTicket = clientTicket.split("").reverse().join("") + "X";
      const mismatchRes = await supabase.functions.invoke<{
        ok: boolean;
        stateValid?: boolean;
        clientTicketStatus?: string;
        error?: string;
      }>("tiktok-oauth-callback", {
        body: {
          state,
          client_ticket: tamperedTicket,
          origin,
          validate_only: true,
          debug: true,
        },
      });
      if (mismatchRes.error) {
        throw new Error(mismatchRes.error.message || "callback (mismatch) failed");
      }
      const mismatchData = mismatchRes.data ?? null;

      const checks: CallbackProbeCheck[] = [];

      // State pass
      checks.push({
        label: "State persisted by start and accepted by callback",
        status: matchData?.stateValid ? "pass" : "fail",
        detail: matchData?.stateValid
          ? `State accepted (length=${state.length}).`
          : `Callback rejected the freshly minted state. Status=${matchData?.clientTicketStatus ?? "unknown"}.`,
      });

      // Ticket match
      checks.push({
        label: "client_ticket matches stored value",
        status: matchData?.clientTicketStatus === "match" ? "pass" : "fail",
        detail:
          matchData?.clientTicketStatus === "match"
            ? "Ticket round-tripped exactly."
            : `Expected status=match, got status=${matchData?.clientTicketStatus ?? "unknown"}.`,
      });

      // Ticket mismatch detection
      const detectedMismatch = mismatchData?.clientTicketStatus === "mismatch";
      checks.push({
        label: "Tampered client_ticket is detected as mismatch",
        status: detectedMismatch ? "pass" : "fail",
        detail: detectedMismatch
          ? "Callback correctly flagged the tampered ticket as a mismatch."
          : `Expected status=mismatch on a tampered ticket, got status=${mismatchData?.clientTicketStatus ?? "unknown"}. Tampering may go undetected.`,
      });

      // Redirect URI sanity
      const expectedRedirect = `${origin}/auth/tiktok/callback`;
      checks.push({
        label: "Callback resolved redirect URI for current origin",
        status: matchData?.redirectUri === expectedRedirect ? "pass" : "warn",
        detail:
          matchData?.redirectUri === expectedRedirect
            ? `Resolved: ${matchData.redirectUri}`
            : `Expected ${expectedRedirect}, got ${matchData?.redirectUri ?? "(none)"}.`,
      });

      const ok = checks.every((c) => c.status === "pass");

      setCallbackProbe({
        ok,
        state,
        clientTicket,
        matchResponse: matchData
          ? {
              ok: Boolean(matchData.ok),
              stateValid: Boolean(matchData.stateValid),
              clientTicketStatus: matchData.clientTicketStatus ?? "unknown",
              redirectUri: matchData.redirectUri,
            }
          : null,
        mismatchResponse: mismatchData
          ? {
              ok: Boolean(mismatchData.ok),
              stateValid: Boolean(mismatchData.stateValid),
              clientTicketStatus: mismatchData.clientTicketStatus ?? "unknown",
            }
          : null,
        checks,
      });
      setCallbackProbeRanAt(new Date().toISOString());

      if (ok) {
        toast.success("Callback validation probe passed");
      } else {
        toast.error("Callback validation probe found issues");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Callback probe failed";
      setCallbackProbeError(msg);
      setCallbackProbeRanAt(new Date().toISOString());
      toast.error(msg);
    } finally {
      setCallbackProbing(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  /**
   * Build a single envelope describing every probe outcome on this page.
   * Sensitive values (full client_key, full client_ticket, full state) are
   * truncated so the report can be safely shared in a support ticket.
   */
  const buildReport = () => {
    const truncMid = (s: string | null | undefined, head = 6, tail = 4) =>
      !s ? null : s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;

    return {
      generated_at: new Date().toISOString(),
      origin_under_test: probeOrigin,
      browser_origin: typeof window !== "undefined" ? window.location.origin : null,
      expected_redirect_uris: [...EXPECTED_REDIRECT_URIS],
      required_scopes: [...REQUIRED_SCOPES],
      diagnose: {
        ran_at: diagnoseRanAt,
        error: error,
        ok: result?.ok ?? null,
        summary: result?.summary ?? null,
        elapsed_ms: result?.elapsed_ms ?? null,
        redirect_uri: result?.redirectUri ?? null,
        checks: result?.checks ?? [],
      },
      redirect_probe: {
        ran_at: probeRanAt,
        error: probeError,
        ok: probe?.ok ?? null,
        simulated: lastWasSimulated,
        sim_scenario: lastSimScenario,
        expected_redirect: probe?.expectedRedirect ?? null,
        parsed_redirect: probe?.parsedRedirect ?? null,
        start_returned_redirect: probe?.startReturnedRedirect ?? null,
        client_key_truncated: truncMid(probe?.clientKey),
        client_key_length: probe?.clientKey?.length ?? null,
        scope: probe?.scope ?? null,
        response_type: probe?.responseType ?? null,
        state_length: probe?.state?.length ?? null,
        authorize_url: probe?.authUrl ?? null,
        checks: probe?.checks ?? [],
      },
      callback_probe: {
        ran_at: callbackProbeRanAt,
        error: callbackProbeError,
        ok: callbackProbe?.ok ?? null,
        state_truncated: truncMid(callbackProbe?.state),
        client_ticket_truncated: truncMid(callbackProbe?.clientTicket),
        match_response: callbackProbe?.matchResponse ?? null,
        mismatch_response: callbackProbe?.mismatchResponse ?? null,
        checks: callbackProbe?.checks ?? [],
      },
    };
  };

  /**
   * Render the report envelope as a human-readable plain-text summary so
   * non-technical recipients (e.g. TikTok support) can read it inline.
   */
  const renderReportText = (report: ReturnType<typeof buildReport>) => {
    const lines: string[] = [];
    const push = (s = "") => lines.push(s);
    const statusFor = (ok: boolean | null) =>
      ok === null ? "NOT RUN" : ok ? "PASS" : "FAIL";

    push("TikTok OAuth — Probe Report");
    push("=".repeat(40));
    push(`Generated at        : ${report.generated_at}`);
    push(`Origin under test   : ${report.origin_under_test}`);
    push(`Browser origin      : ${report.browser_origin ?? "(unknown)"}`);
    push(`Expected redirects  : ${report.expected_redirect_uris.join(", ")}`);
    push(`Required scopes     : ${report.required_scopes.join(", ")}`);
    push("");

    // Diagnose
    push(`[1] tiktok-oauth-diagnose ........ ${statusFor(report.diagnose.ok)}`);
    if (report.diagnose.ran_at) push(`    ran_at: ${report.diagnose.ran_at}`);
    if (report.diagnose.summary) push(`    summary: ${report.diagnose.summary}`);
    if (report.diagnose.elapsed_ms != null)
      push(`    elapsed_ms: ${report.diagnose.elapsed_ms}`);
    if (report.diagnose.error) push(`    error: ${report.diagnose.error}`);
    for (const c of report.diagnose.checks) {
      push(`      - [${c.status.toUpperCase()}] ${c.name}: ${c.detail}`);
      if (c.hint) push(`            hint: ${c.hint}`);
    }
    push("");

    // Redirect probe
    push(`[2] Redirect URI probe ............ ${statusFor(report.redirect_probe.ok)}`);
    if (report.redirect_probe.ran_at) push(`    ran_at: ${report.redirect_probe.ran_at}`);
    if (report.redirect_probe.error) push(`    error: ${report.redirect_probe.error}`);
    push(`    expected_redirect: ${report.redirect_probe.expected_redirect ?? "(n/a)"}`);
    push(`    parsed_redirect  : ${report.redirect_probe.parsed_redirect ?? "(n/a)"}`);
    push(`    client_key       : ${report.redirect_probe.client_key_truncated ?? "(n/a)"} (len=${report.redirect_probe.client_key_length ?? "?"})`);
    push(`    scope            : ${report.redirect_probe.scope ?? "(n/a)"}`);
    push(`    response_type    : ${report.redirect_probe.response_type ?? "(n/a)"}`);
    for (const c of report.redirect_probe.checks) {
      push(`      - [${c.status.toUpperCase()}] ${c.label}: ${c.detail}`);
    }
    push("");

    // Callback probe
    push(`[3] Callback validation probe ..... ${statusFor(report.callback_probe.ok)}`);
    if (report.callback_probe.ran_at) push(`    ran_at: ${report.callback_probe.ran_at}`);
    if (report.callback_probe.error) push(`    error: ${report.callback_probe.error}`);
    push(`    state          : ${report.callback_probe.state_truncated ?? "(n/a)"}`);
    push(`    client_ticket  : ${report.callback_probe.client_ticket_truncated ?? "(n/a)"}`);
    if (report.callback_probe.match_response) {
      push(
        `    match call     : stateValid=${report.callback_probe.match_response.stateValid} clientTicketStatus=${report.callback_probe.match_response.clientTicketStatus}`,
      );
    }
    if (report.callback_probe.mismatch_response) {
      push(
        `    mismatch call  : stateValid=${report.callback_probe.mismatch_response.stateValid} clientTicketStatus=${report.callback_probe.mismatch_response.clientTicketStatus}`,
      );
    }
    for (const c of report.callback_probe.checks) {
      push(`      - [${c.status.toUpperCase()}] ${c.label}: ${c.detail}`);
    }
    push("");

    return lines.join("\n");
  };

  const downloadBlob = (filename: string, mime: string, body: string) => {
    const blob = new Blob([body], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke after the click handler returns to give Safari time to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportReport = (format: "json" | "txt") => {
    const report = buildReport();
    const stamp = report.generated_at.replace(/[:.]/g, "-");
    if (format === "json") {
      downloadBlob(
        `tiktok-probe-report-${stamp}.json`,
        "application/json",
        JSON.stringify(report, null, 2),
      );
      toast.success("Probe report exported as JSON");
    } else {
      downloadBlob(
        `tiktok-probe-report-${stamp}.txt`,
        "text/plain;charset=utf-8",
        renderReportText(report),
      );
      toast.success("Probe report exported as text");
    }
  };

  /**
   * Build a focused, troubleshooting-oriented log of the most recent
   * redirect probe. Unlike the full report, this captures the per-check
   * *inputs* (what the check compared) and *outputs* (status + detail)
   * alongside the parsed authorize URL parameters, so a support engineer
   * can replay exactly why the simulator (or a real misconfig) failed.
   *
   * Sensitive values (full client_key, full state) are truncated.
   */
  const buildSimulatedProbeLog = () => {
    const truncMid = (s: string | null | undefined, head = 6, tail = 4) =>
      !s ? null : s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;

    const checksWithIO = (probe?.checks ?? []).map((c, idx) => {
      // Best-effort reconstruction of the inputs each check compared.
      // Kept declarative so the JSON tells the whole story without code.
      const inputs: Record<string, unknown> = {};
      switch (c.label) {
        case "Authorize host is tiktok.com":
          inputs.expected_host = "www.tiktok.com";
          inputs.actual_host = probe?.authUrl ? new URL(probe.authUrl).hostname : null;
          break;
        case "redirect_uri present in authorize URL":
          inputs.parsed_redirect = probe?.parsedRedirect ?? null;
          break;
        case "redirect_uri matches expected for current origin":
          inputs.expected_redirect = probe?.expectedRedirect ?? null;
          inputs.parsed_redirect = probe?.parsedRedirect ?? null;
          break;
        case "redirect_uri is in the registered allow-list":
          inputs.parsed_redirect = probe?.parsedRedirect ?? null;
          inputs.allow_list = lastWasSimulated
            ? "(simulated — see sim_scenario)"
            : [...EXPECTED_REDIRECT_URIS];
          break;
        case "Start function `redirectUri` matches authorize URL":
          inputs.start_returned_redirect = probe?.startReturnedRedirect ?? null;
          inputs.parsed_redirect = probe?.parsedRedirect ?? null;
          break;
        case "client_key present":
          inputs.client_key_truncated = truncMid(probe?.clientKey);
          inputs.client_key_length = probe?.clientKey?.length ?? null;
          break;
        case "response_type is 'code'":
          inputs.expected_response_type = "code";
          inputs.actual_response_type = probe?.responseType ?? null;
          break;
        case "All required scopes requested":
          inputs.required_scopes = [...REQUIRED_SCOPES];
          inputs.requested_scopes = (probe?.scope ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          break;
        case "CSRF state generated":
          inputs.state_length = probe?.state?.length ?? null;
          break;
        default:
          break;
      }
      return {
        index: idx + 1,
        label: c.label,
        inputs,
        outputs: {
          status: c.status,
          detail: c.detail,
        },
      };
    });

    return {
      kind: "simulated_probe_log" as const,
      generated_at: new Date().toISOString(),
      ran_at: probeRanAt,
      origin_under_test: probeOrigin,
      simulated: lastWasSimulated,
      sim_scenario: lastSimScenario,
      probe_error: probeError,
      probe_ok: probe?.ok ?? null,
      authorize_url: probe?.authUrl ?? null,
      parsed: probe
        ? {
            redirect_uri: probe.parsedRedirect,
            expected_redirect_uri: probe.expectedRedirect,
            start_returned_redirect_uri: probe.startReturnedRedirect,
            client_key_truncated: truncMid(probe.clientKey),
            client_key_length: probe.clientKey?.length ?? null,
            scope: probe.scope,
            response_type: probe.responseType,
            state_length: probe.state?.length ?? null,
          }
        : null,
      checks: checksWithIO,
      reference: {
        expected_redirect_uris: [...EXPECTED_REDIRECT_URIS],
        required_scopes: [...REQUIRED_SCOPES],
      },
    };
  };

  const exportSimulatedProbeLog = () => {
    if (!probe && !probeError) {
      toast.error("Run the redirect probe at least once before exporting the log.");
      return;
    }
    const log = buildSimulatedProbeLog();
    const stamp = log.generated_at.replace(/[:.]/g, "-");
    const tag = log.simulated ? `sim-${log.sim_scenario ?? "misconfig"}` : "live";
    downloadBlob(
      `tiktok-probe-log-${tag}-${stamp}.json`,
      "application/json",
      JSON.stringify(log, null, 2),
    );
    toast.success(
      log.simulated
        ? `Simulated probe log (${log.sim_scenario ?? "misconfig"}) exported`
        : "Live probe log exported",
    );
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
          <Button
            onClick={() => exportReport("json")}
            variant="outline"
            size="sm"
            disabled={running || probing || callbackProbing}
          >
            <Download className="h-4 w-4 mr-1" />
            Export probe report (JSON)
          </Button>
          <Button
            onClick={() => exportReport("txt")}
            variant="ghost"
            size="sm"
            disabled={running || probing || callbackProbing}
          >
            <FileText className="h-4 w-4 mr-1" />
            Export as text
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

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-base">
                5. Live redirect URI probe (calls tiktok-oauth-start)
              </CardTitle>
              <div className="flex items-center gap-2">
                {probe && (
                  <StatusBadge status={probe.ok ? "pass" : "fail"} />
                )}
                {lastWasSimulated && (
                  <Badge variant="secondary" className="gap-1 text-[10px]">
                    <Bug className="h-3 w-3" />
                    Simulated{lastSimScenario ? `: ${lastSimScenario.replace("_", " ")}` : ""}
                  </Badge>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    // Defensive: explicitly clear simulated state on a live
                    // re-run so the badge/callout don't linger from a prior
                    // "Simulate misconfig" click.
                    setLastWasSimulated(false);
                    setLastSimScenario(null);
                    setSimulating(false);
                    void runRedirectProbe();
                  }}
                  disabled={probing}
                >
                  {probing ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1" />
                  )}
                  Re-run probe
                </Button>
                <Select
                  value={simScenario}
                  onValueChange={(v) => setSimScenario(v as SimScenario)}
                  disabled={probing}
                >
                  <SelectTrigger
                    className="h-8 text-xs w-[170px]"
                    title="Pick which kind of TikTok redirect URI misconfiguration to simulate."
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wrong_path" className="text-xs">
                      Wrong path
                    </SelectItem>
                    <SelectItem value="wrong_origin" className="text-xs">
                      Wrong origin
                    </SelectItem>
                    <SelectItem value="missing_allowlist" className="text-xs">
                      Missing allow-list
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={runSimulatedMisconfig}
                  disabled={probing}
                  title="Re-run the probe in the selected simulated misconfig scenario so you can preview the exact error UI without touching the real TikTok app."
                >
                  {simulating ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Bug className="h-4 w-4 mr-1" />
                  )}
                  Simulate misconfig
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={exportSimulatedProbeLog}
                  disabled={probing || (!probe && !probeError)}
                  title="Download a JSON of the most recent redirect probe (simulated or live), including parsed redirect_uri and per-check inputs/outputs."
                >
                  <Download className="h-4 w-4 mr-1" />
                  Export probe log
                </Button>
              </div>
            </div>
            <CardDescription className="text-xs">
              Invokes the real <code>tiktok-oauth-start</code> edge function with the current
              origin, parses the returned authorize URL, and verifies the{" "}
              <code>redirect_uri</code>, scopes and client_key match what TikTok expects.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Target origin selector — drives both live probes (5 & 6).
                Lets us prove that getpawsy.pet AND getpawsy.lovable.app
                each generate a redirect_uri that's in the registered list. */}
            <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-2">
              <div className="text-xs font-semibold text-foreground">
                Target origin for live probes
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Select
                  value={probeOrigin}
                  onValueChange={(v) => rerunProbesForOrigin(v as ProbeOrigin)}
                  disabled={probing || callbackProbing}
                >
                  <SelectTrigger className="h-8 text-xs w-[280px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROBE_ORIGINS.map((o) => (
                      <SelectItem key={o.value} value={o.value} className="text-xs">
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => rerunProbesForOrigin(probeOrigin)}
                  disabled={probing || callbackProbing}
                  className="h-8"
                >
                  {(probing || callbackProbing) ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  )}
                  Re-run both probes for this origin
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Sends <code>{`{ origin: "${probeOrigin}" }`}</code> to{" "}
                <code>tiktok-oauth-start</code>, which derives{" "}
                <code>{`${probeOrigin}/auth/tiktok/callback`}</code> as the redirect URI.
                Switch between origins to verify each registered TikTok callback in turn.
              </p>
            </div>

            {/* Open TikTok app settings helper — shows the exact URI to paste
                under Login Kit → Redirect URI for the currently selected
                origin, with a one-click copy and a deep link to the TikTok
                Developer Portal. Helps admins fix simulated/real failures
                without having to remember the exact path. */}
            {(() => {
              const requiredUri = `${probeOrigin}/auth/tiktok/callback`;
              return (
                <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Paste this in TikTok → Login Kit → Redirect URI
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        onClick={() => copy(requiredUri)}
                        title="Copy the exact redirect URI for the currently selected origin."
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy URI
                      </Button>
                      <Button asChild size="sm" className="h-7">
                        <a
                          href="https://developers.tiktok.com/apps"
                          target="_blank"
                          rel="noreferrer"
                          className="gap-1"
                          title="Opens the TikTok Developer Portal — go to your app → Login Kit → Redirect URI and paste the value above."
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open TikTok app settings
                        </a>
                      </Button>
                    </div>
                  </div>
                  <code className="block text-[11px] break-all rounded border border-border/60 bg-background px-2 py-1.5">
                    {requiredUri}
                  </code>
                  <p className="text-[11px] text-muted-foreground">
                    Must match character-for-character (no trailing slash, no extra path
                    segments). Repeat for each origin in the selector above so both{" "}
                    <code>getpawsy.pet</code> and <code>getpawsy.lovable.app</code> work.
                  </p>
                </div>
              );
            })()}

            {probeError && (
              <div className="text-xs text-destructive bg-destructive/5 border border-destructive/30 rounded p-2">
                <strong>Probe failed:</strong> {probeError}
              </div>
            )}
            {probing && !probe && (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Calling tiktok-oauth-start…
              </div>
            )}
            {probe && (
              <>
                {lastWasSimulated && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs space-y-1">
                    <div className="font-semibold text-foreground flex items-center gap-1.5">
                      <Bug className="h-3.5 w-3.5" />
                      Simulated misconfiguration
                      {lastSimScenario && (
                        <span className="text-muted-foreground font-normal">
                          — {lastSimScenario.replace("_", " ")}
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground">
                      {lastSimScenario === "missing_allowlist" ? (
                        <>
                          This run pretended the TikTok Developer Portal has{" "}
                          <strong>zero registered redirect URIs</strong>. The backend still
                          generated the correct URL — only the validator was lied to. In real
                          life TikTok would reject the OAuth attempt with{" "}
                          <code>error=invalid_redirect</code> on the very first try.
                        </>
                      ) : lastSimScenario === "wrong_origin" ? (
                        <>
                          This run pretended the only registered URI lives on a{" "}
                          <strong>different host</strong> (
                          <code>old-preview.example.invalid</code>). Use this to preview what
                          you'd see if you forgot to register a new domain after switching
                          environments.
                        </>
                      ) : (
                        <>
                          This run pretended the only registered URI uses the{" "}
                          <strong>wrong path</strong> (<code>…/callback-MISCONFIGURED</code>
                          ). Use this to preview what a typo in the TikTok Developer Portal
                          would look like end-to-end.
                        </>
                      )}{" "}
                      Backend secrets and TikTok app settings were not touched. Click{" "}
                      <strong>Re-run probe</strong> to return to the real configuration.
                    </p>
                  </div>
                )}
                {/* Simulated-only failure summary: pulls just the failed
                    checks out of the probe so an admin can see the exact
                    things that would break in real life, plus a one-click
                    "copy fix" that yields the redirect URI to register. */}
                {lastWasSimulated && (() => {
                  const failed = probe.checks.filter((c) => c.status === "fail");
                  if (failed.length === 0) return null;
                  const fixUri =
                    probe.parsedRedirect ?? `${probeOrigin}/auth/tiktok/callback`;
                  // Resolve a per-check "what you'd register to make this
                  // exact check pass" URI. Most checks share the same fix
                  // (the parsed redirect_uri), but the wrong_origin scenario
                  // produces a fix that swaps the host so admins can see why
                  // the host part matters separately from the path.
                  const fixForCheck = (label: string): string | null => {
                    switch (label) {
                      case "redirect_uri matches expected for current origin":
                        // The expected URL is what the validator wants to
                        // see — registering it makes the comparison pass.
                        return probe.expectedRedirect ?? fixUri;
                      case "redirect_uri is in the registered allow-list":
                        // Registering the URI the backend actually generated
                        // is what TikTok needs in its Login Kit allow-list.
                        return probe.parsedRedirect ?? fixUri;
                      case "redirect_uri present in authorize URL":
                        // No URL was parsed at all — best we can do is the
                        // canonical URI for the currently selected origin.
                        return `${probeOrigin}/auth/tiktok/callback`;
                      case "Start function `redirectUri` matches authorize URL":
                        // Both backend metadata and URL must agree — the URL
                        // is the source of truth for what TikTok will see.
                        return probe.parsedRedirect ?? fixUri;
                      default:
                        // Non-redirect checks (scopes, response_type, host,
                        // client_key, state) are not fixed by registering a
                        // URI, so we don't offer a copy button for them.
                        return null;
                    }
                  };
                  return (
                    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <Bug className="h-3.5 w-3.5 text-destructive" />
                          {failed.length} simulated check
                          {failed.length === 1 ? "" : "s"} failed
                          {lastSimScenario && (
                            <span className="text-muted-foreground font-normal">
                              — {lastSimScenario.replace("_", " ")}
                            </span>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7"
                          onClick={() => {
                            copy(fixUri);
                            toast.success(
                              `Copied — paste this under TikTok → Login Kit → Redirect URI: ${fixUri}`,
                            );
                          }}
                          title="Copy the exact redirect URI you need to register in the TikTok Developer Portal to make these failed checks pass."
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy fix (all)
                        </Button>
                      </div>
                      <ul className="space-y-1.5 text-[11px]">
                        {failed.map((c, i) => {
                          const checkFix = fixForCheck(c.label);
                          return (
                            <li
                              key={`${c.label}-${i}`}
                              className="rounded border border-destructive/30 bg-background p-2 space-y-1"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="font-semibold text-foreground flex items-center gap-1.5">
                                  <StatusBadge status={c.status} />
                                  {c.label}
                                </div>
                                {checkFix && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-[10px]"
                                    onClick={() => {
                                      copy(checkFix);
                                      toast.success(
                                        `Copied fix for "${c.label}": ${checkFix}`,
                                      );
                                    }}
                                    title={`Copy the redirect URI variation that makes this specific check pass: ${checkFix}`}
                                  >
                                    <Copy className="h-3 w-3 mr-1" />
                                    Copy fix
                                  </Button>
                                )}
                              </div>
                              <div className="text-muted-foreground break-words">
                                {c.detail}
                              </div>
                              {checkFix && (
                                <div className="text-[10px] text-muted-foreground">
                                  Fix URI:{" "}
                                  <code className="break-all">{checkFix}</code>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      <p className="text-[11px] text-muted-foreground">
                        Fix: register{" "}
                        <code className="break-all">{fixUri}</code> in the TikTok
                        Developer Portal under <strong>Login Kit → Redirect URI</strong>,
                        then click <strong>Re-run probe</strong>.
                      </p>
                    </div>
                  );
                })()}
                <div className="grid sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded border border-border/60 bg-muted/30 p-2">
                    <div className="font-semibold text-foreground mb-0.5">
                      Expected redirect_uri
                    </div>
                    <code className="break-all">{probe.expectedRedirect}</code>
                  </div>
                  <div className="rounded border border-border/60 bg-muted/30 p-2">
                    <div className="font-semibold text-foreground mb-0.5">
                      redirect_uri in authorize URL
                    </div>
                    <code className="break-all">{probe.parsedRedirect ?? "(missing)"}</code>
                  </div>
                </div>

                <div className="space-y-2">
                  {probe.checks.map((c, i) => (
                    <div
                      key={`${c.label}-${i}`}
                      className="rounded-md border border-border/60 bg-card p-2.5 space-y-1"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm font-medium text-foreground">{c.label}</div>
                        <StatusBadge status={c.status} />
                      </div>
                      <div className="text-xs text-muted-foreground break-words">
                        {c.detail}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded border border-border/60 bg-muted/20 p-2 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold text-foreground">
                      Generated authorize URL
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copy(probe.authUrl)}
                      className="h-7 px-2"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <code className="text-[10px] break-all block">{probe.authUrl}</code>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-base">
                6. Callback validation debug panel (state + client_ticket)
              </CardTitle>
              <div className="flex items-center gap-2">
                {callbackProbe && (
                  <StatusBadge status={callbackProbe.ok ? "pass" : "fail"} />
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runCallbackProbe()}
                  disabled={callbackProbing}
                >
                  {callbackProbing ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1" />
                  )}
                  Re-run callback probe
                </Button>
              </div>
            </div>
            <CardDescription className="text-xs">
              Mints a fresh state + <code>client_ticket</code> via{" "}
              <code>tiktok-oauth-start</code>, then calls{" "}
              <code>tiktok-oauth-callback</code> in <code>validate_only</code> mode twice — once
              with the correct ticket (must report <strong>match</strong>) and once with a
              tampered ticket (must report <strong>mismatch</strong>). No real TikTok
              authorization code is consumed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {callbackProbeError && (
              <div className="text-xs text-destructive bg-destructive/5 border border-destructive/30 rounded p-2">
                <strong>Callback probe failed:</strong> {callbackProbeError}
              </div>
            )}
            {callbackProbing && !callbackProbe && (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Calling tiktok-oauth-start + tiktok-oauth-callback (validate_only)…
              </div>
            )}
            {callbackProbe && (
              <>
                <div className="grid sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded border border-border/60 bg-muted/30 p-2">
                    <div className="font-semibold text-foreground mb-0.5">
                      Match call (correct ticket)
                    </div>
                    <div>
                      stateValid:{" "}
                      <code>{String(callbackProbe.matchResponse?.stateValid ?? "—")}</code>
                    </div>
                    <div>
                      clientTicketStatus:{" "}
                      <code>{callbackProbe.matchResponse?.clientTicketStatus ?? "—"}</code>
                    </div>
                  </div>
                  <div className="rounded border border-border/60 bg-muted/30 p-2">
                    <div className="font-semibold text-foreground mb-0.5">
                      Mismatch call (tampered ticket)
                    </div>
                    <div>
                      stateValid:{" "}
                      <code>{String(callbackProbe.mismatchResponse?.stateValid ?? "—")}</code>
                    </div>
                    <div>
                      clientTicketStatus:{" "}
                      <code>{callbackProbe.mismatchResponse?.clientTicketStatus ?? "—"}</code>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {callbackProbe.checks.map((c, i) => (
                    <div
                      key={`${c.label}-${i}`}
                      className="rounded-md border border-border/60 bg-card p-2.5 space-y-1"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm font-medium text-foreground">{c.label}</div>
                        <StatusBadge status={c.status} />
                      </div>
                      <div className="text-xs text-muted-foreground break-words">
                        {c.detail}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded border border-border/60 bg-muted/20 p-2 space-y-1">
                  <div className="text-[11px] font-semibold text-foreground">
                    Probe values (truncated)
                  </div>
                  <div className="text-[10px] font-mono break-all">
                    state ={" "}
                    <code>
                      {callbackProbe.state.slice(0, 12)}…{callbackProbe.state.slice(-6)}
                    </code>
                  </div>
                  <div className="text-[10px] font-mono break-all">
                    clientTicket ={" "}
                    <code>
                      {callbackProbe.clientTicket.slice(0, 8)}…
                      {callbackProbe.clientTicket.slice(-4)}
                    </code>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
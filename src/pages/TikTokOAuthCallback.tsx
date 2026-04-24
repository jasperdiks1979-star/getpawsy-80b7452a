import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Bug,
  UserCheck,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Status = "processing" | "success" | "error";
type RecordingChoice = "set_recording" | "keep_current" | "skip";

interface DebugInfo {
  receivedAt?: string;
  hasCode?: boolean;
  hasState?: boolean;
  origin?: string;
  clientTicketProvided?: boolean;
  clientTicketStatus?: "match" | "mismatch" | "missing_stored" | "missing_provided" | "absent";
  stateLookup?: {
    stateValueLength?: number;
    foundInDb?: boolean;
    storedClientTicket?: string | null;
    storedExpiresAt?: string | null;
    storedUserId?: string | null;
  };
  redirectUri?: string;
  validation?: string;
  tokenExchange?: string;
  scopeGranted?: string;
}

/**
 * TikTok OAuth callback page.
 * Receives ?code=&state= from TikTok, forwards to the edge function
 * for token exchange, then redirects back to the admin page.
 */
export default function TikTokOAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("processing");
  const [errorMsg, setErrorMsg] = useState("");
  const [account, setAccount] = useState<{
    openId?: string | null;
    name?: string | null;
    avatar?: string | null;
    redirectTo?: string | null;
  }>({});
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const debugMode = searchParams.get("debug") === "1";
  // Recording-user confirmation state. We deliberately DO NOT auto-redirect
  // on success anymore — the admin must explicitly decide whether the
  // freshly connected account becomes the publishing "Recording User".
  const [currentRecording, setCurrentRecording] = useState<{
    open_id: string;
    label: string | null;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmedChoice, setConfirmedChoice] = useState<RecordingChoice | null>(null);
  // When the upsert fails we keep the failed choice + message around so the
  // admin can retry the *exact same* action without re-running OAuth.
  const [confirmError, setConfirmError] = useState<{
    choice: RecordingChoice;
    message: string;
    attempt: number;
  } | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDesc = searchParams.get("error_description");

    if (error) {
      setStatus("error");
      setErrorMsg(errorDesc || (error === "access_denied" ? "Access was denied." : `OAuth error: ${error}`));
      return;
    }

    if (!code || !state) {
      setStatus("error");
      setErrorMsg("Missing authorization parameters from TikTok.");
      return;
    }

    const exchange = async () => {
      try {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const url = `https://${projectId}.supabase.co/functions/v1/tiktok-oauth-callback`;
        // Pull the client_ticket we stashed before redirect (if any).
        const clientTicket = state ? sessionStorage.getItem(`tiktok_oauth_ticket:${state}`) : null;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            state,
            origin: window.location.origin,
            client_ticket: clientTicket,
            debug: debugMode,
          }),
        });
        const data = await res.json();
        if (data.debug) setDebugInfo(data.debug as DebugInfo);
        // Cleanup the ticket either way — single use.
        if (state) sessionStorage.removeItem(`tiktok_oauth_ticket:${state}`);

        if (data.ok) {
          setStatus("success");
          setAccount({
            openId: data.openId,
            name: data.displayName,
            avatar: data.avatarUrl,
            redirectTo: data.redirectTo,
          });
          // Look up the current recording user (if any) so the admin can see
          // exactly which account would be replaced before they confirm.
          try {
            const { data: recRow } = await supabase
              .from("tiktok_test_users")
              .select("open_id, label")
              .eq("is_recording_user", true)
              .maybeSingle();
            if (recRow) {
              setCurrentRecording({ open_id: recRow.open_id, label: recRow.label });
            }
          } catch {
            // Non-fatal; the confirmation UI still renders, just without the
            // "this would replace X" hint.
          }
        } else {
          setStatus("error");
          setErrorMsg(data.error || "Token exchange failed.");
        }
      } catch (err) {
        setStatus("error");
        setErrorMsg("Network error while completing TikTok authorization.");
      }
    };

    exchange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Apply the admin's recording-user choice, then continue to the admin page.
   *
   * - "set_recording": ensure exactly one row in tiktok_test_users has
   *   is_recording_user = true, and it's this account. We clear the previous
   *   recording row first to satisfy the partial unique index.
   * - "keep_current": ensure a tiktok_test_users row exists for the new
   *   account (so it shows up in the test-users page) but DON'T toggle the
   *   recording flag.
   * - "skip": don't touch tiktok_test_users at all.
   */
  const handleConfirm = async (choice: RecordingChoice, isRetry = false) => {
    if (!account.openId) return;
    setConfirming(true);
    // Reset any previous error banner the moment we kick off a new attempt.
    setConfirmError(null);
    try {
      if (choice !== "skip") {
        if (choice === "set_recording") {
          // Clear any existing recording flag first to avoid the partial
          // unique index conflict (tiktok_test_users_one_recording).
          const { error: clearErr } = await supabase
            .from("tiktok_test_users")
            .update({ is_recording_user: false })
            .eq("is_recording_user", true);
          if (clearErr) throw clearErr;
        }

        const { error: upsertErr } = await supabase
          .from("tiktok_test_users")
          .upsert(
            {
              open_id: account.openId,
              label: account.name ?? null,
              is_recording_user: choice === "set_recording",
            },
            { onConflict: "open_id" },
          );

        if (upsertErr) {
          throw upsertErr;
        }
      }

      setConfirmedChoice(choice);
      toast.success(
        choice === "set_recording"
          ? `@${account.name || account.openId} is now the Recording User`
          : choice === "keep_current"
            ? "Account connected — recording user unchanged"
            : "Account connected — no test-user row created",
      );

      // Brief pause so the toast is visible, then redirect.
      setTimeout(() => {
        navigate(`${account.redirectTo || "/admin/tiktok-automation"}?connected=1`);
      }, 600);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unexpected error applying recording choice";
      // Preserve the failed choice so the inline retry button knows what to
      // re-run. Bump `attempt` so the UI can surface "Attempt N" feedback.
      setConfirmError((prev) => ({
        choice,
        message,
        attempt: (isRetry && prev ? prev.attempt : 0) + 1,
      }));
      toast.error(`Failed to apply choice: ${message}`);
    } finally {
      setConfirming(false);
    }
  };

  const handleRetry = () => {
    if (!confirmError) return;
    void handleConfirm(confirmError.choice, true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-xl w-full text-center space-y-4">
        {status === "processing" && (
          <>
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <div className="text-xl font-semibold">Connecting TikTok…</div>
            <p className="text-muted-foreground text-sm">Exchanging authorization code for access tokens.</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="h-12 w-12 mx-auto text-primary" />
            {account.avatar && (
              <img src={account.avatar} alt={account.name || "TikTok"} className="h-16 w-16 rounded-full mx-auto" />
            )}
            <div className="text-xl font-semibold">
              Connected{account.name ? ` as @${account.name}` : ""}!
            </div>
            <p className="text-muted-foreground text-sm">
              Choose how this account should be used before continuing.
            </p>

            {/* Recording-user confirmation step. */}
            <div className="mt-4 text-left bg-card border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <UserCheck className="h-4 w-4 text-primary" />
                Set as Recording User?
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                The Recording User is the TikTok account the publisher uploads to.
                Only one account can hold this role at a time.
                {currentRecording && currentRecording.open_id !== account.openId && (
                  <>
                    {" "}Currently:{" "}
                    <span className="font-mono">
                      {currentRecording.label
                        ? `@${currentRecording.label}`
                        : currentRecording.open_id.slice(0, 10) + "…"}
                    </span>
                    . Choosing "Set as Recording User" will replace it.
                  </>
                )}
                {currentRecording && currentRecording.open_id === account.openId && (
                  <> This account is already the current Recording User.</>
                )}
                {!currentRecording && (
                  <> No Recording User is set yet — this is the recommended choice.</>
                )}
              </p>

              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => handleConfirm("set_recording")}
                  disabled={confirming || confirmedChoice !== null}
                  className="inline-flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <span className="flex items-center gap-2">
                    {confirming && confirmedChoice === null ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserCheck className="h-4 w-4" />
                    )}
                    Set as Recording User
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleConfirm("keep_current")}
                  disabled={confirming || confirmedChoice !== null}
                  className="inline-flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm border border-border bg-background hover:bg-muted disabled:opacity-50"
                >
                  <span>Just connect — keep current Recording User</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleConfirm("skip")}
                  disabled={confirming || confirmedChoice !== null}
                  className="inline-flex items-center justify-between gap-2 px-3 py-2 rounded-md text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <span>Skip — don't add to test users at all</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>

              {confirmError && !confirmedChoice && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 space-y-2 text-left">
                  <div className="flex items-start gap-2 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold">
                        Couldn't save your choice
                        {confirmError.attempt > 1 && (
                          <span className="font-normal opacity-80">
                            {" "}
                            (attempt {confirmError.attempt})
                          </span>
                        )}
                      </div>
                      <div className="text-xs break-words text-foreground/80">
                        {confirmError.message}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Your TikTok connection is already saved — only the
                        Recording-User update failed. You can retry without
                        redoing OAuth.
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleRetry}
                      disabled={confirming}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {confirming ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      Retry “
                      {confirmError.choice === "set_recording"
                        ? "Set as Recording User"
                        : confirmError.choice === "keep_current"
                          ? "Just connect"
                          : "Skip"}
                      ”
                    </button>
                    <button
                      onClick={() => setConfirmError(null)}
                      disabled={confirming}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-border bg-background hover:bg-muted disabled:opacity-50"
                    >
                      Pick a different option
                    </button>
                    <button
                      onClick={() =>
                        navigate(
                          `${account.redirectTo || "/admin/tiktok-automation"}?connected=1`,
                        )
                      }
                      disabled={confirming}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      Continue without saving
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}

              {confirmedChoice && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Redirecting to TikTok admin…
                </p>
              )}
            </div>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="h-12 w-12 mx-auto text-destructive" />
            <div className="text-xl font-semibold">Connection failed</div>
            <p className="text-muted-foreground text-sm">{errorMsg}</p>
            <button
              onClick={() => navigate("/admin/tiktok-automation")}
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            >
              Back to TikTok Admin
            </button>
          </>
        )}

        {/* Debug report — shown whenever the edge function returned a debug envelope. */}
        {debugInfo && (
          <div className="mt-6 text-left bg-card border rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <Bug className="h-4 w-4" /> Validation report
            </div>
            {debugInfo.clientTicketStatus === "mismatch" && (
              <div className="flex gap-2 items-start text-sm bg-destructive/10 border border-destructive/40 rounded-md p-3 text-destructive">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold">client_ticket mismatch</div>
                  <div className="text-xs opacity-90">
                    The ticket your browser sent doesn't match the one stored when OAuth started. Possible tab-swap or replay.
                  </div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
              <div className="text-muted-foreground">state present</div>
              <div>{String(debugInfo.hasState ?? "—")}</div>
              <div className="text-muted-foreground">state found in DB</div>
              <div>{String(debugInfo.stateLookup?.foundInDb ?? "—")}</div>
              <div className="text-muted-foreground">state expires_at</div>
              <div className="truncate">{debugInfo.stateLookup?.storedExpiresAt || "—"}</div>
              <div className="text-muted-foreground">client_ticket sent</div>
              <div>{String(debugInfo.clientTicketProvided ?? "—")}</div>
              <div className="text-muted-foreground">client_ticket status</div>
              <div className={debugInfo.clientTicketStatus === "match" ? "text-primary" : debugInfo.clientTicketStatus === "mismatch" ? "text-destructive" : ""}>
                {debugInfo.clientTicketStatus || "—"}
              </div>
              <div className="text-muted-foreground">validation</div>
              <div>{debugInfo.validation || "—"}</div>
              <div className="text-muted-foreground">token exchange</div>
              <div>{debugInfo.tokenExchange || "—"}</div>
              <div className="text-muted-foreground">redirect_uri</div>
              <div className="truncate">{debugInfo.redirectUri || "—"}</div>
              <div className="text-muted-foreground">scopes</div>
              <div className="truncate">{debugInfo.scopeGranted || "—"}</div>
            </div>
            {status === "success" && debugMode && (
              <button
                onClick={() => navigate("/admin/tiktok-automation?connected=1")}
                className="w-full mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
              >
                Continue to TikTok Admin
              </button>
            )}
          </div>
        )}

        {!debugMode && status !== "processing" && (
          <p className="text-xs text-muted-foreground mt-4">
            Need details? Re-run with{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded">?debug=1</code> appended to the callback URL.
          </p>
        )}
      </div>
    </div>
  );
}
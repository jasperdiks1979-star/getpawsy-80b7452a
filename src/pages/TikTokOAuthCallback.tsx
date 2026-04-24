import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Bug } from "lucide-react";

type Status = "processing" | "success" | "error";

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
  const [account, setAccount] = useState<{ name?: string | null; avatar?: string | null }>({});
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const debugMode = searchParams.get("debug") === "1";

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
          setAccount({ name: data.displayName, avatar: data.avatarUrl });
          // In debug mode, don't auto-redirect — let the user inspect the report.
          if (!debugMode) {
            setTimeout(() => navigate(`${data.redirectTo || "/admin/tiktok-automation"}?connected=1`), 2000);
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
              {debugMode ? "Debug mode — auto-redirect disabled." : "Redirecting to TikTok admin…"}
            </p>
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
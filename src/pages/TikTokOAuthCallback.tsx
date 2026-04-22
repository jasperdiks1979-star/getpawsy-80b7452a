import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

type Status = "processing" | "success" | "error";

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
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, state, origin: window.location.origin }),
        });
        const data = await res.json();

        if (data.ok) {
          setStatus("success");
          setAccount({ name: data.displayName, avatar: data.avatarUrl });
          setTimeout(() => navigate(`${data.redirectTo || "/admin/tiktok-automation"}?connected=1`), 2000);
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
      <div className="max-w-md w-full text-center space-y-4">
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
            <p className="text-muted-foreground text-sm">Redirecting to TikTok admin…</p>
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
      </div>
    </div>
  );
}
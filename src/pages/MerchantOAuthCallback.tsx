import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

type Status = "processing" | "success" | "error";

export default function MerchantOAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("processing");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      setStatus("error");
      setErrorMsg(error === "access_denied" ? "Access was denied during Google sign-in." : `OAuth error: ${error}`);
      return;
    }

    if (!code || !state) {
      setStatus("error");
      setErrorMsg("Missing authorization parameters from Google.");
      return;
    }

    // Forward code + state to the edge function via POST
    const exchange = async () => {
      try {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const url = `https://${projectId}.supabase.co/functions/v1/merchant-oauth-callback`;

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, state }),
        });

        const data = await res.json();

        if (data.ok) {
          setStatus("success");
          // Auto-navigate to admin page after 2s
          setTimeout(() => navigate("/admin/integrations/merchant?connected=1"), 2000);
        } else {
          setStatus("error");
          setErrorMsg(data.error || "Token exchange failed.");
        }
      } catch (err) {
        setStatus("error");
        setErrorMsg("Network error while completing authorization.");
      }
    };

    exchange();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-4">
        {status === "processing" && (
          <>
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <div className="text-xl font-semibold">Connecting Google Merchant Center…</div>
            <p className="text-muted-foreground text-sm">Please wait while we complete the authorization.</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="h-12 w-12 mx-auto text-primary" />
            <div className="text-xl font-semibold">Connected successfully!</div>
            <p className="text-muted-foreground text-sm">Redirecting to admin panel…</p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="h-12 w-12 mx-auto text-destructive" />
            <div className="text-xl font-semibold">Connection failed</div>
            <p className="text-muted-foreground text-sm">{errorMsg}</p>
            <button
              onClick={() => navigate("/admin/integrations/merchant")}
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            >
              Back to Merchant Settings
            </button>
          </>
        )}
      </div>
    </div>
  );
}

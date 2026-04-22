import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Link as LinkIcon, Loader2, LogOut, AlertTriangle, ShieldCheck, XCircle, Copy } from "lucide-react";
import { toast } from "sonner";

type ConnectedAccount = {
  open_id: string;
  display_name: string | null;
  avatar_url: string | null;
  expires_at: string;
  scope: string | null;
};

/**
 * Redirect URIs that MUST be registered in the TikTok Developer Portal
 * (Login Kit → Redirect URI section). Both apex and lovable.app are supported
 * because admin OAuth can be initiated from either host.
 */
const EXPECTED_REDIRECT_URIS = [
  "https://getpawsy.pet/auth/tiktok/callback",
  "https://getpawsy.lovable.app/auth/tiktok/callback",
] as const;

/**
 * Connect TikTok button for the admin panel.
 * Initiates OAuth via tiktok-oauth-start and shows the connected account.
 */
export function TikTokConnectCard() {
  const [account, setAccount] = useState<ConnectedAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const loadAccount = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tiktok_oauth_tokens")
      .select("open_id, display_name, avatar_url, expires_at, scope")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setAccount(data);
    setLoading(false);
  };

  useEffect(() => {
    loadAccount();
    // Refresh after OAuth roundtrip
    if (new URLSearchParams(window.location.search).get("connected") === "1") {
      toast.success("TikTok connected successfully!");
    }
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("tiktok-oauth-start", {
        body: { origin: window.location.origin },
      });
      if (error) throw error;
      if (!data?.ok || !data?.authUrl) {
        throw new Error(data?.error || "Failed to start OAuth");
      }
      window.location.href = data.authUrl;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start TikTok OAuth");
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!account) return;
    if (!confirm(`Disconnect TikTok account @${account.display_name || account.open_id}?`)) return;
    const { error } = await supabase
      .from("tiktok_oauth_tokens")
      .delete()
      .eq("open_id", account.open_id);
    if (error) {
      toast.error("Failed to disconnect");
    } else {
      toast.success("TikTok disconnected");
      setAccount(null);
    }
  };

  const tokenExpired = account && new Date(account.expires_at).getTime() < Date.now();

  // Validator: which expected URI matches the current browser origin?
  const currentCallback =
    typeof window !== "undefined"
      ? `${window.location.origin.replace(/\/$/, "")}/auth/tiktok/callback`
      : "";
  const currentMatches = EXPECTED_REDIRECT_URIS.includes(
    currentCallback as (typeof EXPECTED_REDIRECT_URIS)[number],
  );

  const copyUri = async (uri: string) => {
    try {
      await navigator.clipboard.writeText(uri);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <LinkIcon className="h-5 w-5" />
          TikTok Account Connection
        </CardTitle>
        <CardDescription>
          Authorize the @getpawsy TikTok account so the publisher can post directly via the Content Posting API.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking connection…
          </div>
        ) : account ? (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              {account.avatar_url ? (
                <img
                  src={account.avatar_url}
                  alt={account.display_name || "TikTok"}
                  className="h-12 w-12 rounded-full"
                />
              ) : (
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-primary" />
                </div>
              )}
              <div>
                <div className="font-semibold flex items-center gap-2">
                  {account.display_name ? `@${account.display_name}` : account.open_id}
                  {tokenExpired ? (
                    <Badge variant="destructive" className="text-[10px]">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Token expired
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  Token expires: {new Date(account.expires_at).toLocaleString()}
                </div>
                {account.scope && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Scopes: {account.scope}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {tokenExpired && (
                <Button size="sm" onClick={handleConnect} disabled={connecting}>
                  {connecting ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <LinkIcon className="h-4 w-4 mr-1" />
                  )}
                  Reconnect
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={handleDisconnect}>
                <LogOut className="h-4 w-4 mr-1" />
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Not connected yet. Click below to log in with the @getpawsy TikTok account and grant publishing access.
            </p>
            <Button onClick={handleConnect} disabled={connecting}>
              {connecting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <LinkIcon className="h-4 w-4 mr-2" />
              )}
              Connect TikTok Account
            </Button>
            <p className="text-xs text-muted-foreground">
              You'll be redirected to TikTok to authorize. Make sure to log in as <strong>@getpawsy</strong>.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
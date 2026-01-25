import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { 
  Webhook, 
  Copy, 
  Check, 
  RefreshCw, 
  Package, 
  TrendingUp, 
  Boxes, 
  AlertCircle,
  ExternalLink,
  Clock,
  Zap,
  Loader2
} from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

interface WebhookLog {
  id: string;
  message_id: string;
  webhook_type: string;
  message_type: string;
  payload: Record<string, unknown>;
  processed: boolean;
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export function CJWebhookManager() {
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();
  
  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cj-webhook`;

  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ["cj-webhook-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cj_webhook_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data || []) as WebhookLog[];
    },
  });

  const registerWebhookMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('cj-register-webhook');
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Webhook registration failed');
      return data;
    },
    onSuccess: () => {
      toast.success("Webhooks succesvol geregistreerd bij CJ Dropshipping!");
      queryClient.invalidateQueries({ queryKey: ["cj-webhook-logs"] });
    },
    onError: (error: Error) => {
      toast.error(`Webhook registratie mislukt: ${error.message}`);
    },
  });

  const stats = {
    total: logs?.length || 0,
    orders: logs?.filter(l => l.webhook_type === "ORDER").length || 0,
    stock: logs?.filter(l => l.webhook_type === "STOCK").length || 0,
    products: logs?.filter(l => l.webhook_type === "PRODUCT" || l.webhook_type === "VARIANT").length || 0,
    failed: logs?.filter(l => l.error_message).length || 0,
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      toast.success("Webhook URL gekopieerd!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Kopiëren mislukt");
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "ORDER":
      case "ORDERSPLIT":
        return <Package className="w-4 h-4" />;
      case "STOCK":
        return <Boxes className="w-4 h-4" />;
      case "PRODUCT":
      case "VARIANT":
        return <TrendingUp className="w-4 h-4" />;
      default:
        return <Webhook className="w-4 h-4" />;
    }
  };

  const getTypeBadgeVariant = (type: string): "default" | "secondary" | "outline" => {
    switch (type) {
      case "ORDER":
      case "ORDERSPLIT":
        return "default";
      case "STOCK":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <div className="space-y-6">
      {/* Setup Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="w-5 h-5" />
            CJ Dropshipping Webhook Configuratie
          </CardTitle>
          <CardDescription>
            Configureer webhooks voor real-time order en tracking updates
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Webhook URL */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Webhook URL</label>
            <div className="flex gap-2">
              <Input 
                value={webhookUrl} 
                readOnly 
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                onClick={handleCopy}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Deze URL wordt automatisch geregistreerd bij CJ Dropshipping
            </p>
          </div>

          {/* Auto Register Button */}
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 space-y-3">
            <h4 className="font-medium flex items-center gap-2 text-green-700 dark:text-green-400">
              <Zap className="w-4 h-4" />
              Automatische Webhook Registratie
            </h4>
            <p className="text-sm text-muted-foreground">
              Klik op de knop hieronder om webhooks automatisch te registreren via de CJ API. 
              Dit configureert ORDER, STOCK, PRODUCT en LOGISTICS events.
            </p>
            <Button 
              onClick={() => registerWebhookMutation.mutate()}
              disabled={registerWebhookMutation.isPending}
              className="w-full"
            >
              {registerWebhookMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Bezig met registreren...
                </>
              ) : (
                <>
                  <Webhook className="w-4 h-4 mr-2" />
                  Webhooks Automatisch Registreren
                </>
              )}
            </Button>
          </div>

          {/* Manual Setup Steps - Alternative */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <h4 className="font-medium flex items-center gap-2">
              <ExternalLink className="w-4 h-4" />
              Alternatief: Handmatige Configuratie via API
            </h4>
            <p className="text-sm text-muted-foreground">
              Als de automatische registratie niet werkt, kun je webhooks handmatig configureren via de CJ API:
            </p>
            <div className="bg-background rounded border p-3">
              <code className="text-xs block overflow-x-auto whitespace-pre">
{`POST https://developers.cjdropshipping.com/api2.0/v1/webhook/set
Header: CJ-Access-Token: [jouw-token]

{
  "order": { "type": "ENABLE", "callbackUrls": ["${webhookUrl}"] },
  "stock": { "type": "ENABLE", "callbackUrls": ["${webhookUrl}"] },
  "product": { "type": "ENABLE", "callbackUrls": ["${webhookUrl}"] },
  "logistics": { "type": "ENABLE", "callbackUrls": ["${webhookUrl}"] }
}`}
              </code>
            </div>
            <p className="text-xs text-muted-foreground">
              Zie{" "}
              <a 
                href="https://developers.cjdropshipping.com/en/api/start/webhook.html" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                CJ Webhook documentatie
              </a>{" "}
              voor meer informatie.
            </p>
          </div>

          {/* Package Alert Settings */}
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4 space-y-3">
            <h4 className="font-medium flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <Package className="w-4 h-4" />
              Stap 2: Package Alert Settings (Optioneel)
            </h4>
            <p className="text-sm text-muted-foreground">
              Voor automatische e-mail notificaties wanneer pakketten bij het CJ warehouse klaarliggen:
            </p>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>Ga naar <strong>Authorization → API → API Key</strong></li>
              <li>Klik op <strong>...</strong> naast je store → <strong>Package Alert Settings</strong></li>
              <li>Vul je <strong>Email</strong> en <strong>App-specific password</strong> in</li>
              <li>Kies <strong>IMAP</strong> als incoming server type</li>
              <li>Vul je <strong>IMAP server</strong> gegevens in (bijv. <code className="bg-background px-1 rounded">imap.gmail.com</code>)</li>
              <li>Vink <strong>SSL</strong> aan en gebruik port <strong>993</strong></li>
              <li>Klik op <strong>Confirm</strong> om op te slaan</li>
            </ol>
            <div className="mt-3 p-3 bg-background rounded border">
              <p className="text-xs text-muted-foreground">
                <strong>💡 Tip:</strong> Voor Gmail, maak een{" "}
                <a 
                  href="https://myaccount.google.com/apppasswords" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  App-specific password
                </a>{" "}
                aan en enable IMAP in je Gmail instellingen.
              </p>
            </div>
          </div>

          {/* Important Notes */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 space-y-2">
            <h4 className="font-medium text-blue-700 dark:text-blue-400 text-sm">
              📋 Belangrijke informatie
            </h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Webhooks worden real-time verwerkt voor order status updates</li>
              <li>• Stock webhooks synchroniseren automatisch variant voorraad</li>
              <li>• Bij fouten wordt automatisch een fallback cron job gebruikt (elke 6 uur)</li>
              <li>• Alle webhook events worden gelogd voor troubleshooting</li>
            </ul>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Totaal</div>
            </div>
            <div className="text-center p-3 bg-blue-500/10 rounded-lg">
              <div className="text-2xl font-bold text-blue-500">{stats.orders}</div>
              <div className="text-xs text-muted-foreground">Orders</div>
            </div>
            <div className="text-center p-3 bg-green-500/10 rounded-lg">
              <div className="text-2xl font-bold text-green-500">{stats.stock}</div>
              <div className="text-xs text-muted-foreground">Stock</div>
            </div>
            <div className="text-center p-3 bg-purple-500/10 rounded-lg">
              <div className="text-2xl font-bold text-purple-500">{stats.products}</div>
              <div className="text-xs text-muted-foreground">Products</div>
            </div>
            <div className="text-center p-3 bg-red-500/10 rounded-lg">
              <div className="text-2xl font-bold text-red-500">{stats.failed}</div>
              <div className="text-xs text-muted-foreground">Errors</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Webhook Logs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Webhook Logs</CardTitle>
            <CardDescription>Recente webhook events van CJ Dropshipping</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Vernieuwen
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : logs && logs.length > 0 ? (
            <div className="space-y-2">
              {logs.map((log) => (
                <div 
                  key={log.id} 
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${
                      log.error_message ? 'bg-red-100 text-red-600' : 'bg-primary/10 text-primary'
                    }`}>
                      {log.error_message ? (
                        <AlertCircle className="w-4 h-4" />
                      ) : (
                        getTypeIcon(log.webhook_type)
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant={getTypeBadgeVariant(log.webhook_type)}>
                          {log.webhook_type}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {log.message_type}
                        </Badge>
                        {log.processed && (
                          <Check className="w-3 h-3 text-green-500" />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                        <Clock className="w-3 h-3" />
                        {format(new Date(log.created_at), "d MMM HH:mm:ss", { locale: nl })}
                        <span className="font-mono text-[10px]">{log.message_id.slice(0, 8)}...</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    {log.webhook_type === "ORDER" && (
                      <div className="text-sm">
                        Order: <span className="font-mono">{(log.payload as { cjOrderId?: string })?.cjOrderId || "-"}</span>
                      </div>
                    )}
                    {log.error_message && (
                      <div className="text-xs text-red-500 max-w-[200px] truncate">
                        {log.error_message}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Webhook className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>Nog geen webhook events ontvangen</p>
              <p className="text-sm mt-1">
                Configureer de webhook URL in je CJ Dropshipping account
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default CJWebhookManager;

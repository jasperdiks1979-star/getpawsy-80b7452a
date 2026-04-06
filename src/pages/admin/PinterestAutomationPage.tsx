import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Wifi, WifiOff, Pin, Zap, RefreshCw, Eye, AlertTriangle, CheckCircle2, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

function invoke(action: string, body: Record<string, unknown> = {}) {
  return supabase.functions.invoke("pinterest-automation", { body: { action, ...body } }).then(({ data, error }) => {
    if (error) throw error;
    if (data && !data.ok && data.error) throw new Error(data.error);
    return data;
  });
}

// ── Connection Panel ──
function ConnectionPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["pinterest-connection"],
    queryFn: () => invoke("get_connection"),
  });
  const conn = data?.connection;
  const isConnected = conn?.status === "connected";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          {isConnected ? <Wifi className="h-5 w-5 text-green-500" /> : <WifiOff className="h-5 w-5 text-muted-foreground" />}
          Pinterest Connection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
        ) : isConnected ? (
          <>
            <div className="flex items-center gap-2">
              <Badge variant="default" className="bg-green-600">Connected</Badge>
              {conn.account_name && <span className="text-sm font-medium">{conn.account_name}</span>}
            </div>
            {conn.last_publish_at && (
              <p className="text-xs text-muted-foreground">Last publish: {new Date(conn.last_publish_at).toLocaleString()}</p>
            )}
            {conn.last_error && (
              <div className="flex items-center gap-1 text-xs text-destructive">
                <AlertTriangle className="h-3 w-3" /> {conn.last_error}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Token expires: {conn.token_expires_at ? new Date(conn.token_expires_at).toLocaleDateString() : "N/A"}
            </p>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect your Pinterest Business account to enable automatic pin publishing.
            </p>
            <Button variant="outline" className="gap-2" disabled>
              <Pin className="h-4 w-4" /> Connect Pinterest
            </Button>
            <p className="text-xs text-muted-foreground">
              Pinterest OAuth integration ready — connect once to enable auto-publishing.
              All pins are generated and queued internally.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Stats Panel ──
function StatsPanel({ stats }: { stats: any }) {
  if (!stats) return null;
  const items = [
    { label: "Active Products", value: stats.totalProducts || 0 },
    { label: "Pinterest Ready", value: stats.readyProducts || 0 },
    { label: "Queued Pins", value: stats.queuedPins || 0 },
    { label: "Posted", value: stats.postedPins || 0 },
    { label: "Failed", value: stats.failedPins || 0 },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {items.map((item) => (
        <Card key={item.label} className="p-3 text-center">
          <p className="text-2xl font-bold">{item.value}</p>
          <p className="text-xs text-muted-foreground">{item.label}</p>
        </Card>
      ))}
    </div>
  );
}

// ── Queue Panel ──
function QueuePanel() {
  const [tab, setTab] = useState("queued");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["pinterest-queue", tab],
    queryFn: () => invoke("get_queue", { status: tab }),
  });

  const queueMut = useMutation({
    mutationFn: (count: number) => invoke("queue_pins", { count }),
    onSuccess: (d) => { toast.success(`${d.queued} pins queued`); qc.invalidateQueries({ queryKey: ["pinterest-queue"] }); qc.invalidateQueries({ queryKey: ["pinterest-dashboard"] }); },
  });

  const retryMut = useMutation({
    mutationFn: () => invoke("retry_failed"),
    onSuccess: () => { toast.success("Failed pins requeued"); qc.invalidateQueries({ queryKey: ["pinterest-queue"] }); },
  });

  const pins = data?.pins || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Pin Queue</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => queueMut.mutate(9)} disabled={queueMut.isPending}>
              {queueMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
              Queue 9 Pins
            </Button>
            {tab === "failed" && (
              <Button size="sm" variant="outline" onClick={() => retryMut.mutate()} disabled={retryMut.isPending}>
                <RefreshCw className="h-3 w-3 mr-1" /> Retry Failed
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="draft">Drafts</TabsTrigger>
            <TabsTrigger value="queued">Queued</TabsTrigger>
            <TabsTrigger value="posted">Posted</TabsTrigger>
            <TabsTrigger value="failed">Failed</TabsTrigger>
          </TabsList>
        </Tabs>
        {isLoading ? (
          <div className="flex items-center gap-2 py-8 justify-center"><Loader2 className="h-5 w-5 animate-spin" /> Loading...</div>
        ) : pins.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No {tab} pins</p>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {pins.map((pin: any) => (
              <div key={pin.id} className="border rounded-lg p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{pin.pin_title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{pin.product_name}</p>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      <Badge variant="outline" className="text-xs">{pin.board_name}</Badge>
                      <Badge variant="secondary" className="text-xs">{pin.hook_group || pin.pin_variant}</Badge>
                      <Badge variant={pin.priority === "high" ? "default" : "secondary"} className="text-xs">{pin.priority}</Badge>
                    </div>
                  </div>
                  {pin.scheduled_at && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(pin.scheduled_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {pin.error_message && (
                  <p className="text-xs text-destructive mt-1">{pin.error_message}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Products Panel ──
function ProductsPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["pinterest-products"],
    queryFn: () => invoke("get_products"),
  });

  const genMut = useMutation({
    mutationFn: (productId: string) => invoke("generate_pins", { productId }),
    onSuccess: (d) => {
      toast.success(`${d.generated} pins generated (${d.category})`);
      qc.invalidateQueries({ queryKey: ["pinterest-products"] });
      qc.invalidateQueries({ queryKey: ["pinterest-dashboard"] });
    },
  });

  const bulkMut = useMutation({
    mutationFn: () => invoke("bulk_generate"),
    onSuccess: (d) => {
      toast.success(`${d.pinsGenerated} pins generated for ${d.products} products`);
      qc.invalidateQueries({ queryKey: ["pinterest-products"] });
      qc.invalidateQueries({ queryKey: ["pinterest-dashboard"] });
    },
  });

  const updateMut = useMutation({
    mutationFn: (args: { productId: string; field: string; value: any }) =>
      invoke("update_product", { productId: args.productId, [args.field]: args.value }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pinterest-products"] }); },
  });

  const products = data?.products || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Products ({products.length})</CardTitle>
          <Button size="sm" onClick={() => bulkMut.mutate()} disabled={bulkMut.isPending}>
            {bulkMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
            Generate All Pins
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 py-8 justify-center"><Loader2 className="h-5 w-5 animate-spin" /> Loading...</div>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {products.map((p: any) => (
              <div key={p.id} className="border rounded-lg p-3 text-sm flex items-center gap-3">
                {p.image_url && (
                  <img src={p.image_url} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{p.name}</p>
                  <div className="flex gap-1 mt-0.5 flex-wrap">
                    {p.pinterest_category && <Badge variant="outline" className="text-xs">{p.pinterest_category}</Badge>}
                    {p.pinterest_status && (
                      <Badge variant={p.pinterest_status === "posted" ? "default" : "secondary"} className="text-xs">
                        {p.pinterest_status}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Select
                    value={p.pinterest_priority || "normal"}
                    onValueChange={(v) => updateMut.mutate({ productId: p.id, field: "pinterest_priority", value: v })}
                  >
                    <SelectTrigger className="w-20 h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                  <Switch
                    checked={p.pinterest_ready && !p.pinterest_disabled}
                    onCheckedChange={(v) => updateMut.mutate({ productId: p.id, field: v ? "pinterest_ready" : "pinterest_disabled", value: v ? true : true })}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => genMut.mutate(p.id)}
                    disabled={genMut.isPending}
                  >
                    <RefreshCw className={`h-3 w-3 ${genMut.isPending ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Board Mappings Panel ──
function BoardsPanel({ boardMappings }: { boardMappings: any[] }) {
  if (!boardMappings?.length) return null;
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Board Mappings</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-3">
          {boardMappings.map((m: any) => (
            <div key={m.id} className="border rounded-lg p-3">
              <p className="font-medium text-sm mb-1">{m.category_key}</p>
              <div className="flex flex-wrap gap-1">
                {(m.board_names || []).map((b: string, i: number) => (
                  <Badge key={i} variant="outline" className="text-xs">{b}</Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ──
export default function PinterestAutomationPage() {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["pinterest-dashboard"],
    queryFn: () => invoke("get_dashboard"),
    refetchInterval: 30000,
  });

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Link to="/admin" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Pin className="h-6 w-6 text-red-500" />
            Pinterest Automation
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Generate, queue, and publish Pinterest pins automatically
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <>
          <StatsPanel stats={dashboard?.stats} />

          <Tabs defaultValue="connection" className="space-y-4">
            <TabsList>
              <TabsTrigger value="connection">Connection</TabsTrigger>
              <TabsTrigger value="queue">Queue</TabsTrigger>
              <TabsTrigger value="products">Products</TabsTrigger>
              <TabsTrigger value="boards">Boards</TabsTrigger>
            </TabsList>

            <TabsContent value="connection"><ConnectionPanel /></TabsContent>
            <TabsContent value="queue"><QueuePanel /></TabsContent>
            <TabsContent value="products"><ProductsPanel /></TabsContent>
            <TabsContent value="boards"><BoardsPanel boardMappings={dashboard?.boardMappings || []} /></TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type DecodedError = {
  http_code: number | null;
  pinterest_code: number | null;
  message: string | null;
  hint: string | null;
};

type Status = {
  secrets: { PINTEREST_CONVERSION_TOKEN: boolean; PINTEREST_AD_ACCOUNT_ID: boolean };
  pinterest_ping: { ok: boolean; status: number; body: string } | null;
  totals: { queued: number; sent: number; failed: number };
  per_event: Record<string, { queued: number; sent: number; failed: number }>;
  response_codes: Record<string, number>;
  recent_errors: { event_name: string; last_error: string; created_at: string; decoded_error: DecodedError }[];
  duplicate_event_ids: number;
  last_sent: { event_name: string; sent_at: string }[];
  readiness_score: number;
  window_hours: number;
};

type LookupResult = {
  event_id: string;
  verdict: "delivered" | "delivered_with_duplicates" | "failed" | "pending" | "not_found";
  delivered: boolean;
  duplicate_inserts: number;
  counts: { total: number; sent: number; failed: number; pending: number };
  first_seen: string | null;
  last_sent_at: string | null;
  next_action: string;
  rows: Array<{
    id: string;
    event_name: string;
    status: string;
    attempts: number;
    sent_at: string | null;
    created_at: string;
    last_error: string | null;
    decoded_error: DecodedError;
  }>;
};

type RecentAtc = {
  total_unique_event_ids: number;
  duplicate_event_ids: number;
  events: Array<{
    event_id: string;
    occurrences: number;
    status: string;
    attempts: number;
    first_seen: string;
    last_sent_at: string | null;
    value: number | null;
    currency: string | null;
    decoded_error: DecodedError;
  }>;
};

const verdictBadge: Record<LookupResult["verdict"], { label: string; cls: string }> = {
  delivered: { label: "Delivered", cls: "bg-emerald-600" },
  delivered_with_duplicates: { label: "Delivered (duplicates)", cls: "bg-amber-600" },
  failed: { label: "Failed", cls: "bg-destructive" },
  pending: { label: "Pending", cls: "bg-blue-600" },
  not_found: { label: "Not found", cls: "bg-zinc-600" },
};

export default function PinterestCapiHealthPage() {
  const [data, setData] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<unknown>(null);
  const [eventIdQuery, setEventIdQuery] = useState("");
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [recent, setRecent] = useState<RecentAtc | null>(null);
  const [recentLoading, setRecentLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke(
        "pinterest-capi-health",
        { body: { action: "status" } },
      );
      if (error) throw error;
      setData((res as { data: Status }).data);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const { data: res, error } = await supabase.functions.invoke(
        "pinterest-capi-health",
        { body: { action: "test" } },
      );
      if (error) throw error;
      setTestResult((res as { data: unknown }).data);
      toast.success("Test event sent — review row status below");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  async function runLookup() {
    const id = eventIdQuery.trim();
    if (id.length < 4) {
      toast.error("Enter a full event_id (min 4 chars)");
      return;
    }
    setLookupLoading(true);
    setLookup(null);
    try {
      const { data: res, error } = await supabase.functions.invoke(
        "pinterest-capi-health",
        { body: { action: "lookup", event_id: id } },
      );
      if (error) throw error;
      setLookup((res as { data: LookupResult }).data);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLookupLoading(false);
    }
  }

  async function loadRecent() {
    setRecentLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke(
        "pinterest-capi-health",
        { body: { action: "recent_atc", limit: 25 } },
      );
      if (error) throw error;
      setRecent((res as { data: RecentAtc }).data);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRecentLoading(false);
    }
  }

  useEffect(() => {
    load();
    loadRecent();
    const t = setInterval(load, 60_000);
    const tr = setInterval(loadRecent, 60_000);
    return () => {
      clearInterval(t);
      clearInterval(tr);
    };
  }, []);

  const secretsOk =
    data?.secrets.PINTEREST_CONVERSION_TOKEN && data?.secrets.PINTEREST_AD_ACCOUNT_ID;
  const pingOk = data?.pinterest_ping?.ok;

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap items-end gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pinterest CAPI Health</h1>
          <p className="text-sm text-muted-foreground">
            Conversion API readiness, queue drainer status, and live test trigger.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
          <Button onClick={runTest} disabled={testing || !secretsOk}>
            {testing ? "Sending…" : "Send test event"}
          </Button>
        </div>
      </header>

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-muted-foreground">Readiness</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {data.readiness_score}/100
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-muted-foreground">Secrets</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <div>
                  TOKEN:{" "}
                  {data.secrets.PINTEREST_CONVERSION_TOKEN ? (
                    <Badge className="bg-emerald-600">set</Badge>
                  ) : (
                    <Badge variant="destructive">missing</Badge>
                  )}
                </div>
                <div>
                  AD_ACCOUNT:{" "}
                  {data.secrets.PINTEREST_AD_ACCOUNT_ID ? (
                    <Badge className="bg-emerald-600">set</Badge>
                  ) : (
                    <Badge variant="destructive">missing</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-muted-foreground">
                  Pinterest API ping
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {data.pinterest_ping ? (
                  <>
                    {pingOk ? (
                      <Badge className="bg-emerald-600">{data.pinterest_ping.status} OK</Badge>
                    ) : (
                      <Badge variant="destructive">{data.pinterest_ping.status} fail</Badge>
                    )}
                    <div className="text-xs text-muted-foreground mt-2 truncate">
                      {data.pinterest_ping.body}
                    </div>
                  </>
                ) : (
                  <Badge variant="secondary">no secrets</Badge>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-muted-foreground">
                  Queue (24h)
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <div>Queued: <b>{data.totals.queued}</b></div>
                <div>Sent: <b className="text-emerald-600">{data.totals.sent}</b></div>
                <div>Failed: <b className="text-destructive">{data.totals.failed}</b></div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Per event</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">Event</th>
                    <th className="text-right py-2 px-2">Queued</th>
                    <th className="text-right py-2 px-2">Sent</th>
                    <th className="text-right py-2 px-2">Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.per_event).map(([name, v]) => (
                    <tr key={name} className="border-b">
                      <td className="py-1.5 px-2 font-medium">{name}</td>
                      <td className="text-right">{v.queued}</td>
                      <td className="text-right text-emerald-600">{v.sent}</td>
                      <td className="text-right text-destructive">{v.failed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Pinterest response codes</CardTitle></CardHeader>
              <CardContent className="text-sm">
                {Object.keys(data.response_codes).length === 0 ? (
                  <div className="text-muted-foreground">No errors recorded.</div>
                ) : (
                  <ul className="space-y-1">
                    {Object.entries(data.response_codes).map(([code, n]) => (
                      <li key={code}>
                        <Badge variant="outline">{code}</Badge>{" "}
                        <span className="text-muted-foreground">×{n}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Last sent events</CardTitle></CardHeader>
              <CardContent className="text-sm">
                {data.last_sent.length === 0 ? (
                  <div className="text-muted-foreground">None yet.</div>
                ) : (
                  <ul className="space-y-1">
                    {data.last_sent.map((r, i) => (
                      <li key={i}>
                        <b>{r.event_name}</b>{" "}
                        <span className="text-muted-foreground">
                          {new Date(r.sent_at).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {data.recent_errors.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Recent errors</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2 text-xs">
                  {data.recent_errors.map((e, i) => (
                    <li key={i} className="border-b pb-2">
                      <div><b>{e.event_name}</b> · {new Date(e.created_at).toLocaleString()}</div>
                      <code className="text-destructive break-all">{e.last_error}</code>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {testResult !== null && (
            <Card>
              <CardHeader><CardTitle>Last test result</CardTitle></CardHeader>
              <CardContent>
                <pre className="text-xs overflow-x-auto bg-muted p-3 rounded">
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
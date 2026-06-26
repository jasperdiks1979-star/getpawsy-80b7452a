import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

type DeployEvent = {
  id: string;
  event_type: string;
  status: string | null;
  object_key: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
};

const STATUS_VARIANT: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
  deploy_succeeded: "default",
  deploy_started: "secondary",
  deploy_failed: "destructive",
  s3_put_failure: "destructive",
};

export default function DeployStatusPage() {
  const [events, setEvents] = useState<DeployEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("deploy_events")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(200);
    if (error) setError(error.message);
    else setEvents((data ?? []) as DeployEvent[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const latestDeploy = events.find((e) => e.event_type.startsWith("deploy_"));
  const s3Failures = events.filter((e) => e.event_type === "s3_put_failure");

  return (
    <div className="container mx-auto max-w-6xl py-8 space-y-6">
      <Helmet>
        <title>Deploy Status — Admin</title>
        <meta name="description" content="Latest deploy status and S3 upload failure log." />
      </Helmet>

      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Deploy Status</h1>
          <p className="text-sm text-muted-foreground">
            Latest deploy outcome and recorded S3 PutObject failures.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Latest Deploy</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-16 w-full" />
          ) : latestDeploy ? (
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={STATUS_VARIANT[latestDeploy.event_type] ?? "outline"}>
                {latestDeploy.event_type}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {new Date(latestDeploy.occurred_at).toLocaleString()}
              </span>
              {latestDeploy.status && (
                <span className="text-sm">{latestDeploy.status}</span>
              )}
              {latestDeploy.error_message && (
                <p className="w-full text-sm text-destructive">{latestDeploy.error_message}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No deploy events recorded yet. Lovable's managed deploy pipeline does not
              push status into this database automatically — events must be logged via
              a webhook or CI step that inserts into <code>deploy_events</code>.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>S3 PutObject Failures ({s3Failures.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : s3Failures.length === 0 ? (
            <p className="text-sm text-muted-foreground">No S3 failures recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Timestamp</TableHead>
                  <TableHead>Object Key</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s3Failures.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs">
                      {new Date(e.occurred_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-xs break-all">
                      {e.object_key ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-destructive">
                      {e.error_message ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
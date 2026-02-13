import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ShieldCheck, ShieldAlert, Key, Clock, AlertTriangle, CheckCircle2,
  RotateCcw, Eye, ChevronDown, ChevronUp, Info, Activity, Zap,
  RefreshCw, XCircle, HeartPulse, DollarSign, Shield
} from "lucide-react";
import { useServiceAccountKeys } from "@/hooks/useServiceAccountKeys";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";

const statusConfig: Record<string, { color: string; icon: typeof CheckCircle2; label: string }> = {
  healthy: { color: "bg-green-100 text-green-700", icon: CheckCircle2, label: "Healthy" },
  warning: { color: "bg-yellow-100 text-yellow-700", icon: AlertTriangle, label: "Warning" },
  critical: { color: "bg-red-100 text-red-700", icon: ShieldAlert, label: "Critical" },
  rotating: { color: "bg-blue-100 text-blue-700", icon: RotateCcw, label: "Rotating" },
  failing: { color: "bg-red-100 text-red-700", icon: XCircle, label: "Failing" },
  unknown: { color: "bg-muted text-muted-foreground", icon: Info, label: "Unknown" },
};

const actionLabels: Record<string, string> = {
  created: "New key created",
  validated: "Key validated",
  revoked: "Old key revoked",
  rotation_started: "Rotation started",
  rotation_completed: "Rotation completed",
  rotation_failed: "Rotation failed",
};

function RiskMeter({ score }: { score: number }) {
  const color = score >= 70 ? "bg-red-500" : score >= 40 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-mono">{score}/100</span>
    </div>
  );
}

export default function SecurityCredentialsDashboard() {
  const {
    keys, logs, anomalies, activeAnomalies, healthChecks,
    isLoading, stats, logRotationEvent, updateKeyStatus,
    runHealthCheck, resolveAnomaly,
  } = useServiceAccountKeys();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const handleStartRotation = async (key: (typeof keys)[0]) => {
    try {
      await updateKeyStatus.mutateAsync({ id: key.id, rotation_status: "rotating" });
      await logRotationEvent.mutateAsync({
        service_account_key_id: key.id,
        account_name: key.account_name,
        action: "rotation_started",
        old_key_id: key.key_id || undefined,
        details: { reason: "Manual rotation initiated", key_age_days: key.ageDays },
      });
      toast.info("Rotation started — follow the guided steps to complete.");
    } catch {
      toast.error("Failed to start rotation");
    }
  };

  const handleCompleteRotation = async (key: (typeof keys)[0]) => {
    try {
      const now = new Date().toISOString();
      await updateKeyStatus.mutateAsync({
        id: key.id,
        rotation_status: "healthy",
        key_created_at: now,
        last_rotated_at: now,
      });
      await logRotationEvent.mutateAsync({
        service_account_key_id: key.id,
        account_name: key.account_name,
        action: "rotation_completed",
        old_key_id: key.key_id || undefined,
        details: { completed_at: now },
      });
    } catch {
      toast.error("Failed to complete rotation");
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" /> Security Control Center
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automated credential monitoring, anomaly detection &amp; self-healing
          </p>
        </div>
        <Button
          onClick={() => runHealthCheck.mutate()}
          disabled={runHealthCheck.isPending}
          size="sm"
          variant="outline"
          className="gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${runHealthCheck.isPending ? "animate-spin" : ""}`} />
          {runHealthCheck.isPending ? "Checking..." : "Run Health Check"}
        </Button>
      </div>

      {/* Recovery Mode Banner */}
      {stats.inRecovery > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <HeartPulse className="h-5 w-5 text-red-600" />
          <div>
            <p className="font-medium text-red-800">Recovery Mode Active</p>
            <p className="text-sm text-red-600">
              {stats.inRecovery} service account(s) in auto-recovery. System is attempting re-authentication.
            </p>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Key className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Active Keys</p>
            <p className="text-2xl font-bold">{stats.active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-green-500" />
            <p className="text-xs text-muted-foreground">Healthy</p>
            <p className="text-2xl font-bold text-green-600">{stats.healthy}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-yellow-500" />
            <p className="text-xs text-muted-foreground">Warnings</p>
            <p className="text-2xl font-bold text-yellow-600">{stats.warning + stats.critical}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Activity className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Risk Score</p>
            <RiskMeter score={stats.avgRiskScore} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Zap className="h-5 w-5 mx-auto mb-1 text-red-500" />
            <p className="text-xs text-muted-foreground">Active Anomalies</p>
            <p className="text-2xl font-bold text-red-600">{stats.activeAnomalies}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="accounts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="accounts">Service Accounts</TabsTrigger>
          <TabsTrigger value="anomalies" className="gap-1">
            Anomalies
            {activeAnomalies.length > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 ml-1">{activeAnomalies.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="health">Health Checks</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
          <TabsTrigger value="policy">Policy &amp; Billing</TabsTrigger>
        </TabsList>

        {/* Service Accounts Tab */}
        <TabsContent value="accounts" className="space-y-3">
          {keys.map((key) => {
            const healthCfg = statusConfig[key.health_check_status] || statusConfig.unknown;
            const ageCfg = statusConfig[key.computedStatus || "healthy"];
            const HealthIcon = healthCfg.icon;
            const isExpanded = expandedKey === key.id;
            const isRotating = key.rotation_status === "rotating";

            return (
              <Card key={key.id} className={key.recovery_mode ? "border-red-300 bg-red-50/30" : ""}>
                <div
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedKey(isExpanded ? null : key.id)}
                >
                  <div className="flex items-center gap-3">
                    <Key className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{key.account_name}</p>
                        {key.recovery_mode && (
                          <Badge variant="destructive" className="text-[10px] gap-0.5">
                            <HeartPulse className="h-3 w-3" /> Recovery
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{key.account_email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <RiskMeter score={key.risk_score} />
                    <div className="flex items-center gap-1.5 mr-2">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{key.ageDays}d</span>
                    </div>
                    <Badge className={`${ageCfg.color} text-xs`}>{ageCfg.label}</Badge>
                    <Badge className={`${healthCfg.color} text-xs gap-0.5`}>
                      <HealthIcon className="h-3 w-3" />
                      {healthCfg.label}
                    </Badge>
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>

                {isExpanded && (
                  <CardContent className="border-t pt-4 space-y-4 bg-muted/10">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Service</p>
                        <p className="font-medium">{key.service_description || "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Key Created</p>
                        <p className="font-medium">{format(new Date(key.key_created_at), "MMM d, yyyy")}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Last Rotated</p>
                        <p className="font-medium">
                          {key.last_rotated_at
                            ? formatDistanceToNow(new Date(key.last_rotated_at), { addSuffix: true })
                            : "Never"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Last Health Check</p>
                        <p className="font-medium">
                          {key.last_health_check_at
                            ? formatDistanceToNow(new Date(key.last_health_check_at), { addSuffix: true })
                            : "Never"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Consecutive Failures</p>
                        <p className={`font-medium ${key.consecutive_failures > 0 ? "text-red-600" : ""}`}>
                          {key.consecutive_failures}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-muted-foreground text-xs mb-1">IAM Roles</p>
                      <div className="flex flex-wrap gap-1">
                        {key.iam_roles.map((r) => {
                          const isRisky = r.includes("owner") || r.includes("editor");
                          return (
                            <Badge
                              key={r}
                              variant={isRisky ? "destructive" : "outline"}
                              className="text-xs"
                            >
                              {isRisky && <ShieldAlert className="h-3 w-3 mr-0.5" />}
                              {r}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>

                    {key.iam_roles.some((r) => r.includes("owner") || r.includes("editor")) && (
                      <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700 flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 shrink-0" />
                        <span>⚠️ Over-privileged! Remove Owner/Editor roles — apply least-privilege scopes only.</span>
                      </div>
                    )}

                    <div className="flex gap-2">
                      {isRotating ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="default" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Complete Rotation
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Complete Key Rotation?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Confirm: (1) new key created in GCP, (2) secret updated in Lovable Cloud,
                                (3) API connectivity validated, (4) old key revoked in GCP.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleCompleteRotation(key)}>
                                Confirm
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="outline" className="gap-1">
                              <RotateCcw className="h-3 w-3" /> Start Rotation
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Start Key Rotation?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Safe rotation sequence:
                                <br />1. Create new key in GCP Console
                                <br />2. Update the secret in Lovable Cloud
                                <br />3. Run health check to validate
                                <br />4. Revoke old key in GCP
                                <br />5. Mark rotation complete
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleStartRotation(key)}>Start</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          runHealthCheck.mutate();
                        }}
                        disabled={runHealthCheck.isPending}
                      >
                        <HeartPulse className="h-3 w-3" /> Test Now
                      </Button>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </TabsContent>

        {/* Anomalies Tab */}
        <TabsContent value="anomalies">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4" /> Anomaly Events
              </CardTitle>
              <CardDescription>Security anomalies detected by the monitoring engine</CardDescription>
            </CardHeader>
            <CardContent>
              {anomalies.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No anomaly events detected.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {anomalies.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(a.created_at), "MMM d HH:mm")}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`text-xs ${
                              a.severity === "critical" ? "bg-red-100 text-red-700" :
                              a.severity === "warning" ? "bg-yellow-100 text-yellow-700" :
                              "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {a.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{a.event_type.replace(/_/g, " ")}</TableCell>
                        <TableCell className="text-sm max-w-xs truncate">{a.description}</TableCell>
                        <TableCell>
                          {a.resolved ? (
                            <Badge variant="outline" className="text-xs text-green-600">Resolved</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">Active</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {!a.resolved && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => resolveAnomaly.mutate(a.id)}
                              className="text-xs"
                            >
                              Resolve
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Health Checks Tab */}
        <TabsContent value="health">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <HeartPulse className="h-4 w-4" /> Health Check History
              </CardTitle>
              <CardDescription>API connectivity validation results</CardDescription>
            </CardHeader>
            <CardContent>
              {healthChecks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No health checks run yet. Click "Run Health Check" to start.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Response Time</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {healthChecks.map((hc) => (
                      <TableRow key={hc.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(hc.created_at), "MMM d HH:mm")}
                        </TableCell>
                        <TableCell className="text-sm">{hc.check_type}</TableCell>
                        <TableCell>
                          {hc.status === "pass" ? (
                            <Badge className="bg-green-100 text-green-700 text-xs gap-0.5">
                              <CheckCircle2 className="h-3 w-3" /> Pass
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs gap-0.5">
                              <XCircle className="h-3 w-3" /> Fail
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-mono">
                          {hc.response_time_ms ? `${hc.response_time_ms}ms` : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-red-600 max-w-xs truncate">
                          {hc.error_message || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Log Tab */}
        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4" /> Rotation Audit Log
              </CardTitle>
              <CardDescription>All key lifecycle events — 30-day retention</CardDescription>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No events yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(log.created_at), "MMM d, yyyy HH:mm")}
                        </TableCell>
                        <TableCell className="text-sm">{log.account_name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {actionLabels[log.action] || log.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {log.performed_by || "system"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Policy & Billing Tab */}
        <TabsContent value="policy" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Info className="h-4 w-4" /> Rotation Policy
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1.5 text-muted-foreground">
              <p>• Auto-rotate at <span className="text-yellow-600 font-medium">75 days</span></p>
              <p>• Force-rotate at <span className="text-red-600 font-medium">90 days</span></p>
              <p>• Immediate rotation on credential failure (3 consecutive failures)</p>
              <p>• Max 2 active keys during rotation window</p>
              <p>• Old key only revoked after new key validated</p>
              <p>• 30-day audit log retention</p>
              <p>• Health checks run every 12 hours automatically</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Billing &amp; Security Contacts
              </CardTitle>
              <CardDescription>Per-account billing and alert configuration status</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Billing Alert</TableHead>
                    <TableHead>Budget Alert</TableHead>
                    <TableHead>Essential Contacts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell className="text-sm font-medium">{key.account_name}</TableCell>
                      <TableCell>
                        <Badge
                          className={`text-xs cursor-pointer ${
                            key.billing_alert_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          }`}
                          onClick={() =>
                            updateKeyStatus.mutate({
                              id: key.id,
                              billing_alert_active: !key.billing_alert_active,
                            })
                          }
                        >
                          {key.billing_alert_active ? "Active" : "Not Set"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-xs cursor-pointer ${
                            key.budget_alert_configured ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          }`}
                          onClick={() =>
                            updateKeyStatus.mutate({
                              id: key.id,
                              budget_alert_configured: !key.budget_alert_configured,
                            })
                          }
                        >
                          {key.budget_alert_configured ? "Configured" : "Missing"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-xs cursor-pointer ${
                            key.essential_contacts_configured ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          }`}
                          onClick={() =>
                            updateKeyStatus.mutate({
                              id: key.id,
                              essential_contacts_configured: !key.essential_contacts_configured,
                            })
                          }
                        >
                          {key.essential_contacts_configured ? "Set" : "Missing"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

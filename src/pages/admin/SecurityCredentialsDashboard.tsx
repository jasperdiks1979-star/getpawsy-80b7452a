import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShieldCheck, ShieldAlert, Key, Clock, AlertTriangle, CheckCircle2,
  RotateCcw, Eye, ChevronDown, ChevronUp, Info
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

const statusConfig = {
  healthy: { color: "bg-green-100 text-green-700", icon: CheckCircle2, label: "Healthy" },
  warning: { color: "bg-yellow-100 text-yellow-700", icon: AlertTriangle, label: "Warning" },
  critical: { color: "bg-red-100 text-red-700", icon: ShieldAlert, label: "Critical" },
  rotating: { color: "bg-blue-100 text-blue-700", icon: RotateCcw, label: "Rotating" },
};

const actionLabels: Record<string, string> = {
  created: "New key created",
  validated: "Key validated",
  revoked: "Old key revoked",
  rotation_started: "Rotation started",
  rotation_completed: "Rotation completed",
  rotation_failed: "Rotation failed",
};

export default function SecurityCredentialsDashboard() {
  const { keys, logs, isLoading, stats, logRotationEvent, updateKeyStatus } = useServiceAccountKeys();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const handleStartRotation = async (key: (typeof keys)[0]) => {
    try {
      await updateKeyStatus.mutateAsync({
        id: key.id,
        rotation_status: "rotating",
      });
      await logRotationEvent.mutateAsync({
        service_account_key_id: key.id,
        account_name: key.account_name,
        action: "rotation_started",
        old_key_id: key.key_id || undefined,
        details: { reason: "Manual rotation initiated", key_age_days: key.ageDays },
      });
      toast.info(
        "Rotation started. Follow these steps:\n1. Create new key in GCP Console\n2. Update the secret in Lovable Cloud\n3. Validate connectivity\n4. Mark rotation complete"
      );
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
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6" /> Security &amp; Credentials
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Service account key rotation status and audit log
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">Active Keys</p>
            <p className="text-3xl font-bold">{stats.active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="h-5 w-5 text-green-500 mx-auto mb-1" />
            <p className="text-sm text-muted-foreground">Healthy</p>
            <p className="text-3xl font-bold text-green-600">{stats.healthy}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-5 w-5 text-yellow-500 mx-auto mb-1" />
            <p className="text-sm text-muted-foreground">Warning (60-90d)</p>
            <p className="text-3xl font-bold text-yellow-600">{stats.warning}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <ShieldAlert className="h-5 w-5 text-red-500 mx-auto mb-1" />
            <p className="text-sm text-muted-foreground">Critical (&gt;90d)</p>
            <p className="text-3xl font-bold text-red-600">{stats.critical}</p>
          </CardContent>
        </Card>
      </div>

      {/* Rotation Policy */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4" /> Rotation Policy
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1 text-muted-foreground">
          <p>• Keys are <span className="text-green-600 font-medium">green</span> for the first 60 days</p>
          <p>• Warning at <span className="text-yellow-600 font-medium">60–90 days</span> — rotation recommended</p>
          <p>• <span className="text-red-600 font-medium">Mandatory rotation</span> at 90 days</p>
          <p>• Max 1 active key per service account after rotation</p>
          <p>• Never delete old key before new key is validated</p>
        </CardContent>
      </Card>

      {/* Service Account Keys */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Service Accounts</CardTitle>
          <CardDescription>All tracked GCP service account credentials</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {keys.map((key) => {
            const cfg = statusConfig[key.computedStatus as keyof typeof statusConfig] || statusConfig.healthy;
            const StatusIcon = cfg.icon;
            const isExpanded = expandedKey === key.id;
            const isRotating = key.rotation_status === "rotating";

            return (
              <div key={key.id} className="border rounded-lg">
                <div
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedKey(isExpanded ? null : key.id)}
                >
                  <div className="flex items-center gap-3">
                    <Key className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{key.account_name}</p>
                      <p className="text-xs text-muted-foreground">{key.account_email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right mr-2">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{key.ageDays} days old</span>
                      </div>
                    </div>
                    <Badge className={`${cfg.color} text-xs gap-1`}>
                      <StatusIcon className="h-3 w-3" />
                      {isRotating ? "Rotating" : cfg.label}
                    </Badge>
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t p-4 space-y-4 bg-muted/10">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
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
                        <p className="text-muted-foreground text-xs">IAM Roles</p>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {key.iam_roles.map((r) => (
                            <Badge key={r} variant="outline" className="text-xs">{r}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Least-privilege check */}
                    {key.iam_roles.some((r) => r.includes("owner") || r.includes("editor")) && (
                      <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700 flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4" />
                        <span>⚠️ Over-privileged! Remove Owner/Editor roles and use least-privilege scopes.</span>
                      </div>
                    )}

                    <div className="flex gap-2">
                      {isRotating ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="default" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Mark Rotation Complete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Complete Key Rotation?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Confirm that you have: (1) created a new key in GCP, (2) updated the secret in
                                Lovable Cloud, (3) validated API connectivity, and (4) revoked the old key.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleCompleteRotation(key)}>
                                Confirm Complete
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
                                This will mark the key as "rotating". You will need to manually:
                                <br />1. Create a new key in GCP Console
                                <br />2. Update the secret in Lovable Cloud
                                <br />3. Validate API connectivity
                                <br />4. Revoke the old key in GCP
                                <br />5. Mark rotation complete here
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleStartRotation(key)}>
                                Start Rotation
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Rotation Audit Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="h-4 w-4" /> Rotation Audit Log
          </CardTitle>
          <CardDescription>All key lifecycle events</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No rotation events recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Performed By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs">
                      {format(new Date(log.created_at), "MMM d, yyyy HH:mm")}
                    </TableCell>
                    <TableCell className="text-sm">{log.account_name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {actionLabels[log.action] || log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.performed_by || "—"}
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

import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link as RouterLink } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  ExternalLink,
  RefreshCw,
  Star,
  StarOff,
  Trash2,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Plus,
  UserPlus,
  Video,
  Loader2,
  Link as LinkIcon,
  Info,
  Download,
  Upload,
  Unlink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  buildTestUsersExport,
  downloadTestUsersExport,
  parseTestUsersExport,
  applyTestUsersImport,
  type TestUsersExportEnvelope,
  type ImportMode,
} from "@/lib/tiktok/test-users-export";

/**
 * TikTok Test User Management
 * --------------------------------------------------------------------
 * Sandbox apps in the TikTok Developer Portal can only be used by
 * accounts that are explicitly added as "Sandbox Test Users".
 * This page:
 *   1. Walks you through adding a TikTok account in the dev portal
 *   2. Lists every TikTok account that has connected via OAuth
 *   3. Lets you tag one as the active "recording test user"
 *   4. Lets you add notes/labels (e.g. "phone account", "iPhone 14")
 *   5. Provides a one-click connect link (re-uses existing OAuth flow)
 */

const DEV_PORTAL_URL = "https://developers.tiktok.com/apps/";

type ConnectedAccount = {
  open_id: string;
  display_name: string | null;
  avatar_url: string | null;
  scope: string | null;
  expires_at: string;
  created_at: string;
};

type TestUser = {
  id: string;
  open_id: string;
  label: string | null;
  notes: string | null;
  is_recording_user: boolean;
  registered_in_dev_portal_at: string | null;
  created_at: string;
};

type Row = {
  open_id: string;
  account: ConnectedAccount | null;
  testUser: TestUser | null;
};

export default function TikTokTestUsersPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [testUsers, setTestUsers] = useState<TestUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  // "Add by open_id" form (for accounts you've added in the dev portal
  // but haven't connected via OAuth yet)
  const [showAddForm, setShowAddForm] = useState(false);
  const [newOpenId, setNewOpenId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newNotes, setNewNotes] = useState("");

  // Export / import: lets admins move the test-user config (active
  // recording user + per-account label/notes) between environments.
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [importPreview, setImportPreview] = useState<TestUsersExportEnvelope | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // Disconnect dialog state — controls a confirmation modal that lets
  // admins remove a connected TikTok account's OAuth token (and optionally
  // the test-user registry row + the recording-user flag).
  const [disconnectTarget, setDisconnectTarget] = useState<Row | null>(null);
  const [disconnectAlsoRemoveTestUser, setDisconnectAlsoRemoveTestUser] =
    useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const [accountsRes, testUsersRes] = await Promise.all([
      supabase
        .from("tiktok_oauth_tokens")
        .select("open_id, display_name, avatar_url, scope, expires_at, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("tiktok_test_users")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    if (accountsRes.error) {
      console.error("[TikTokTestUsersPage] accounts:", accountsRes.error);
      toast.error("Could not load connected accounts");
    } else {
      setAccounts((accountsRes.data as ConnectedAccount[]) || []);
    }
    if (testUsersRes.error) {
      console.error("[TikTokTestUsersPage] test users:", testUsersRes.error);
      toast.error("Could not load test users");
    } else {
      setTestUsers((testUsersRes.data as TestUser[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  // Merge: every open_id that exists in either table becomes a row
  const rows: Row[] = (() => {
    const map = new Map<string, Row>();
    for (const a of accounts) {
      map.set(a.open_id, { open_id: a.open_id, account: a, testUser: null });
    }
    for (const t of testUsers) {
      const existing = map.get(t.open_id);
      if (existing) {
        existing.testUser = t;
      } else {
        map.set(t.open_id, { open_id: t.open_id, account: null, testUser: t });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      // recording user first, then connected, then registered-only
      const aRec = a.testUser?.is_recording_user ? 1 : 0;
      const bRec = b.testUser?.is_recording_user ? 1 : 0;
      if (aRec !== bRec) return bRec - aRec;
      const aCon = a.account ? 1 : 0;
      const bCon = b.account ? 1 : 0;
      return bCon - aCon;
    });
  })();

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("tiktok-oauth-start", {
        body: { origin: window.location.origin },
      });
      if (error) throw error;
      if (data?.authorize_url) {
        window.location.href = data.authorize_url as string;
      } else {
        throw new Error("No authorize URL returned");
      }
    } catch (e) {
      console.error("[TikTokTestUsersPage] connect error:", e);
      toast.error("Could not start TikTok connect flow");
      setConnecting(false);
    }
  };

  const handleSetRecording = async (openId: string, currentlyActive: boolean) => {
    if (currentlyActive) {
      // Just unset
      const { error } = await supabase
        .from("tiktok_test_users")
        .update({ is_recording_user: false })
        .eq("open_id", openId);
      if (error) {
        toast.error("Failed to unset recording user");
      } else {
        toast.success("Recording user cleared");
        fetchAll();
      }
      return;
    }

    // Clear all others first, then set this one (partial unique index requires this)
    const { error: clearErr } = await supabase
      .from("tiktok_test_users")
      .update({ is_recording_user: false })
      .eq("is_recording_user", true);
    if (clearErr) {
      toast.error("Failed to clear previous recording user");
      return;
    }

    // Upsert this one
    const { error } = await supabase
      .from("tiktok_test_users")
      .upsert(
        { open_id: openId, is_recording_user: true, created_by: user?.id ?? null },
        { onConflict: "open_id" }
      );
    if (error) {
      toast.error("Failed to set recording user");
    } else {
      toast.success("Recording user updated");
      fetchAll();
    }
  };

  const handleRegisterExisting = async (openId: string) => {
    // Add a tiktok_test_users row for an already-connected account
    const { error } = await supabase
      .from("tiktok_test_users")
      .insert({
        open_id: openId,
        registered_in_dev_portal_at: new Date().toISOString(),
        created_by: user?.id ?? null,
      });
    if (error) {
      toast.error("Failed to register: " + error.message);
    } else {
      toast.success("Marked as test user");
      fetchAll();
    }
  };

  const handleAddManual = async () => {
    if (!newOpenId.trim()) {
      toast.error("open_id is required");
      return;
    }
    const { error } = await supabase.from("tiktok_test_users").insert({
      open_id: newOpenId.trim(),
      label: newLabel.trim() || null,
      notes: newNotes.trim() || null,
      registered_in_dev_portal_at: new Date().toISOString(),
      created_by: user?.id ?? null,
    });
    if (error) {
      toast.error("Failed to add: " + error.message);
    } else {
      toast.success("Test user added");
      setShowAddForm(false);
      setNewOpenId("");
      setNewLabel("");
      setNewNotes("");
      fetchAll();
    }
  };

  const handleDelete = async (openId: string) => {
    if (!confirm("Remove this test user from your local registry? (Will not affect TikTok dev portal.)")) {
      return;
    }
    const { error } = await supabase
      .from("tiktok_test_users")
      .delete()
      .eq("open_id", openId);
    if (error) {
      toast.error("Failed to delete");
    } else {
      toast.success("Removed");
      fetchAll();
    }
  };

  // Disconnect = revoke our local OAuth token for that account so it can no
  // longer publish. If it was the recording user, clear that flag too.
  // Optionally also remove the test_users row (label/notes) on request.
  const openDisconnectDialog = (row: Row) => {
    setDisconnectTarget(row);
    setDisconnectAlsoRemoveTestUser(false);
  };

  const handleConfirmDisconnect = async () => {
    if (!disconnectTarget) return;
    const openId = disconnectTarget.open_id;
    setDisconnecting(true);
    try {
      // 1. Drop the OAuth token row — this is what actually "disconnects"
      //    the account from our publisher.
      if (disconnectTarget.account) {
        const { error: tokenErr } = await supabase
          .from("tiktok_oauth_tokens")
          .delete()
          .eq("open_id", openId);
        if (tokenErr) throw tokenErr;
      }

      // 2. Always clear the recording-user flag (a disconnected account
      //    must never remain the active recorder).
      if (disconnectTarget.testUser?.is_recording_user) {
        const { error: clearErr } = await supabase
          .from("tiktok_test_users")
          .update({ is_recording_user: false })
          .eq("open_id", openId);
        if (clearErr) throw clearErr;
      }

      // 3. Optionally remove the test-users row entirely (forgets label/notes).
      if (disconnectAlsoRemoveTestUser && disconnectTarget.testUser) {
        const { error: tuErr } = await supabase
          .from("tiktok_test_users")
          .delete()
          .eq("open_id", openId);
        if (tuErr) throw tuErr;
      }

      toast.success("Account disconnected");
      setDisconnectTarget(null);
      setDisconnectAlsoRemoveTestUser(false);
      await fetchAll();
    } catch (err) {
      console.error("[TikTokTestUsersPage] disconnect error:", err);
      toast.error(
        err instanceof Error ? `Disconnect failed: ${err.message}` : "Disconnect failed",
      );
    } finally {
      setDisconnecting(false);
    }
  };

  const handleUpdateLabel = async (openId: string, label: string) => {
    const { error } = await supabase
      .from("tiktok_test_users")
      .upsert(
        { open_id: openId, label: label || null, created_by: user?.id ?? null },
        { onConflict: "open_id" }
      );
    if (error) toast.error("Failed to update label");
    else fetchAll();
  };

  const copy = (text: string, what: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  };

  // ----- Export -----------------------------------------------------------
  const handleExport = async () => {
    setExporting(true);
    try {
      const envelope = await buildTestUsersExport();
      downloadTestUsersExport(envelope);
      toast.success(
        `Exported ${envelope.rows.length} test user${envelope.rows.length === 1 ? "" : "s"}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  // ----- Import: parse pasted/uploaded JSON into a preview --------------
  const tryParseImport = (text: string) => {
    setImportError(null);
    setImportPreview(null);
    if (!text.trim()) return;
    try {
      const parsed = parseTestUsersExport(JSON.parse(text));
      setImportPreview(parsed);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Invalid JSON");
    }
  };

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    setImportText(text);
    tryParseImport(text);
  };

  const handleApplyImport = async () => {
    if (!importPreview) return;
    setImporting(true);
    try {
      const summary = await applyTestUsersImport(importPreview, importMode);
      toast.success(
        `Imported: ${summary.inserted} new, ${summary.updated} updated` +
          (summary.deleted ? `, ${summary.deleted} deleted` : "") +
          (summary.recording_user_set
            ? ` — recording user: ${summary.recording_user_set.slice(0, 10)}…`
            : ""),
      );
      setImportOpen(false);
      setImportText("");
      setImportPreview(null);
      setImportError(null);
      await fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const recordingRow = rows.find((r) => r.testUser?.is_recording_user);

  return (
    <>
      <Helmet>
        <title>TikTok Test Users | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <section className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6" />
              TikTok Test Users
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Beheer welke TikTok accounts mogen inloggen op je sandbox app en kies de actieve opname-account.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={exporting || loading}
              title="Download a JSON snapshot of all test users + the active recording user"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-1" />
              )}
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setImportOpen(true);
                setImportText("");
                setImportPreview(null);
                setImportError(null);
                setImportMode("merge");
              }}
              title="Restore test users + recording user from a JSON snapshot"
            >
              <Upload className="h-4 w-4 mr-1" />
              Import
            </Button>
            <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Active recording user banner */}
        {recordingRow ? (
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="py-4 flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/20">
                <Video className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium">
                  Actieve opname-account:{" "}
                  <span className="font-mono text-sm">
                    {recordingRow.account?.display_name || recordingRow.testUser?.label || "Unnamed"}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  open_id: {recordingRow.open_id}
                </p>
              </div>
              {recordingRow.account ? (
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <AlertTriangle className="h-3 w-3" /> Not connected yet
                </Badge>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="py-3 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
              <div className="flex-1 text-sm">
                <p className="font-medium text-foreground">
                  Nog geen opname-account ingesteld
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Markeer hieronder een verbonden account als "Recording User" om snel te zien welke account je gebruikt voor testvideo's.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step-by-step instructions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Een TikTok account toevoegen als sandbox test user
            </CardTitle>
            <CardDescription>
              Sandbox apps werken alléén met accounts die expliciet zijn toegevoegd in de TikTok Developer Portal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li>
                Open de{" "}
                <a
                  href={DEV_PORTAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline inline-flex items-center gap-1"
                >
                  TikTok Developer Portal <ExternalLink className="h-3 w-3" />
                </a>{" "}
                en kies je app.
              </li>
              <li>
                Ga naar <strong>Sandbox</strong> → <strong>Test users</strong> en klik op{" "}
                <strong>Add user</strong>.
              </li>
              <li>
                Vul de <strong>TikTok username</strong> in (bv. <code className="text-xs bg-muted px-1 rounded">@getpawsy</code>) en bevestig.
              </li>
              <li>
                Op het toegevoegde TikTok-account: open de notificatie en accepteer de uitnodiging.
              </li>
              <li>
                Klik hieronder op <strong>Connect TikTok account</strong> en login met dat account
                — daarna verschijnt de account in de lijst.
              </li>
              <li>
                Markeer de account met <Star className="h-3 w-3 inline" /> om hem te kiezen als
                actieve opname-account.
              </li>
            </ol>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button asChild variant="default" size="sm">
                <a href={DEV_PORTAL_URL} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Open Dev Portal
                </a>
              </Button>
              <Button onClick={handleConnect} disabled={connecting} size="sm">
                {connecting ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <LinkIcon className="h-4 w-4 mr-1" />
                )}
                Connect TikTok account
              </Button>
              <Button asChild variant="outline" size="sm">
                <RouterLink to="/admin/tiktok-config-checklist">
                  <Info className="h-4 w-4 mr-1" />
                  Config checklist
                </RouterLink>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Test users table */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-lg">Geregistreerde accounts</CardTitle>
              <CardDescription>
                {rows.length === 0
                  ? "Nog geen accounts. Connect er één om te starten."
                  : `${rows.length} account${rows.length === 1 ? "" : "s"}`}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm((v) => !v)}
            >
              <Plus className="h-4 w-4 mr-1" />
              {showAddForm ? "Cancel" : "Add manually"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {showAddForm && (
              <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Gebruik dit alleen als je een test user al hebt toegevoegd in de Dev Portal,
                  maar nog niet hebt verbonden via OAuth (handig om te tracken).
                </p>
                <Input
                  placeholder="open_id (optioneel — anders alleen als label)"
                  value={newOpenId}
                  onChange={(e) => setNewOpenId(e.target.value)}
                  className="font-mono text-xs"
                />
                <Input
                  placeholder="Label (bv. 'iPhone 14 — recording phone')"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
                <Textarea
                  placeholder="Notes (optioneel)"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  rows={2}
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleAddManual}>
                    Add test user
                  </Button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                Loading…
              </div>
            ) : rows.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground border-2 border-dashed rounded-md">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                Nog geen test users. Klik op <strong>Connect TikTok account</strong> hierboven.
              </div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Label</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const isRecording = row.testUser?.is_recording_user ?? false;
                      const isConnected = !!row.account;
                      const expiresAt = row.account?.expires_at
                        ? new Date(row.account.expires_at)
                        : null;
                      const expired = expiresAt ? expiresAt.getTime() < Date.now() : false;

                      return (
                        <TableRow key={row.open_id} className={isRecording ? "bg-primary/5" : ""}>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleSetRecording(row.open_id, isRecording)}
                              title={isRecording ? "Unset recording user" : "Set as recording user"}
                            >
                              {isRecording ? (
                                <Star className="h-4 w-4 fill-primary text-primary" />
                              ) : (
                                <StarOff className="h-4 w-4 text-muted-foreground" />
                              )}
                            </Button>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {row.account?.avatar_url ? (
                                <img
                                  src={row.account.avatar_url}
                                  alt=""
                                  className="h-8 w-8 rounded-full object-cover"
                                />
                              ) : (
                                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                  <Users className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {row.account?.display_name || "Unnamed"}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => copy(row.open_id, "open_id")}
                                  className="text-[10px] text-muted-foreground font-mono truncate max-w-[180px] hover:text-foreground inline-flex items-center gap-1"
                                  title="Copy open_id"
                                >
                                  {row.open_id.slice(0, 18)}…
                                  <Copy className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input
                              defaultValue={row.testUser?.label ?? ""}
                              placeholder="Add label…"
                              className="h-8 text-xs"
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (v !== (row.testUser?.label ?? "")) {
                                  handleUpdateLabel(row.open_id, v);
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {isConnected ? (
                                expired ? (
                                  <Badge variant="destructive" className="w-fit gap-1">
                                    <AlertTriangle className="h-3 w-3" /> Token expired
                                  </Badge>
                                ) : (
                                  <Badge variant="default" className="w-fit gap-1">
                                    <CheckCircle2 className="h-3 w-3" /> Connected
                                  </Badge>
                                )
                              ) : (
                                <Badge variant="outline" className="w-fit gap-1">
                                  <AlertTriangle className="h-3 w-3" /> Not connected
                                </Badge>
                              )}
                              {row.account?.scope && (
                                <span
                                  className="text-[10px] text-muted-foreground truncate max-w-[160px]"
                                  title={row.account.scope}
                                >
                                  {row.account.scope}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {isConnected && !row.testUser && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRegisterExisting(row.open_id)}
                                  title="Mark as test user"
                                >
                                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                                  Register
                                </Button>
                              )}
                              {isConnected && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => openDisconnectDialog(row)}
                                  title="Disconnect this TikTok account"
                                >
                                  <Unlink className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {row.testUser && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => handleDelete(row.open_id)}
                                  title="Remove from registry"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Help footer */}
        <Card className="bg-muted/30">
          <CardContent className="py-4 text-xs text-muted-foreground space-y-2">
            <p>
              <strong className="text-foreground">Hoe werkt dit?</strong> Sandbox-apps van TikTok
              accepteren alleen logins van accounts die je in de Developer Portal hebt geregistreerd.
              Pas zodra je app live (production) is geverifieerd, kunnen alle TikTok-gebruikers inloggen.
            </p>
            <p>
              <strong className="text-foreground">Tip:</strong> Gebruik een apart TikTok-account
              voor opnames (bv. een tweede telefoon). Markeer dat account als "Recording User"
              zodat duidelijk is welke account gekoppeld moet zijn als je test-video's uploadt
              via <RouterLink to="/admin/tiktok-automation" className="underline text-primary">TikTok Automation</RouterLink>.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Import dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Import TikTok test user settings
            </DialogTitle>
            <DialogDescription>
              Restore the active Recording User and per-account labels/notes
              from a previously exported JSON file. OAuth tokens are not
              included — accounts must still connect via OAuth in this
              environment to actually publish.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm cursor-pointer hover:bg-muted">
                <Upload className="h-4 w-4" />
                Choose file
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImportFile(f);
                  }}
                />
              </label>
              <span className="text-xs text-muted-foreground">
                …or paste the JSON below.
              </span>
            </div>

            <Textarea
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value);
                tryParseImport(e.target.value);
              }}
              placeholder='{ "version": 1, "rows": [ ... ] }'
              rows={8}
              className="font-mono text-xs"
            />

            {importError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{importError}</span>
              </div>
            )}

            {importPreview && (
              <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
                <div className="font-medium text-foreground">
                  Preview ({importPreview.rows.length} row
                  {importPreview.rows.length === 1 ? "" : "s"})
                </div>
                <div className="text-muted-foreground">
                  Exported{" "}
                  {new Date(importPreview.exported_at).toLocaleString()}
                  {importPreview.exported_from
                    ? ` from ${importPreview.exported_from}`
                    : ""}
                </div>
                <div className="text-muted-foreground">
                  Recording user:{" "}
                  <span className="font-mono">
                    {importPreview.recording_open_id ?? "— none —"}
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="text-xs font-medium text-foreground">
                Import mode
              </div>
              <div className="flex flex-col gap-1.5 text-xs">
                <label className="inline-flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    className="mt-0.5"
                    checked={importMode === "merge"}
                    onChange={() => setImportMode("merge")}
                  />
                  <span>
                    <span className="font-medium text-foreground">Merge</span>{" "}
                    — upsert imported rows; keep any local rows not in the file.
                  </span>
                </label>
                <label className="inline-flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    className="mt-0.5"
                    checked={importMode === "replace"}
                    onChange={() => setImportMode("replace")}
                  />
                  <span>
                    <span className="font-medium text-foreground">Replace</span>{" "}
                    — also delete local rows whose open_id is not in the file
                    (mirrors the export exactly).
                  </span>
                </label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setImportOpen(false)}
              disabled={importing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApplyImport}
              disabled={!importPreview || importing}
            >
              {importing ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-1" />
              )}
              Apply import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disconnect confirmation */}
      <AlertDialog
        open={!!disconnectTarget}
        onOpenChange={(open) => {
          if (!open && !disconnecting) {
            setDisconnectTarget(null);
            setDisconnectAlsoRemoveTestUser(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Unlink className="h-5 w-5 text-destructive" />
              Disconnect TikTok account?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  This will remove the local OAuth token for{" "}
                  <span className="font-mono text-foreground">
                    {disconnectTarget?.account?.display_name ||
                      disconnectTarget?.testUser?.label ||
                      "this account"}
                  </span>
                  . The account will no longer be able to publish until it
                  re-connects via OAuth.
                </p>
                {disconnectTarget?.testUser?.is_recording_user && (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-foreground">
                    <AlertTriangle className="h-3.5 w-3.5 inline mr-1 text-amber-600" />
                    This is the active <strong>Recording User</strong>. That
                    flag will be cleared automatically — set another account
                    afterwards.
                  </p>
                )}
                <p className="text-xs text-muted-foreground font-mono break-all">
                  open_id: {disconnectTarget?.open_id}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {disconnectTarget?.testUser && (
            <label className="flex items-start gap-2 text-xs cursor-pointer rounded-md border bg-muted/30 p-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={disconnectAlsoRemoveTestUser}
                onChange={(e) =>
                  setDisconnectAlsoRemoveTestUser(e.target.checked)
                }
              />
              <span>
                Also remove from the test-user registry (forgets label & notes).
                Leave unchecked to keep the metadata so you can re-connect later.
              </span>
            </label>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDisconnect();
              }}
              disabled={disconnecting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disconnecting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Unlink className="h-4 w-4 mr-1" />
              )}
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
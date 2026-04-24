import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  CheckCircle2,
  XCircle,
  Loader2,
  Film,
  Link2,
  Send,
  RefreshCw,
  PlayCircle,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { TikTokVideoComplianceCheck } from "./TikTokVideoComplianceCheck";
import type { ComplianceReport } from "@/lib/tiktok/video-compliance";

/**
 * Stap-voor-stap testflow voor TikTok video upload.
 *
 * Stap 1 — Selecteer een video (mp4/mov, ≤ 50MB).
 * Stap 2 — Upload naar Lovable Cloud storage (tiktok-media bucket) met progress.
 * Stap 3 — Publiceer naar TikTok via Content Posting API (PULL_FROM_URL).
 * Stap 4 — Poll publish-status tot SUCCESS / FAILED en toon succesbewijs.
 *
 * Vereist: gekoppeld TikTok-account in tiktok_oauth_tokens.
 */

type Step = 1 | 2 | 3 | 4;
type StepState = "pending" | "active" | "done" | "error";

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB — TikTok PULL_FROM_URL practical limit for tests
const ACCEPTED_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const POLL_INTERVAL_MS = 4000;
const POLL_MAX_ATTEMPTS = 30; // ~2 min

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function TikTokVideoTestUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("GetPawsy test upload 🐾 #pawsytest");
  const [privacy, setPrivacy] = useState<string>("SELF_ONLY");
  // Result of TikTok-spec validation. `null` until the file is probed.
  // Errors block the Upload button; warnings are informational only.
  const [compliance, setCompliance] = useState<ComplianceReport | null>(null);

  const [stepStates, setStepStates] = useState<Record<Step, StepState>>({
    1: "active",
    2: "pending",
    3: "pending",
    4: "pending",
  });
  const [currentStep, setCurrentStep] = useState<Step>(1);

  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedPublicUrl, setUploadedPublicUrl] = useState<string | null>(null);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);

  const [publishId, setPublishId] = useState<string | null>(null);
  const [publishMode, setPublishMode] = useState<string | null>(null);
  const [publishAccount, setPublishAccount] = useState<{ display_name?: string; open_id?: string } | null>(null);

  const [tiktokStatus, setTiktokStatus] = useState<string | null>(null);
  const [tiktokPostId, setTiktokPostId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorReason, setErrorReason] = useState<string | null>(null);

  const pollAttemptsRef = useRef(0);
  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    };
  }, [previewUrl]);

  const setStep = (step: Step, state: StepState) => {
    setStepStates((prev) => ({ ...prev, [step]: state }));
  };

  const resetAll = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    setFile(null);
    setPreviewUrl(null);
    setCompliance(null);
    setStepStates({ 1: "active", 2: "pending", 3: "pending", 4: "pending" });
    setCurrentStep(1);
    setUploadProgress(0);
    setUploadedPublicUrl(null);
    setUploadedPath(null);
    setPublishId(null);
    setPublishMode(null);
    setPublishAccount(null);
    setTiktokStatus(null);
    setTiktokPostId(null);
    setErrorMessage(null);
    setErrorReason(null);
    pollAttemptsRef.current = 0;
  };

  // ─── Step 1: choose file ──────────────────────────────────────────────
  const handleFile = (f: File | null) => {
    setErrorMessage(null);
    setErrorReason(null);
    if (!f) return;
    if (!ACCEPTED_TYPES.includes(f.type) && !f.name.match(/\.(mp4|mov|webm)$/i)) {
      setErrorMessage(`Bestandstype niet ondersteund (${f.type || "onbekend"}). Gebruik .mp4, .mov of .webm.`);
      setStep(1, "error");
      return;
    }
    if (f.size > MAX_BYTES) {
      setErrorMessage(`Bestand is te groot (${fmtBytes(f.size)}). Max ${fmtBytes(MAX_BYTES)}.`);
      setStep(1, "error");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setStep(1, "done");
    setStep(2, "active");
    setCurrentStep(2);
  };

  // ─── Step 2: upload ───────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!file) return;
    setErrorMessage(null);
    setErrorReason(null);
    setStep(2, "active");
    setUploadProgress(0);

    try {
      const ts = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `test-uploads/${ts}-${safeName}`;

      // supabase-js v2 storage doesn't expose true upload progress, so we
      // simulate optimistic ticks while the request is in flight. The bar
      // jumps to 100% on success.
      const ticker = window.setInterval(() => {
        setUploadProgress((p) => Math.min(90, p + 5));
      }, 200);

      const { error: uploadError } = await supabase.storage
        .from("tiktok-media")
        .upload(path, file, {
          contentType: file.type || "video/mp4",
          upsert: true,
          cacheControl: "3600",
        });

      window.clearInterval(ticker);

      if (uploadError) {
        setUploadProgress(0);
        setStep(2, "error");
        setErrorMessage(`Upload mislukt: ${uploadError.message}`);
        return;
      }

      const { data: pub } = supabase.storage.from("tiktok-media").getPublicUrl(path);
      setUploadProgress(100);
      setUploadedPath(path);
      setUploadedPublicUrl(pub.publicUrl);
      setStep(2, "done");
      setStep(3, "active");
      setCurrentStep(3);
      toast.success("Video geüpload naar Lovable Cloud");
    } catch (e) {
      setUploadProgress(0);
      setStep(2, "error");
      setErrorMessage(e instanceof Error ? e.message : String(e));
    }
  };

  // ─── Step 3: publish ──────────────────────────────────────────────────
  const handlePublish = async () => {
    if (!uploadedPublicUrl) return;
    setErrorMessage(null);
    setErrorReason(null);
    setStep(3, "active");

    try {
      const { data, error } = await supabase.functions.invoke("tiktok-video-test-upload", {
        body: {
          action: "publish",
          videoUrl: uploadedPublicUrl,
          caption,
          privacy,
        },
      });
      if (error) throw error;

      if (!data?.ok) {
        setStep(3, "error");
        setErrorReason(data?.reason || "PUBLISH_FAILED");
        setErrorMessage(data?.message || "Publish stap mislukt.");
        return;
      }

      setPublishId(data.publishId || null);
      setPublishMode(data.mode || null);
      setPublishAccount(data.account || null);
      setStep(3, "done");
      setStep(4, "active");
      setCurrentStep(4);
      toast.success("TikTok publish-job gestart");

      if (data.publishId) {
        pollAttemptsRef.current = 0;
        schedulePoll(data.publishId);
      } else {
        setStep(4, "error");
        setErrorMessage("TikTok gaf geen publish_id terug.");
      }
    } catch (e) {
      setStep(3, "error");
      setErrorMessage(e instanceof Error ? e.message : String(e));
    }
  };

  // ─── Step 4: poll status ──────────────────────────────────────────────
  const schedulePoll = (id: string) => {
    if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    pollTimerRef.current = window.setTimeout(() => pollStatus(id), POLL_INTERVAL_MS);
  };

  const pollStatus = async (id: string) => {
    pollAttemptsRef.current += 1;
    try {
      const { data, error } = await supabase.functions.invoke("tiktok-video-test-upload", {
        body: { action: "status", publishId: id },
      });
      if (error) throw error;

      if (!data?.ok) {
        setStep(4, "error");
        setErrorReason(data?.reason || "STATUS_FAILED");
        setErrorMessage(data?.message || "Status check mislukt.");
        return;
      }

      const status = String(data.status || "").toUpperCase();
      setTiktokStatus(status);

      if (status === "PUBLISH_COMPLETE" || status === "SUCCESS") {
        setStep(4, "done");
        setTiktokPostId(data.publiclyAvailablePostId || null);
        toast.success("✅ Video gepubliceerd op TikTok!");
        return;
      }
      if (status === "FAILED") {
        setStep(4, "error");
        setErrorMessage(data.failReason || "TikTok rapporteert FAILED.");
        return;
      }
      if (pollAttemptsRef.current >= POLL_MAX_ATTEMPTS) {
        setStep(4, "error");
        setErrorMessage("Time-out bij wachten op TikTok status. Check de TikTok app handmatig.");
        return;
      }
      // Still processing — keep polling.
      schedulePoll(id);
    } catch (e) {
      setStep(4, "error");
      setErrorMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const manualRefresh = () => {
    if (publishId) {
      pollAttemptsRef.current = 0;
      pollStatus(publishId);
    }
  };

  // ─── Derived ──────────────────────────────────────────────────────────
  const overallProgress = useMemo(() => {
    let pct = 0;
    if (stepStates[1] === "done") pct = 25;
    if (stepStates[2] === "done") pct = 50;
    if (stepStates[3] === "done") pct = 75;
    if (stepStates[4] === "done") pct = 100;
    return pct;
  }, [stepStates]);

  const renderStepIcon = (s: StepState) => {
    if (s === "done") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    if (s === "error") return <XCircle className="h-4 w-4 text-destructive" />;
    if (s === "active") return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    return <div className="h-4 w-4 rounded-full border border-muted-foreground/30" />;
  };

  const successProof = stepStates[4] === "done";

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Film className="h-5 w-5 text-primary" />
          TikTok Video — Test Upload Flow
        </CardTitle>
        <CardDescription>
          Stap-voor-stap testflow: kies een video, upload naar Lovable Cloud, publiceer
          naar TikTok en zie real-time of het is gelukt. Vereist een gekoppeld TikTok-account.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Overall progress */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Voortgang</span>
            <span>{overallProgress}%</span>
          </div>
          <Progress value={overallProgress} className="h-2" />
        </div>

        {/* Step list */}
        <ol className="space-y-3">
          {/* Step 1 */}
          <li className="rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {renderStepIcon(stepStates[1])}
                <span className="text-sm font-medium">1. Kies een testvideo</span>
              </div>
              <Badge variant="outline" className="text-[10px]">
                .mp4 / .mov / .webm · max {fmtBytes(MAX_BYTES)}
              </Badge>
            </div>
            <div className="mt-3 space-y-2">
              <Input
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                onChange={(e) => handleFile(e.target.files?.[0] || null)}
                disabled={currentStep > 1 && stepStates[1] === "done" && stepStates[2] !== "pending" && stepStates[2] !== "error"}
              />
              {file && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate">
                    📁 {file.name} · {fmtBytes(file.size)} · {file.type || "video"}
                  </span>
                </div>
              )}
              {previewUrl && (
                <video
                  src={previewUrl}
                  controls
                  className="mt-2 max-h-48 w-full rounded bg-muted"
                />
              )}
            </div>
          </li>

          {/* Step 2 */}
          <li className="rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {renderStepIcon(stepStates[2])}
                <span className="text-sm font-medium">2. Upload naar Lovable Cloud</span>
              </div>
              {uploadedPublicUrl && (
                <a
                  href={uploadedPublicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Link2 className="h-3 w-3" /> Open public URL
                </a>
              )}
            </div>
            <div className="mt-3 space-y-2">
              <Progress value={uploadProgress} className="h-2" />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {stepStates[2] === "done"
                    ? "Upload voltooid"
                    : stepStates[2] === "active" && uploadProgress > 0
                    ? `Bezig met uploaden… ${uploadProgress}%`
                    : "Wachten op upload"}
                </span>
                <Button
                  size="sm"
                  onClick={handleUpload}
                  disabled={!file || stepStates[2] === "done" || (stepStates[2] === "active" && uploadProgress > 0)}
                >
                  {stepStates[2] === "active" && uploadProgress > 0 ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Upload className="h-3 w-3 mr-1" />
                  )}
                  Upload
                </Button>
              </div>
              {uploadedPath && (
                <p className="font-mono text-[10px] text-muted-foreground">
                  bucket: tiktok-media · path: {uploadedPath}
                </p>
              )}
            </div>
          </li>

          {/* Step 3 */}
          <li className="rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {renderStepIcon(stepStates[3])}
                <span className="text-sm font-medium">3. Publiceer naar TikTok</span>
              </div>
              {publishMode && (
                <Badge variant={publishMode === "production" ? "default" : "secondary"} className="text-[10px] uppercase">
                  {publishMode}
                </Badge>
              )}
            </div>
            <div className="mt-3 space-y-2">
              <div className="space-y-1">
                <Label htmlFor="ttu-caption" className="text-xs">Caption / titel</Label>
                <Textarea
                  id="ttu-caption"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={2}
                  maxLength={150}
                  disabled={stepStates[3] === "done"}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ttu-privacy" className="text-xs">Privacy-niveau</Label>
                <select
                  id="ttu-privacy"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={privacy}
                  onChange={(e) => setPrivacy(e.target.value)}
                  disabled={stepStates[3] === "done"}
                >
                  <option value="SELF_ONLY">SELF_ONLY (privé — verplicht voor sandbox / unaudited apps)</option>
                  <option value="MUTUAL_FOLLOW_FRIENDS">MUTUAL_FOLLOW_FRIENDS</option>
                  <option value="FOLLOWER_OF_CREATOR">FOLLOWER_OF_CREATOR</option>
                  <option value="PUBLIC_TO_EVERYONE">PUBLIC_TO_EVERYONE (alleen na audit)</option>
                </select>
              </div>
              <div className="flex items-center justify-end">
                <Button
                  size="sm"
                  onClick={handlePublish}
                  disabled={!uploadedPublicUrl || stepStates[3] === "done" || stepStates[3] === "active" && !!publishId}
                >
                  {stepStates[3] === "active" && !publishId ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Send className="h-3 w-3 mr-1" />
                  )}
                  Publish to TikTok
                </Button>
              </div>
              {publishId && (
                <p className="font-mono text-[10px] text-muted-foreground">
                  publish_id: {publishId}
                  {publishAccount?.display_name && (
                    <> · account: {publishAccount.display_name}</>
                  )}
                </p>
              )}
            </div>
          </li>

          {/* Step 4 */}
          <li className="rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {renderStepIcon(stepStates[4])}
                <span className="text-sm font-medium">4. Wachten op TikTok-bevestiging</span>
              </div>
              {tiktokStatus && (
                <Badge variant="outline" className="text-[10px] uppercase">
                  {tiktokStatus}
                </Badge>
              )}
            </div>
            <div className="mt-3 space-y-2 text-xs text-muted-foreground">
              {stepStates[4] === "active" && !successProof && (
                <p>
                  Polling TikTok status elke {POLL_INTERVAL_MS / 1000}s
                  (poging {pollAttemptsRef.current}/{POLL_MAX_ATTEMPTS})…
                </p>
              )}
              {successProof && (
                <div className="rounded-md border border-green-300 bg-green-50 p-3 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="h-4 w-4" /> Succesbewijs
                  </div>
                  <ul className="mt-1 space-y-0.5 text-xs">
                    <li>✓ Upload bucket: tiktok-media/{uploadedPath}</li>
                    <li>✓ TikTok publish_id: {publishId}</li>
                    <li>✓ Status: {tiktokStatus}</li>
                    {tiktokPostId && <li>✓ TikTok post id: {tiktokPostId}</li>}
                    {publishMode && <li>✓ Mode: {publishMode}</li>}
                  </ul>
                  {tiktokPostId && (
                    <a
                      href={`https://www.tiktok.com/@${publishAccount?.display_name || ""}/video/${tiktokPostId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs underline"
                    >
                      <PlayCircle className="h-3 w-3" /> Open op TikTok
                    </a>
                  )}
                </div>
              )}
              {publishId && stepStates[4] !== "done" && (
                <Button size="sm" variant="outline" onClick={manualRefresh}>
                  <RefreshCw className="h-3 w-3 mr-1" /> Refresh status
                </Button>
              )}
            </div>
          </li>
        </ol>

        {/* Error panel */}
        {errorMessage && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" /> Er ging iets mis
              {errorReason && <Badge variant="destructive" className="text-[10px]">{errorReason}</Badge>}
            </div>
            <p className="mt-1 text-xs text-destructive/90">{errorMessage}</p>
            {errorReason === "TIKTOK_NOT_CONNECTED" && (
              <p className="mt-1 text-xs text-muted-foreground">
                → Klik in de kaart hierboven op <strong>Connect TikTok Account</strong> en probeer opnieuw.
              </p>
            )}
            {errorReason === "TIKTOK_TOKEN_EXPIRED" && (
              <p className="mt-1 text-xs text-muted-foreground">
                → Je TikTok-token is verlopen. Verbind het account opnieuw.
              </p>
            )}
          </div>
        )}

        {/* Reset */}
        <div className="flex items-center justify-end pt-1">
          <Button size="sm" variant="ghost" onClick={resetAll}>
            <RotateCcw className="h-3 w-3 mr-1" /> Begin opnieuw
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default TikTokVideoTestUpload;
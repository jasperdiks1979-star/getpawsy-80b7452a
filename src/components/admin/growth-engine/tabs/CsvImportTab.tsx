import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Upload } from "lucide-react";

const SOURCES = [
  { value: "pinterest_pin_metrics", label: "Pinterest analytics CSV" },
  { value: "tiktok_video_metrics", label: "TikTok analytics CSV" },
  { value: "gsc_metrics", label: "Google Search Console CSV" },
  { value: "ga4_events", label: "GA4 export CSV" },
];

export function CsvImportTab() {
  const [source, setSource] = useState("pinterest_pin_metrics");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  async function upload() {
    if (!file) return;
    setBusy(true); setResult(null);
    try {
      const text = await file.text();
      const { data, error } = await supabase.functions.invoke("gi-csv-import", { body: { source, csv: text } });
      if (error) throw error;
      setResult(data);
      toast({ title: "Import done", description: `Inserted: ${(data as any)?.data?.inserted ?? 0}, skipped: ${(data as any)?.data?.skipped ?? 0}` });
    } catch (e: any) {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>CSV Import (Fallback)</CardTitle>
        <CardDescription>Upload weekly exports from Pinterest, TikTok, GSC or GA4.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-xl">
        <div className="space-y-2"><Label>Source</Label>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><Label>CSV file</Label>
          <Input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
        <Button onClick={upload} disabled={!file || busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />} Import
        </Button>
        {result && <pre className="text-xs bg-muted p-3 rounded mt-3 overflow-auto max-h-60">{JSON.stringify(result, null, 2)}</pre>}
      </CardContent>
    </Card>
  );
}

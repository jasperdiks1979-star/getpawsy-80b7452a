import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Archive, Download, ExternalLink, Eye, FileText, Filter, Pin, PinOff,
  Search, Shield, ShieldAlert, ShieldCheck, Star, StarOff, Vault,
} from "lucide-react";
import { format } from "date-fns";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";

type Doc = {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  document_type: string;
  category: string;
  subcategory: string | null;
  version: string | null;
  status: string;
  sha256: string | null;
  public_path: string | null;
  mime_type: string | null;
  file_size: number | null;
  tags: string[] | null;
  is_pinned: boolean;
  is_favorite: boolean;
  is_archived: boolean;
  download_count: number;
  view_count: number;
  integrity_verified: boolean;
  created_at: string;
};

const CATEGORY_ORDER = [
  "All", "Certification", "Financial", "AI", "Marketing",
  "Business", "Architecture", "Security", "General",
];

function fmtSize(n: number | null) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default function GenesisVaultPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("All");
  const [preview, setPreview] = useState<Doc | null>(null);
  const [verifyingAll, setVerifyingAll] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("genesis_documents")
      .select("*")
      .eq("is_archived", false)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (!error && data) setDocs(data as Doc[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return docs.filter((d) => {
      if (category !== "All" && d.category !== category) return false;
      if (!needle) return true;
      const hay = [
        d.title, d.subtitle, d.description, d.category, d.subcategory,
        d.version, d.sha256, d.public_path, (d.tags || []).join(" "),
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [docs, q, category]);

  const stats = useMemo(() => {
    const byCat: Record<string, number> = {};
    let bytes = 0, pinned = 0, verified = 0;
    for (const d of docs) {
      byCat[d.category] = (byCat[d.category] || 0) + 1;
      bytes += d.file_size || 0;
      if (d.is_pinned) pinned++;
      if (d.integrity_verified) verified++;
    }
    return { total: docs.length, bytes, pinned, verified, byCat };
  }, [docs]);

  const toggle = async (d: Doc, field: "is_pinned" | "is_favorite" | "is_archived") => {
    const next = !d[field];
    setDocs((prev) => prev.map((x) => (x.id === d.id ? { ...x, [field]: next } : x)));
    await supabase.from("genesis_documents").update({ [field]: next }).eq("id", d.id);
  };

  const openDoc = async (d: Doc) => {
    setPreview(d);
    await supabase.from("genesis_documents")
      .update({ view_count: d.view_count + 1, last_opened: new Date().toISOString() })
      .eq("id", d.id);
  };

  const download = async (d: Doc) => {
    if (!d.public_path) return;
    await supabase.from("genesis_documents")
      .update({ download_count: d.download_count + 1 })
      .eq("id", d.id);
    window.open(d.public_path, "_blank", "noopener");
  };

  const verify = async (opts: { documentId?: string } = {}) => {
    const single = !!opts.documentId;
    if (single) setVerifyingId(opts.documentId!);
    else setVerifyingAll(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "genesis-vault-verify-integrity",
        { body: single ? { document_id: opts.documentId } : { limit: 200 } },
      );
      if (error) throw error;
      const d = data as {
        checked: number; verified: number; mismatched: number;
        missing_hash: number; missing_payload: number; errors: number;
      };
      const label = single ? "Document verified" : "Vault integrity checked";
      const detail = `${d.verified}/${d.checked} verified · ${d.mismatched} mismatch · ${d.missing_hash} no hash · ${d.missing_payload} no payload · ${d.errors} errors`;
      if (d.mismatched > 0) toast.error(label, { description: detail });
      else toast.success(label, { description: detail });
      await load();
    } catch (e) {
      toast.error("Integrity check failed", { description: (e as Error).message });
    } finally {
      if (single) setVerifyingId(null);
      else setVerifyingAll(false);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Helmet>
        <title>Genesis Intelligence Vault — GetPawsy Admin</title>
        <meta name="description" content="Central vault for every Genesis report, certification, invoice and audit." />
      </Helmet>

      <header className="flex items-center gap-3">
        <Vault className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Genesis Intelligence Vault</h1>
          <p className="text-sm text-muted-foreground">
            Central registry for every report, certification, invoice and audit generated by Genesis.
          </p>
        </div>
        <a
          href="/admin/evidence-vault"
          className="ml-auto inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Shield className="w-4 h-4" />
          Open Evidence Vault →
        </a>
      </header>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Documents" value={stats.total.toString()} icon={<FileText className="w-4 h-4" />} />
        <StatCard label="Storage" value={fmtSize(stats.bytes)} icon={<Archive className="w-4 h-4" />} />
        <StatCard label="Pinned" value={stats.pinned.toString()} icon={<Pin className="w-4 h-4" />} />
        <StatCard label="Integrity verified" value={`${stats.verified}/${stats.total}`} icon={<Shield className="w-4 h-4" />} />
      </div>

      {/* Search + filter */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
          <Input
            className="pl-9 h-10"
            placeholder="Search title, tags, hash, version, path…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button variant="outline" onClick={() => load()}>
          <Filter className="w-4 h-4 mr-2" /> Refresh
        </Button>
        <Button variant="outline" disabled={verifyingAll} onClick={() => verify()}>
          <ShieldCheck className="w-4 h-4 mr-2" />
          {verifyingAll ? "Verifying…" : "Verify integrity"}
        </Button>
      </div>

      <Tabs value={category} onValueChange={setCategory}>
        <TabsList className="flex flex-wrap h-auto">
          {CATEGORY_ORDER.map((c) => (
            <TabsTrigger key={c} value={c}>
              {c}
              {c !== "All" && stats.byCat[c] ? (
                <Badge variant="secondary" className="ml-2">{stats.byCat[c]}</Badge>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={category} className="mt-4">
          {loading ? (
            <p className="text-muted-foreground">Loading vault…</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground">No documents match your search.</p>
          ) : (
            <div className="grid gap-3">
              {filtered.map((d) => (
                <Card key={d.id} className={d.is_pinned ? "border-primary/50" : ""}>
                  <CardContent className="p-4 flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {d.is_pinned && <Pin className="w-3.5 h-3.5 text-primary" />}
                        <h3 className="font-medium truncate">{d.title}</h3>
                        {d.version && <Badge variant="outline">{d.version}</Badge>}
                        <Badge variant="secondary">{d.category}</Badge>
                        {d.subcategory && <Badge variant="outline">{d.subcategory}</Badge>}
                        {d.integrity_verified && (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600">
                            <Shield className="w-3 h-3 mr-1" /> verified
                          </Badge>
                        )}
                      </div>
                      {d.subtitle && <p className="text-sm text-muted-foreground mt-1">{d.subtitle}</p>}
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>{format(new Date(d.created_at), "yyyy-MM-dd")}</span>
                        <span>{d.document_type.toUpperCase()}</span>
                        <span>{fmtSize(d.file_size)}</span>
                        {d.sha256 && (
                          <span className="font-mono truncate max-w-[300px]" title={d.sha256}>
                            sha256:{d.sha256.slice(0, 12)}…
                          </span>
                        )}
                        {d.download_count > 0 && <span>{d.download_count}↓</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" title={d.is_favorite ? "Unfavorite" : "Favorite"}
                        onClick={() => toggle(d, "is_favorite")}>
                        {d.is_favorite ? <Star className="w-4 h-4 fill-amber-400 text-amber-500" /> : <StarOff className="w-4 h-4" />}
                      </Button>
                      <Button size="icon" variant="ghost" title={d.is_pinned ? "Unpin" : "Pin"}
                        onClick={() => toggle(d, "is_pinned")}>
                        {d.is_pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Verify SHA-256 integrity"
                        disabled={verifyingId === d.id}
                        onClick={() => verify({ documentId: d.id })}
                      >
                        {d.integrity_verified
                          ? <ShieldCheck className="w-4 h-4 text-emerald-600" />
                          : <ShieldAlert className="w-4 h-4 text-amber-600" />}
                      </Button>
                      <Button size="icon" variant="ghost" title="Preview" onClick={() => openDoc(d)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Download" onClick={() => download(d)}>
                        <Download className="w-4 h-4" />
                      </Button>
                      {d.public_path && (
                        <Button size="icon" variant="ghost" title="Open in new tab" asChild>
                          <a href={d.public_path} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-5xl h-[85vh] p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="text-base">{preview?.title}</DialogTitle>
          </DialogHeader>
          {preview?.public_path && (preview.mime_type === "application/pdf" ? (
            <iframe src={preview.public_path} className="w-full h-full" title={preview.title} />
          ) : preview.mime_type?.startsWith("text/html") ? (
            <iframe src={preview.public_path} className="w-full h-full" title={preview.title} />
          ) : (
            <div className="p-6 space-y-3">
              <p className="text-sm text-muted-foreground">Preview not available for this file type.</p>
              <Button asChild><a href={preview.public_path} target="_blank" rel="noopener noreferrer">Open file</a></Button>
            </div>
          ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
          {icon} {label}
        </CardTitle>
      </CardHeader>
      <CardContent><div className="text-2xl font-semibold">{value}</div></CardContent>
    </Card>
  );
}
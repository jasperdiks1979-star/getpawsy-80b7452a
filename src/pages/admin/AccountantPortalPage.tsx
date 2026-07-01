import { useEffect, useMemo, useState } from "react";
import { Navigate, NavLink } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, FileText, Landmark, Receipt, Shield } from "lucide-react";
import { Helmet } from "react-helmet-async";

type Doc = { id: string; title: string; document_type: string; supplier_name: string | null; document_date: string | null; amount_minor: number | null; vat_minor: number | null; currency: string | null; sha256: string; };
type Vat = { id: string; period_type: string; period_year: number; period_number: number | null; recoverable_minor: number; vat_total_minor: number; currency: string; invoice_count: number };

const money = (m: number | null | undefined, c?: string | null) =>
  m == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: c || "EUR" }).format(m / 100);

const AccountantPortalPage = () => {
  const { user, isAdmin, isLoading } = useAuth();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [vats, setVats] = useState<Vat[]>([]);
  const [roles, setRoles] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      if (user) {
        const r = await supabase.from("user_roles").select("role").eq("user_id", user.id);
        if (r.data) setRoles(r.data.map((x: { role: string }) => x.role));
      }
      const [d, v] = await Promise.all([
        supabase.from("evidence_documents").select("id,title,document_type,supplier_name,document_date,amount_minor,vat_minor,currency,sha256").order("document_date", { ascending: false, nullsFirst: false }).limit(500),
        supabase.from("finance_vat_summaries").select("*").order("period_year", { ascending: false }),
      ]);
      if (d.data) setDocs(d.data as Doc[]);
      if (v.data) setVats(v.data as Vat[]);
    })();
  }, [user]);

  const allowed = useMemo(() => isAdmin || roles.includes("accountant") || roles.includes("auditor"), [isAdmin, roles]);

  if (isLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!allowed) return <Navigate to="/dashboard" replace />;

  const invoices = docs.filter((d) => d.document_type === "invoice");
  const receipts = docs.filter((d) => d.document_type === "receipt");

  return (
    <div className="min-h-screen bg-background">
      <Helmet><title>Accountant Portal · GetPawsy</title></Helmet>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex items-center gap-3 mb-6">
          <NavLink to="/admin" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></NavLink>
          <Landmark className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Accountant Portal</h1>
            <p className="text-sm text-muted-foreground">Read-only bookkeeping view · Invoices, receipts, VAT &amp; evidence</p>
          </div>
        </div>

        <Tabs defaultValue="invoices">
          <TabsList className="mb-4"><TabsTrigger value="invoices">Invoices</TabsTrigger><TabsTrigger value="receipts">Receipts</TabsTrigger><TabsTrigger value="vat">VAT summaries</TabsTrigger></TabsList>

          <TabsContent value="invoices">
            <DocList items={invoices} empty="No invoices archived yet." icon={<FileText className="h-6 w-6" />} />
          </TabsContent>
          <TabsContent value="receipts">
            <DocList items={receipts} empty="No receipts archived yet." icon={<Receipt className="h-6 w-6" />} />
          </TabsContent>
          <TabsContent value="vat">
            {vats.length === 0 ? (
              <Card><CardContent className="p-8 text-sm text-muted-foreground text-center">
                <Shield className="h-6 w-6 mx-auto mb-2" />
                VAT summaries are generated after the first quarter of imported invoices. Nothing to reclaim yet.
              </CardContent></Card>
            ) : (
              <div className="grid gap-2">
                {vats.map((v) => (
                  <Card key={v.id}><CardContent className="p-3 flex items-center justify-between">
                    <div><p className="font-medium">{v.period_type === "quarter" ? `Q${v.period_number} ${v.period_year}` : `FY ${v.period_year}`}</p>
                      <p className="text-xs text-muted-foreground">{v.invoice_count} invoices</p></div>
                    <div className="text-right"><p className="font-medium">{money(v.recoverable_minor, v.currency)}</p>
                      <p className="text-xs text-muted-foreground">recoverable of {money(v.vat_total_minor, v.currency)}</p></div>
                  </CardContent></Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

const DocList = ({ items, empty, icon }: { items: Doc[]; empty: string; icon: React.ReactNode }) => (
  items.length === 0 ? (
    <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
      <div className="mx-auto mb-2 text-muted-foreground">{icon}</div>{empty}
    </CardContent></Card>
  ) : (
    <div className="grid gap-2">
      {items.map((d) => (
        <Card key={d.id}><CardContent className="p-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium truncate">{d.title}</p>
            <p className="text-xs text-muted-foreground truncate">{d.supplier_name || "—"} · {d.document_date || "—"}</p>
            <p className="text-[10px] font-mono text-muted-foreground">sha: {d.sha256.slice(0, 20)}…</p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-medium">{money(d.amount_minor, d.currency)}</p>
            {d.vat_minor ? <Badge variant="outline" className="text-[10px]">VAT {money(d.vat_minor, d.currency)}</Badge> : null}
          </div>
        </CardContent></Card>
      ))}
    </div>
  )
);

export default AccountantPortalPage;
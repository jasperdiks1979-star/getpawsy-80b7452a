import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Check = {
  queue_id: string;
  queue_status?: string;
  product_slug?: string | null;
  product_url: string | null;
  browser_status?: number;
  browser_canonical?: string | null;
  pinterestbot_status?: number;
  pinterestbot_canonical?: string | null;
  status: "OK" | "WARN" | "ERROR";
  reason?: string | null;
};

type Resp = {
  ok: boolean;
  summary?: { total: number; ok: number; warn: number; error: number };
  checks?: Check[];
  error?: string;
};

export default function CanonicalHealthPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("canonical-health-check", { body: { limit: 25 } });
      if (error) throw error;
      setData(data as Resp);
    } catch (e: any) {
      setData({ ok: false, error: String(e?.message ?? e) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { run(); }, []);

  const s = data?.summary;
  return (
    <div className="container mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Canonical Health</h1>
          <p className="text-sm text-muted-foreground">
            Per-route canonical resolution as seen by a real browser AND Pinterestbot. ERROR rows collapse to the homepage canonical bucket → Pinterest rejects pins.
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Scanning…" : "Re-scan"}
        </button>
      </header>

      {s && (
        <div className="grid grid-cols-4 gap-3">
          <Tile label="Checked" value={s.total} />
          <Tile label="OK" value={s.ok} tone="ok" />
          <Tile label="Warn" value={s.warn} tone="warn" />
          <Tile label="Error" value={s.error} tone="err" />
        </div>
      )}

      {data?.error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {data.error}
        </div>
      )}

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Product URL</th>
              <th className="text-left p-2">Browser canonical</th>
              <th className="text-left p-2">Pinterestbot canonical</th>
              <th className="text-left p-2">Reason</th>
            </tr>
          </thead>
          <tbody>
            {(data?.checks ?? []).map((c) => (
              <tr key={c.queue_id} className="border-t align-top">
                <td className="p-2">
                  <span className={
                    c.status === "OK" ? "text-emerald-600 font-medium" :
                    c.status === "WARN" ? "text-amber-600 font-medium" :
                    "text-red-600 font-medium"
                  }>{c.status}</span>
                </td>
                <td className="p-2 break-all">
                  {c.product_url ? <a className="underline" href={c.product_url} target="_blank" rel="noreferrer">{c.product_url}</a> : "—"}
                </td>
                <td className="p-2 break-all">{c.browser_canonical ?? <span className="text-muted-foreground">none</span>}</td>
                <td className="p-2 break-all">{c.pinterestbot_canonical ?? <span className="text-muted-foreground">none</span>}</td>
                <td className="p-2 text-xs text-muted-foreground">{c.reason ?? ""}</td>
              </tr>
            ))}
            {!loading && (data?.checks ?? []).length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No queue rows to check.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" | "err" }) {
  const color = tone === "ok" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : tone === "err" ? "text-red-600" : "";
  return (
    <div className="rounded-md border p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
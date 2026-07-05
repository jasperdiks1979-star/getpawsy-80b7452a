import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Landmark, Globe2, CircleDollarSign, CalendarRange } from "lucide-react";

// Represents Skidzo (legal) with GetPawsy (brand). We never expose entity_id in UI.
type Entity = {
  id: string;
  slug: string;
  legal_name: string;
  trade_name: string | null;
  vat_number: string | null;
  country_code: string | null;
  base_currency: string | null;
  is_default: boolean | null;
  is_active: boolean | null;
};

function fiscalYearLabel(): string {
  const y = new Date().getUTCFullYear();
  const q = Math.floor(new Date().getUTCMonth() / 3) + 1;
  return `FY ${y} · Q${q}`;
}

export function EntitySelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("finance_entities")
        .select("id,slug,legal_name,trade_name,vat_number,country_code,base_currency,is_default,is_active")
        .eq("is_active", true)
        .order("is_default", { ascending: false });
      if (data) {
        setEntities(data as Entity[]);
        if (!value || value === "all") {
          const def = (data as Entity[]).find((e) => e.is_default) ?? (data as Entity[])[0];
          if (def) onChange(def.id);
        }
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = entities.find((e) => e.id === value);

  return (
    <Card>
      <CardContent className="p-3 md:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <Building2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Legal entity</div>
              <div className="text-lg font-semibold truncate">
                {active?.legal_name ?? (loading ? "Loading…" : "—")}
              </div>
              {active?.trade_name && (
                <div className="text-xs text-muted-foreground truncate">Brand · {active.trade_name}</div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {active?.vat_number && (
              <Badge variant="outline" className="gap-1"><Landmark className="h-3 w-3" /> VAT {active.vat_number}</Badge>
            )}
            {active?.country_code && (
              <Badge variant="outline" className="gap-1"><Globe2 className="h-3 w-3" /> {active.country_code.toUpperCase()}</Badge>
            )}
            {active?.base_currency && (
              <Badge variant="outline" className="gap-1"><CircleDollarSign className="h-3 w-3" /> {active.base_currency}</Badge>
            )}
            <Badge variant="secondary" className="gap-1"><CalendarRange className="h-3 w-3" /> {fiscalYearLabel()}</Badge>
          </div>

          {entities.length > 1 && (
            <Select value={value} onValueChange={onChange}>
              <SelectTrigger className="w-full md:w-52"><SelectValue placeholder="Switch entity" /></SelectTrigger>
              <SelectContent>
                {entities.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.trade_name || e.legal_name}{e.is_default ? " · default" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
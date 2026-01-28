import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  Legend
} from "recharts";
import { DollarSign } from "lucide-react";

const COMPETITOR_COLORS: Record<string, string> = {
  amazon: "#FF9900",
  chewy: "#1976D2",
  petco: "#E53935",
  petsmart: "#43A047",
  walmart: "#FBC02D",
};

const COMPETITOR_LABELS: Record<string, string> = {
  amazon: "Amazon",
  chewy: "Chewy",
  petco: "Petco",
  petsmart: "PetSmart",
  walmart: "Walmart",
};

interface PriceStats {
  competitor: string;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  productCount: number;
}

export const CompetitorPricingChart = () => {
  const { data: priceStats, isLoading } = useQuery({
    queryKey: ["competitor-price-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("competitor_products")
        .select("competitor, price")
        .not("price", "is", null);
      
      if (error) throw error;

      // Group and calculate stats per competitor
      const byCompetitor: Record<string, number[]> = {};
      (data || []).forEach((p) => {
        if (p.price && p.price > 0) {
          if (!byCompetitor[p.competitor]) {
            byCompetitor[p.competitor] = [];
          }
          byCompetitor[p.competitor].push(p.price);
        }
      });

      const stats: PriceStats[] = Object.entries(byCompetitor).map(([competitor, prices]) => ({
        competitor,
        avgPrice: prices.reduce((a, b) => a + b, 0) / prices.length,
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        productCount: prices.length,
      }));

      return stats.sort((a, b) => b.productCount - a.productCount);
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Prijsvergelijking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[250px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!priceStats || priceStats.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Prijsvergelijking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-muted-foreground">
            <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Geen prijsdata beschikbaar</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = priceStats.map((s) => ({
    name: COMPETITOR_LABELS[s.competitor] || s.competitor,
    competitor: s.competitor,
    "Gem. Prijs": Number(s.avgPrice.toFixed(2)),
    "Min Prijs": Number(s.minPrice.toFixed(2)),
    "Max Prijs": Number(s.maxPrice.toFixed(2)),
    productCount: s.productCount,
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-green-500" />
          Prijsvergelijking per Competitor
        </CardTitle>
        <CardDescription>
          Gemiddelde, minimum en maximum prijzen van bestsellers
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis 
                type="number" 
                tickFormatter={(value) => `$${value}`}
                domain={[0, 'dataMax']}
              />
              <YAxis 
                type="category" 
                dataKey="name" 
                width={80}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, name]}
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
              />
              <Legend />
              <Bar dataKey="Min Prijs" fill="#22C55E" radius={[0, 2, 2, 0]} />
              <Bar dataKey="Gem. Prijs" fill="#3B82F6" radius={[0, 2, 2, 0]} />
              <Bar dataKey="Max Prijs" fill="#EF4444" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Stats badges */}
        <div className="flex flex-wrap gap-2 mt-4">
          {priceStats.map((stat) => (
            <Badge
              key={stat.competitor}
              variant="outline"
              className="text-xs"
              style={{ borderColor: COMPETITOR_COLORS[stat.competitor] }}
            >
              <span
                className="w-2 h-2 rounded-full mr-1.5"
                style={{ backgroundColor: COMPETITOR_COLORS[stat.competitor] }}
              />
              {COMPETITOR_LABELS[stat.competitor]}: {stat.productCount} producten
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

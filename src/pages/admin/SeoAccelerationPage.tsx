import { Helmet } from "react-helmet-async";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RankingPushDashboard } from "@/components/admin/RankingPushDashboard";
import { CategoryDominanceSprint } from "@/components/admin/CategoryDominanceSprint";
import { Target, Flame } from "lucide-react";

export default function SeoAccelerationPage() {
  return (
    <>
      <Helmet>
        <title>SEO Acceleration Engine | GetPawsy Admin</title>
      </Helmet>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Flame className="w-6 h-6 text-primary" />
            SEO Acceleration Engine
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            GSC-driven ranking push, category dominance sprints, and anchor diversity enforcement.
          </p>
        </div>

        <Tabs defaultValue="push">
          <TabsList>
            <TabsTrigger value="push" className="gap-1.5">
              <Target className="w-3.5 h-3.5" />
              Ranking Push (11-20)
            </TabsTrigger>
            <TabsTrigger value="sprint" className="gap-1.5">
              <Flame className="w-3.5 h-3.5" />
              30-Day Sprint
            </TabsTrigger>
          </TabsList>

          <TabsContent value="push" className="mt-4">
            <RankingPushDashboard />
          </TabsContent>

          <TabsContent value="sprint" className="mt-4">
            <CategoryDominanceSprint />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

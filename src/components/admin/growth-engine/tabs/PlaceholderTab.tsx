import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";

export function PlaceholderTab({ phase, title, description }: { phase: number; title: string; description: string }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{title}</CardTitle>
          <Badge variant="secondary" className="gap-1"><Lock className="h-3 w-3" /> Phase {phase}</Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          This tab activates after Phase {phase} of the Growth Intelligence rollout. The data layer is already prepared.
        </p>
      </CardContent>
    </Card>
  );
}
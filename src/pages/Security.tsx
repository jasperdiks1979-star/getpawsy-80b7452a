import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Shield, 
  ShieldCheck, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  Info,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Clock,
  AlertCircle,
  XCircle,
  Eye,
  EyeOff
} from "lucide-react";
import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useNavigate } from "react-router-dom";
import { useSecurityScan, getSeverityFromLevel, getCategoryFromId, SecurityFinding } from "@/hooks/useSecurityScan";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const getSeverityColor = (level: string) => {
  switch (level) {
    case "error":
      return "bg-red-100 text-red-700 hover:bg-red-100";
    case "warn":
      return "bg-yellow-100 text-yellow-700 hover:bg-yellow-100";
    case "info":
      return "bg-blue-100 text-blue-700 hover:bg-blue-100";
    default:
      return "bg-muted text-muted-foreground";
  }
};

const getSeverityLabel = (level: string) => {
  switch (level) {
    case "error":
      return "Kritiek";
    case "warn":
      return "Waarschuwing";
    case "info":
      return "Info";
    default:
      return level;
  }
};

const getSeverityIcon = (level: string) => {
  switch (level) {
    case "error":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "warn":
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case "info":
      return <Info className="h-4 w-4 text-blue-500" />;
    default:
      return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
  }
};

const FindingCard = ({ 
  finding, 
  isExpanded, 
  onToggle 
}: { 
  finding: SecurityFinding; 
  isExpanded: boolean; 
  onToggle: () => void;
}) => {
  const category = getCategoryFromId(finding.id);
  
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-3">
            {finding.ignore ? (
              <EyeOff className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            ) : (
              getSeverityIcon(finding.level)
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{finding.name}</p>
              <p className="text-sm text-muted-foreground">{category}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {finding.ignore && (
              <Badge variant="outline" className="text-xs">
                Genegeerd
              </Badge>
            )}
            <Badge className={getSeverityColor(finding.level)}>
              {getSeverityLabel(finding.level)}
            </Badge>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className={`mt-2 p-4 rounded-lg space-y-3 ${finding.ignore ? 'bg-muted/30' : finding.level === 'error' ? 'bg-red-50 dark:bg-red-950/20' : finding.level === 'warn' ? 'bg-yellow-50 dark:bg-yellow-950/20' : 'bg-blue-50 dark:bg-blue-950/20'}`}>
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Beschrijving</p>
            <p className="text-sm">{finding.description}</p>
          </div>
          
          {finding.details && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Details & Remediation</p>
              <p className="text-sm">{finding.details}</p>
            </div>
          )}
          
          {finding.ignore_reason && (
            <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded border border-green-200 dark:border-green-800">
              <p className="text-sm font-medium text-green-700 dark:text-green-400 mb-1 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Reden voor negeren
              </p>
              <p className="text-sm text-green-600 dark:text-green-300">{finding.ignore_reason}</p>
            </div>
          )}
          
          {finding.link && (
            <div>
              <a 
                href={finding.link} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                More info
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

const SecurityPage = () => {
  const navigate = useNavigate();
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());
  const { data, isLoading, stats, activeFindings, ignoredFindings, triggerScan } = useSecurityScan();

  const toggleIssue = (id: string) => {
    const newExpanded = new Set(expandedIssues);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIssues(newExpanded);
  };

  const handleScan = () => {
    triggerScan.mutate();
  };

  if (isLoading) {
    return (
      <Layout>
        <Helmet><meta name="robots" content="noindex, follow" /></Helmet>
        <div className="container mx-auto py-8 px-4 max-w-5xl">
          <Skeleton className="h-12 w-64 mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      </Layout>
    );
  }

  const lastScanTime = data?.scanned_at 
    ? format(new Date(data.scanned_at), "d MMM yyyy HH:mm", { locale: nl })
    : "Onbekend";

  return (
    <Layout>
      <Helmet><meta name="robots" content="noindex, follow" /></Helmet>
      <div className="container mx-auto py-8 px-4 max-w-5xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-xl">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Security Overzicht</h1>
              <p className="text-muted-foreground">Automatische RLS & beveiligingsscanning</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={handleScan}
              disabled={triggerScan.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${triggerScan.isPending ? 'animate-spin' : ''}`} />
              {triggerScan.isPending ? 'Scannen...' : 'Scan uitvoeren'}
            </Button>
            <Button variant="outline" onClick={() => navigate("/admin")}>
              ← Terug
            </Button>
          </div>
        </div>

        {/* Last scan info */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Clock className="h-4 w-4" />
          <span>Laatste scan: {lastScanTime}</span>
          {data?.metadata && (
            <span className="text-xs">
              ({data.metadata.supabase?.items_found || 0} Supabase + {data.metadata.supabase_lov?.items_found || 0} Lovable checks)
            </span>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${stats.isSecure ? 'bg-green-100' : 'bg-red-100'}`}>
                  {stats.isSecure ? (
                    <ShieldCheck className="h-5 w-5 text-green-600" />
                  ) : (
                    <ShieldAlert className="h-5 w-5 text-red-600" />
                  )}
                </div>
                <div>
                  <p className={`text-2xl font-bold ${stats.isSecure ? 'text-green-600' : 'text-red-600'}`}>
                    {stats.active}
                  </p>
                  <p className="text-sm text-muted-foreground">Actieve issues</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <XCircle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">{stats.errorCount}</p>
                  <p className="text-sm text-muted-foreground">Kritiek</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-yellow-600">{stats.warnCount}</p>
                  <p className="text-sm text-muted-foreground">Waarschuwingen</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Eye className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">{stats.ignored}</p>
                  <p className="text-sm text-muted-foreground">Genegeerd/Opgelost</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for Active vs Ignored */}
        <Tabs defaultValue="active" className="space-y-4">
          <TabsList>
            <TabsTrigger value="active" className="gap-2">
              <ShieldAlert className="h-4 w-4" />
              Actieve Issues ({stats.active})
            </TabsTrigger>
            <TabsTrigger value="ignored" className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Genegeerd/Opgelost ({stats.ignored})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-yellow-500" />
                  Actieve Security Issues
                </CardTitle>
                <CardDescription>
                  Deze issues vereisen aandacht of monitoring
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeFindings.length === 0 ? (
                  <div className="text-center py-8">
                    <ShieldCheck className="h-12 w-12 text-green-500 mx-auto mb-3" />
                    <p className="text-lg font-medium text-green-600">Geen actieve issues!</p>
                    <p className="text-sm text-muted-foreground">Alle bevindingen zijn gereviewd en genegeerd of opgelost.</p>
                  </div>
                ) : (
                  activeFindings.map((finding) => (
                    <FindingCard
                      key={finding.id}
                      finding={finding}
                      isExpanded={expandedIssues.has(finding.id)}
                      onToggle={() => toggleIssue(finding.id)}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ignored">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Genegeerde/Opgeloste Issues
                </CardTitle>
                <CardDescription>
                  Deze issues zijn gereviewd en gemarkeerd als veilig of opgelost
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {ignoredFindings.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Geen genegeerde issues.</p>
                  </div>
                ) : (
                  ignoredFindings.map((finding) => (
                    <FindingCard
                      key={finding.id}
                      finding={finding}
                      isExpanded={expandedIssues.has(finding.id)}
                      onToggle={() => toggleIssue(finding.id)}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Info Card */}
        <Card className="mt-6">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="text-sm space-y-2">
                <p className="font-medium">Over automatische scanning</p>
                <p className="text-muted-foreground">
                  Deze pagina toont de resultaten van de automatische security scan die RLS policies, 
                  authenticatie-instellingen en data exposure controleert. De scan wordt periodiek uitgevoerd 
                  en kan handmatig worden getriggerd via de "Scan uitvoeren" knop.
                </p>
                <p className="text-muted-foreground">
                  Issues kunnen worden genegeerd als ze "by design" zijn of als de bevinding niet van 
                  toepassing is op de specifieke configuratie van dit project.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default SecurityPage;

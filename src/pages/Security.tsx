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
  ChevronRight
} from "lucide-react";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useNavigate } from "react-router-dom";

interface SecurityIssue {
  id: string;
  name: string;
  severity: "high" | "medium" | "low";
  category: string;
  description: string;
  remediation: string;
  status: "resolved" | "open";
}

const securityIssues: SecurityIssue[] = [
  // Resolved issues
  {
    id: "visitor_activity_exposure",
    name: "Visitor activity location data exposure",
    severity: "high",
    category: "RLS Policy",
    description: "De visitor_activity tabel had een open INSERT policy waardoor willekeurige locatiegegevens konden worden ingevoerd zonder validatie.",
    remediation: "RLS policy toegevoegd die session_id lengte valideert (min 16 chars) en activity_type beperkt tot bekende waarden (browsing, cart, checkout).",
    status: "resolved"
  },
  {
    id: "newsletter_email_validation",
    name: "Newsletter email validation",
    severity: "medium",
    category: "Input Validation",
    description: "Newsletter subscribers konden worden toegevoegd zonder email validatie, wat spam en ongeldige data mogelijk maakte.",
    remediation: "Email regex validatie toegevoegd aan RLS INSERT policy: email moet geldig formaat hebben en max 255 karakters.",
    status: "resolved"
  },
  {
    id: "stock_notification_validation",
    name: "Stock notification email validation",
    severity: "medium",
    category: "Input Validation",
    description: "Stock notifications accepteerden elke email input zonder validatie.",
    remediation: "Dezelfde email validatie toegepast als bij newsletter: regex check en lengte limiet.",
    status: "resolved"
  },
  {
    id: "contact_message_validation",
    name: "Contact message input validation",
    severity: "medium",
    category: "Input Validation",
    description: "Contact formulier had geen server-side validatie voor naam, onderwerp en bericht lengte.",
    remediation: "RLS WITH CHECK constraint toegevoegd: naam 2-100 chars, onderwerp 3-200 chars, bericht 10-5000 chars, email validatie.",
    status: "resolved"
  },
  {
    id: "error_log_size_limits",
    name: "Frontend error log size limits",
    severity: "low",
    category: "Data Integrity",
    description: "Frontend error logs konden ongelimiteerde data bevatten, wat database bloat kon veroorzaken.",
    remediation: "Limieten toegevoegd: error_message max 2000 chars, stack_trace max 10000 chars, error_type max 100 chars.",
    status: "resolved"
  },
  {
    id: "visitor_activity_session_validation",
    name: "Visitor activity session validation",
    severity: "medium",
    category: "Input Validation",
    description: "Session IDs werden niet gevalideerd op minimum lengte.",
    remediation: "Minimum lengte van 16 karakters vereist voor session_id in RLS policy.",
    status: "resolved"
  },
  // Open issues
  {
    id: "leaked_password_protection",
    name: "Leaked Password Protection niet ingeschakeld",
    severity: "medium",
    category: "Authentication",
    description: "De Supabase Auth configuratie heeft Leaked Password Protection niet ingeschakeld. Dit betekent dat gebruikers wachtwoorden kunnen gebruiken die bekend zijn uit datalekken.",
    remediation: "Ga naar de Supabase Dashboard → Authentication → Providers → Email en schakel 'Leaked Password Protection' in. Dit controleert wachtwoorden tegen de HaveIBeenPwned database.",
    status: "open"
  },
  {
    id: "disputes_open_insert",
    name: "Disputes tabel open INSERT policy",
    severity: "low",
    category: "RLS Policy",
    description: "De disputes tabel heeft een open INSERT policy (WITH CHECK true) zodat iedereen een dispute kan aanmaken.",
    remediation: "Dit is by design voor klantenservice - klanten moeten disputes kunnen aanmaken zonder in te loggen. Overweeg rate limiting toe te voegen op de edge function of applicatielaag.",
    status: "open"
  },
  {
    id: "performance_metrics_open_insert",
    name: "Performance metrics open INSERT policy",
    severity: "low",
    category: "RLS Policy",
    description: "Performance metrics kunnen door iedereen worden toegevoegd zonder authenticatie.",
    remediation: "Dit is by design voor Core Web Vitals tracking van anonieme bezoekers. Overweeg validatie toe te voegen voor metric_name en metric_value ranges.",
    status: "open"
  }
];

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case "high":
      return "bg-red-100 text-red-700 hover:bg-red-100";
    case "medium":
      return "bg-yellow-100 text-yellow-700 hover:bg-yellow-100";
    case "low":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
};

const getSeverityLabel = (severity: string) => {
  switch (severity) {
    case "high":
      return "Kritiek";
    case "medium":
      return "Medium";
    case "low":
      return "Laag";
    default:
      return severity;
  }
};

const SecurityIssuePage = () => {
  const navigate = useNavigate();
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());

  const resolvedIssues = securityIssues.filter(i => i.status === "resolved");
  const openIssues = securityIssues.filter(i => i.status === "open");

  const toggleIssue = (id: string) => {
    const newExpanded = new Set(expandedIssues);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIssues(newExpanded);
  };

  const highOpenCount = openIssues.filter(i => i.severity === "high").length;
  const mediumOpenCount = openIssues.filter(i => i.severity === "medium").length;
  const lowOpenCount = openIssues.filter(i => i.severity === "low").length;

  return (
    <Layout>
      <div className="container mx-auto py-8 px-4 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-xl">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Security Overzicht</h1>
              <p className="text-muted-foreground">RLS policies, validatie en beveiligingsstatus</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate("/admin")}>
            ← Terug naar Admin
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <ShieldCheck className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">{resolvedIssues.length}</p>
                  <p className="text-sm text-muted-foreground">Opgelost</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <ShieldAlert className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-yellow-600">{openIssues.length}</p>
                  <p className="text-sm text-muted-foreground">Open</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Info className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="flex gap-1">
                    {highOpenCount > 0 && (
                      <Badge variant="destructive" className="text-xs">{highOpenCount} kritiek</Badge>
                    )}
                    {mediumOpenCount > 0 && (
                      <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100 text-xs">{mediumOpenCount} medium</Badge>
                    )}
                    {lowOpenCount > 0 && (
                      <Badge variant="secondary" className="text-xs">{lowOpenCount} laag</Badge>
                    )}
                    {openIssues.length === 0 && (
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs">Alles veilig</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Status breakdown</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Open Issues */}
        {openIssues.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-yellow-500" />
                Openstaande Issues ({openIssues.length})
              </CardTitle>
              <CardDescription>
                Deze issues vereisen aandacht of zijn by design open
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {openIssues.map((issue) => (
                <Collapsible
                  key={issue.id}
                  open={expandedIssues.has(issue.id)}
                  onOpenChange={() => toggleIssue(issue.id)}
                >
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                        <div>
                          <p className="font-medium">{issue.name}</p>
                          <p className="text-sm text-muted-foreground">{issue.category}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={getSeverityColor(issue.severity)}>
                          {getSeverityLabel(issue.severity)}
                        </Badge>
                        {expandedIssues.has(issue.id) ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 p-4 bg-muted/30 rounded-lg space-y-3">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Beschrijving</p>
                        <p className="text-sm">{issue.description}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Remediation</p>
                        <p className="text-sm">{issue.remediation}</p>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Resolved Issues */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-500" />
              Opgeloste Issues ({resolvedIssues.length})
            </CardTitle>
            <CardDescription>
              Deze beveiligingsproblemen zijn succesvol opgelost
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {resolvedIssues.map((issue) => (
              <Collapsible
                key={issue.id}
                open={expandedIssues.has(issue.id)}
                onOpenChange={() => toggleIssue(issue.id)}
              >
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <div>
                        <p className="font-medium">{issue.name}</p>
                        <p className="text-sm text-muted-foreground">{issue.category}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={getSeverityColor(issue.severity)}>
                        {getSeverityLabel(issue.severity)}
                      </Badge>
                      {expandedIssues.has(issue.id) ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg space-y-3">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Oorspronkelijk probleem</p>
                      <p className="text-sm">{issue.description}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Toegepaste oplossing</p>
                      <p className="text-sm">{issue.remediation}</p>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default SecurityIssuePage;

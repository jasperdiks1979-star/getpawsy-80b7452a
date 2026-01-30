import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, XCircle, Loader2, Search, Bot, User, Shield, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

interface ComparisonResult {
  url: string;
  userResponse: {
    status: number;
    headers: Record<string, string>;
    contentLength: number;
    contentHash: string;
    loadTime: number;
  };
  googlebotResponse: {
    status: number;
    headers: Record<string, string>;
    contentLength: number;
    contentHash: string;
    loadTime: number;
  };
  isIdentical: boolean;
  differences: string[];
}

const UserAgentComparison = () => {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const { toast } = useToast();

  const testUrls = [
    { label: "Homepage", path: "/" },
    { label: "Products", path: "/products" },
    { label: "About", path: "/about" },
    { label: "Contact", path: "/contact" },
    { label: "Technical Declaration", path: "/technical-declaration" },
    { label: "Google Review", path: "/google-review" },
  ];

  const handleCompare = async (testUrl?: string) => {
    const urlToTest = testUrl || url;
    if (!urlToTest) {
      toast({
        title: "URL vereist",
        description: "Voer een URL in of selecteer een testpagina",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("compare-user-agents", {
        body: { url: urlToTest },
      });

      if (error) throw error;

      setResult(data);

      if (data.isIdentical) {
        toast({
          title: "✅ Content is identiek",
          description: "Dezelfde content wordt geserveerd aan alle User-Agents",
        });
      } else {
        toast({
          title: "⚠️ Verschillen gevonden",
          description: `${data.differences.length} verschil(len) gedetecteerd`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Comparison error:", error);
      toast({
        title: "Vergelijking mislukt",
        description: error instanceof Error ? error.message : "Er is een fout opgetreden",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>User-Agent Vergelijking | GetPawsy Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-5xl mx-auto space-y-8">
            {/* Header */}
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center gap-3">
                <Shield className="h-10 w-10 text-primary" />
                <h1 className="text-3xl font-bold">User-Agent Vergelijkingstool</h1>
              </div>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Deze tool verifieert dat GetPawsy.pet identieke content serveert aan zowel 
                reguliere gebruikers als Google crawlers. Dit dient als bewijs tegen 
                cloaking-beschuldigingen.
              </p>
            </div>

            {/* Explanation Card */}
            <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
              <CardContent className="pt-6">
                <div className="flex gap-4">
                  <Globe className="h-6 w-6 text-blue-600 flex-shrink-0 mt-1" />
                  <div className="space-y-2">
                    <h3 className="font-semibold text-blue-900 dark:text-blue-100">Hoe werkt het?</h3>
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      Deze tool maakt twee verzoeken naar dezelfde URL: één met een normale browser 
                      User-Agent en één met de Googlebot User-Agent. De responses worden vergeleken 
                      op statuscode, headers en content hash om te bewijzen dat dezelfde content 
                      wordt geserveerd aan alle bezoekers.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* URL Input */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Test een URL
                </CardTitle>
                <CardDescription>
                  Voer een volledige URL in of selecteer een van de voorgedefinieerde testpagina's
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="https://getpawsy.pet/products"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={() => handleCompare()} disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Testen...
                      </>
                    ) : (
                      "Vergelijken"
                    )}
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {testUrls.map((testUrl) => (
                    <Button
                      key={testUrl.path}
                      variant="outline"
                      size="sm"
                      onClick={() => handleCompare(`https://getpawsy.pet${testUrl.path}`)}
                      disabled={isLoading}
                    >
                      {testUrl.label}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Results */}
            {result && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      {result.isIdentical ? (
                        <CheckCircle2 className="h-6 w-6 text-green-600" />
                      ) : (
                        <XCircle className="h-6 w-6 text-red-600" />
                      )}
                      Resultaat voor {result.url}
                    </CardTitle>
                    <Badge variant={result.isIdentical ? "default" : "destructive"}>
                      {result.isIdentical ? "IDENTIEK" : "VERSCHIL GEVONDEN"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="summary" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="summary">Samenvatting</TabsTrigger>
                      <TabsTrigger value="user">Normale Gebruiker</TabsTrigger>
                      <TabsTrigger value="googlebot">Googlebot</TabsTrigger>
                    </TabsList>

                    <TabsContent value="summary" className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        {/* User Response Summary */}
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <User className="h-4 w-4" />
                              Normale Gebruiker
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Status:</span>
                              <Badge variant={result.userResponse.status === 200 ? "default" : "destructive"}>
                                {result.userResponse.status}
                              </Badge>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Content Length:</span>
                              <span>{result.userResponse.contentLength} bytes</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Laadtijd:</span>
                              <span>{result.userResponse.loadTime}ms</span>
                            </div>
                          </CardContent>
                        </Card>

                        {/* Googlebot Response Summary */}
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Bot className="h-4 w-4" />
                              Googlebot
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Status:</span>
                              <Badge variant={result.googlebotResponse.status === 200 ? "default" : "destructive"}>
                                {result.googlebotResponse.status}
                              </Badge>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Content Length:</span>
                              <span>{result.googlebotResponse.contentLength} bytes</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Laadtijd:</span>
                              <span>{result.googlebotResponse.loadTime}ms</span>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Content Hash Comparison */}
                      <Card className={result.isIdentical ? "bg-green-50 dark:bg-green-950/30" : "bg-red-50 dark:bg-red-950/30"}>
                        <CardContent className="pt-6">
                          <div className="space-y-2">
                            <h4 className="font-semibold">Content Hash Vergelijking</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
                              <div>
                                <span className="text-muted-foreground">User: </span>
                                {result.userResponse.contentHash}
                              </div>
                              <div>
                                <span className="text-muted-foreground">Bot: </span>
                                {result.googlebotResponse.contentHash}
                              </div>
                            </div>
                            {result.isIdentical && (
                              <p className="text-sm text-green-700 dark:text-green-300 mt-2">
                                ✅ De content hashes zijn identiek - dit bewijst dat dezelfde HTML wordt geserveerd.
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Differences */}
                      {result.differences.length > 0 && (
                        <Card className="bg-yellow-50 dark:bg-yellow-950/30">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Gevonden Verschillen</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ul className="list-disc list-inside space-y-1 text-sm">
                              {result.differences.map((diff, index) => (
                                <li key={index}>{diff}</li>
                              ))}
                            </ul>
                          </CardContent>
                        </Card>
                      )}
                    </TabsContent>

                    <TabsContent value="user">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-sm">Response Headers (Normale Gebruiker)</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ScrollArea className="h-[300px]">
                            <pre className="text-xs font-mono bg-muted p-4 rounded-lg">
                              {JSON.stringify(result.userResponse.headers, null, 2)}
                            </pre>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="googlebot">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-sm">Response Headers (Googlebot)</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ScrollArea className="h-[300px]">
                            <pre className="text-xs font-mono bg-muted p-4 rounded-lg">
                              {JSON.stringify(result.googlebotResponse.headers, null, 2)}
                            </pre>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}

            {/* Appeal Evidence Card */}
            <Card className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
              <CardHeader>
                <CardTitle className="text-green-900 dark:text-green-100">
                  📋 Gebruik voor Google Ads Bezwaar
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-green-800 dark:text-green-200 space-y-2">
                <p>
                  De resultaten van deze tool kunnen als bewijs dienen in je Google Ads bezwaar 
                  tegen de cloaking-schorsing. Screenshot de resultaten en voeg ze toe aan je appeal.
                </p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Identieke status codes bewijzen gelijke toegang</li>
                  <li>Identieke content hashes bewijzen dezelfde content</li>
                  <li>X-Robots-Tag headers bewijzen crawler-vriendelijk beleid</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </main>
        <Footer />
      </div>
    </>
  );
};

export default UserAgentComparison;

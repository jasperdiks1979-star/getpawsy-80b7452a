import { useEffect, useState } from "react";
import { HelmetProvider, Helmet } from "react-helmet-async";
import { VisitorWorldMap } from "@/components/admin/VisitorWorldMap";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Share2, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const LiveMap = () => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      setIsAdmin(!!data);
      setIsLoading(false);
    };

    checkAdmin();
  }, [user]);

  const handleShare = async () => {
    const url = window.location.href;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Live Bezoekers Kaart - GetPawsy",
          text: "Bekijk onze live bezoekers wereldkaart!",
          url: url,
        });
      } catch (err) {
        // User cancelled or share failed, fallback to copy
        copyToClipboard(url);
      }
    } else {
      copyToClipboard(url);
    }
  };

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link gekopieerd!");
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <HelmetProvider>
        <Helmet>
          <title>Geen toegang - GetPawsy</title>
        </Helmet>
        <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
          <h2 className="text-2xl font-bold mb-4">Geen toegang</h2>
          <p className="text-muted-foreground mb-6 text-center">
            Je hebt geen toegang tot deze pagina. Log in als beheerder om de live kaart te bekijken.
          </p>
          <div className="flex gap-4">
            <Button asChild variant="outline">
              <Link to="/">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Terug naar home
              </Link>
            </Button>
            <Button asChild>
              <Link to="/auth">Inloggen</Link>
            </Button>
          </div>
        </div>
      </HelmetProvider>
    );
  }

  return (
    <HelmetProvider>
      <Helmet>
        <title>Live Bezoekers Kaart - GetPawsy</title>
        <meta name="robots" content="noindex, follow" />
        <meta name="description" content="Bekijk real-time waar bezoekers onze webshop bezoeken op de wereldkaart." />
      </Helmet>
      
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
          <div className="container flex h-14 items-center justify-between">
            <div className="flex items-center gap-4">
              <Button asChild variant="ghost" size="sm">
                <Link to="/dashboard">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Terug naar Admin
                </Link>
              </Button>
              <h1 className="font-semibold hidden sm:block">Live Bezoekers Kaart</h1>
            </div>
            
            <Button variant="outline" size="sm" onClick={handleShare}>
              {copied ? (
                <>
                  <Check className="w-4 h-4 mr-2 text-green-500" />
                  Gekopieerd
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 mr-2" />
                  Delen
                </>
              )}
            </Button>
          </div>
        </header>

        {/* Map Container */}
        <main className="container py-6">
          <VisitorWorldMap />
        </main>
      </div>
    </HelmetProvider>
  );
};

export default LiveMap;

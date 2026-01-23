import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users } from "lucide-react";

export const LiveVisitorBadge = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [visitorCount, setVisitorCount] = useState(0);

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      setIsAdmin(!!data);
    };

    checkAdmin();
  }, []);

  const fetchVisitorCount = useCallback(async () => {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    
    const { data } = await supabase
      .from("visitor_activity")
      .select("session_id")
      .gte("created_at", fifteenMinutesAgo);

    if (data) {
      const uniqueSessions = new Set(data.map(v => v.session_id));
      setVisitorCount(uniqueSessions.size);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    fetchVisitorCount();

    const channel = supabase
      .channel("visitor-badge-updates")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "visitor_activity" },
        () => fetchVisitorCount()
      )
      .subscribe();

    const interval = setInterval(fetchVisitorCount, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [isAdmin, fetchVisitorCount]);

  if (!isAdmin) return null;

  return (
    <div className="fixed top-20 right-4 z-50 flex items-center gap-1.5 bg-emerald-500 text-white px-2.5 py-1 rounded-full shadow-lg text-xs font-semibold animate-pulse">
      <Users className="h-3.5 w-3.5" />
      <span>{visitorCount}</span>
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
      </span>
    </div>
  );
};

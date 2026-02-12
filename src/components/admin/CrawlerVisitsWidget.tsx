import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Bot, Clock, Globe, RefreshCw, BarChart3, Wifi, WifiOff, Volume2, VolumeX, Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { useEffect, useState, useCallback, useRef } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { useHaptic } from '@/hooks/useHaptic';
import { Smartphone } from 'lucide-react';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';
type NotificationMode = 'sound' | 'vibrate' | 'notification' | 'off';

interface CrawlerVisit {
  id: string;
  page_url: string;
  user_agent: string;
  is_googlebot: boolean;
  bot_type: string | null;
  ip_address: string | null;
  referrer: string | null;
  created_at: string;
}

const STORAGE_KEY = 'crawler-notification-mode';

// Notification sound (short alert beep - base64 encoded)
const ALERT_SOUND = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYZNzBQcAAAAAAD/+1DEAAAGAAGn9AAAIwwAM/8AAAEnqBWe5jnOc5znP/znP/znOdACAIAgCEMYxiIIg/8QBD5znf+c5wQBD//+EAQdn//5znOc5wQBA4AAAA+sQADThADOcAGIYBiGQZhCOY7OP/zhAEHZ//wgCDs4QB/8IAgcAAB/5znOc7OEATOP/zhAEP//EAQOAAAf/nOc5znZwgCHAAAP/nOc5znBAEHZ//wgCB2cIA/+EAQdnCAJ8IAn//+XJIAAAAATEY3Aw';

// Live indicator component
const LiveIndicator = ({ status }: { status: ConnectionStatus }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <div className="flex items-center cursor-default">
        {status === 'connected' ? (
          <>
            <Wifi className="h-3.5 w-3.5 text-green-500" />
            <span className="relative flex h-2 w-2 ml-0.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
          </>
        ) : status === 'connecting' ? (
          <Wifi className="h-3.5 w-3.5 text-muted-foreground animate-pulse" />
        ) : (
          <WifiOff className="h-3.5 w-3.5 text-destructive" />
        )}
      </div>
    </TooltipTrigger>
    <TooltipContent side="bottom" className="text-xs">
      {status === 'connected' ? 'Live updates actief' : status === 'connecting' ? 'Verbinden...' : 'Verbinding verbroken'}
    </TooltipContent>
  </Tooltip>
);

// Notification toggle component
const NotificationToggle = ({ 
  mode, 
  onToggle,
  vibrateSupported
}: { 
  mode: NotificationMode; 
  onToggle: () => void;
  vibrateSupported: boolean;
}) => {
  const getIcon = () => {
    switch (mode) {
      case 'sound':
        return <Volume2 className="h-4 w-4 text-emerald-500" />;
      case 'vibrate':
        return <Smartphone className="h-4 w-4 text-orange-500" />;
      case 'notification':
        return <Bell className="h-4 w-4 text-blue-500" />;
      case 'off':
        return <VolumeX className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getLabel = () => {
    switch (mode) {
      case 'sound':
        return 'Geluid aan';
      case 'vibrate':
        return vibrateSupported ? 'Vibratie aan' : 'Vibratie (niet ondersteund)';
      case 'notification':
        return 'Browser notificatie';
      case 'off':
        return 'Notificaties uit';
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="sm" onClick={onToggle}>
          {getIcon()}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {getLabel()} — klik om te wisselen
      </TooltipContent>
    </Tooltip>
  );
};

export const CrawlerVisitsWidget = () => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [notificationMode, setNotificationMode] = useState<NotificationMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored as NotificationMode) || 'sound';
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastVisitIdRef = useRef<string | null>(null);
  const haptic = useHaptic();
  
  const { data: visits, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['crawler-visits'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crawler_visits')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as CrawlerVisit[];
    },
  });

  // Initialize audio
  useEffect(() => {
    audioRef.current = new Audio(ALERT_SOUND);
    audioRef.current.volume = 0.5;
  }, []);

  // Toggle notification mode
  const toggleNotificationMode = useCallback(async () => {
    const modes: NotificationMode[] = ['sound', 'vibrate', 'notification', 'off'];
    const currentIndex = modes.indexOf(notificationMode);
    let nextMode = modes[(currentIndex + 1) % modes.length];

    // If switching to vibrate mode, check support
    if (nextMode === 'vibrate' && !haptic.isSupported) {
      toast.info('Vibratie niet ondersteund op dit apparaat');
      // Still allow selecting it, but it won't do anything
    }

    // If switching to browser notification, request permission
    if (nextMode === 'notification') {
      if (!('Notification' in window)) {
        toast.error('Browser notificaties worden niet ondersteund');
        nextMode = 'off';
      } else if (Notification.permission === 'denied') {
        toast.error('Browser notificaties zijn geblokkeerd');
        nextMode = 'off';
      } else if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          toast.info('Notificatie permissie niet verleend');
          nextMode = 'off';
        }
      }
    }

    setNotificationMode(nextMode);
    localStorage.setItem(STORAGE_KEY, nextMode);

    const modeLabels: Record<NotificationMode, string> = {
      sound: 'Geluid notificatie',
      vibrate: 'Vibratie notificatie',
      notification: 'Browser notificatie',
      off: 'Notificaties uit'
    };
    toast.success(modeLabels[nextMode]);
  }, [notificationMode, haptic.isSupported]);

  // Play sound notification
  const playSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        // Audio play failed (user hasn't interacted with page yet)
      });
    }
  }, []);

  // Show browser notification
  const showBrowserNotification = useCallback((visit: CrawlerVisit) => {
    if (Notification.permission === 'granted') {
      const notification = new Notification('🤖 Googlebot Bezoek!', {
        body: `${visit.bot_type || 'Googlebot'} heeft ${visit.page_url} bezocht`,
        icon: '/favicon.ico',
        tag: 'googlebot-visit',
        requireInteraction: false,
      });

      setTimeout(() => notification.close(), 5000);
    }
  }, []);

  // Handle new Googlebot visit
  const handleNewGooglebotVisit = useCallback((visit: CrawlerVisit) => {
    if (notificationMode === 'sound') {
      playSound();
    } else if (notificationMode === 'vibrate') {
      haptic.success(); // Use success pattern for Googlebot visits
    } else if (notificationMode === 'notification') {
      showBrowserNotification(visit);
    }

    // Always show toast for Googlebot visits
    toast.success(`🤖 ${visit.bot_type || 'Googlebot'} bezoekt ${visit.page_url}`, {
      duration: 5000,
    });
  }, [notificationMode, playSound, haptic, showBrowserNotification]);

  // Handle realtime update with notification
  const handleRealtimeUpdate = useCallback((payload: { new: CrawlerVisit }) => {
    const newVisit = payload.new;
    
    // Only notify for new Googlebot visits
    if (newVisit.is_googlebot && newVisit.id !== lastVisitIdRef.current) {
      lastVisitIdRef.current = newVisit.id;
      handleNewGooglebotVisit(newVisit);
    }
    
    refetch();
  }, [refetch, handleNewGooglebotVisit]);

  // Realtime subscription
  useEffect(() => {
    setConnectionStatus('connecting');

    const channel = supabase
      .channel('crawler-visits-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'crawler_visits',
        },
        handleRealtimeUpdate as any
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('connected');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnectionStatus('disconnected');
        } else if (status === 'CLOSED') {
          setConnectionStatus('disconnected');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [handleRealtimeUpdate]);

  // Set initial last visit ID to prevent notification on first load
  useEffect(() => {
    if (visits && visits.length > 0 && !lastVisitIdRef.current) {
      lastVisitIdRef.current = visits[0].id;
    }
  }, [visits]);

  const googlebotVisits = visits?.filter(v => v.is_googlebot) || [];
  const otherBotVisits = visits?.filter(v => !v.is_googlebot && v.bot_type) || [];

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Crawler Bezoeken</CardTitle>
            <LiveIndicator status={connectionStatus} />
          </div>
          <div className="flex items-center gap-2">
            <NotificationToggle mode={notificationMode} onToggle={toggleNotificationMode} vibrateSupported={haptic.isSupported} />
            <Link to="/dashboard/crawler-analytics">
              <Button variant="outline" size="sm">
                <BarChart3 className="h-4 w-4 mr-1" />
                Analytics
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isRefetching}
            >
              <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
      <CardContent>
        {/* Stats Overview */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <Bot className="h-4 w-4" />
              <span className="text-sm font-medium">Googlebot</span>
            </div>
            <p className="text-2xl font-bold mt-1">{googlebotVisits.length}</p>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
              <Globe className="h-4 w-4" />
              <span className="text-sm font-medium">Andere Bots</span>
            </div>
            <p className="text-2xl font-bold mt-1">{otherBotVisits.length}</p>
          </div>
        </div>

        {/* Visits Table */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Laden...
          </div>
        ) : visits && visits.length > 0 ? (
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tijd</TableHead>
                  <TableHead>Pagina</TableHead>
                  <TableHead>Bot Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visits.map((visit) => (
                  <TableRow key={visit.id}>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {format(new Date(visit.created_at), 'dd MMM HH:mm', { locale: nl })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {visit.page_url}
                      </code>
                    </TableCell>
                    <TableCell>
                      {visit.is_googlebot ? (
                        <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-600">
                          {visit.bot_type || 'Googlebot'}
                        </Badge>
                      ) : visit.bot_type ? (
                        <Badge variant="secondary">
                          {visit.bot_type}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Nog geen crawler bezoeken geregistreerd</p>
          </div>
        )}

        {/* Latest Googlebot Visit Highlight */}
        {googlebotVisits.length > 0 && (
          <div className="mt-4 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-emerald-600 dark:text-emerald-400">Laatste Googlebot bezoek:</span>{' '}
              {format(new Date(googlebotVisits[0].created_at), "d MMMM yyyy 'om' HH:mm:ss", { locale: nl })}
              {' — '}
              <code className="text-xs">{googlebotVisits[0].page_url}</code>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
    </TooltipProvider>
  );
};

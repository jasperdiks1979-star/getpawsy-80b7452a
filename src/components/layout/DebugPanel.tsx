import { useState, useEffect, forwardRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bug, ChevronDown, ChevronUp, Trash2, RefreshCw, Wrench, CheckCircle, Database } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { triggerManualHealing } from '@/lib/data-healer';

interface StorageInfo {
  key: string;
  size: string;
  type: string;
  preview: string;
}

interface HealingStatus {
  lastRun: string | null;
  corruptedFixed: number;
  isRunning: boolean;
}

interface CleanupStatus {
  lastRun: string | null;
  deletedCount: number;
  isRunning: boolean;
}

export const DebugPanel = () => {
  const [searchParams] = useSearchParams();
  const [isExpanded, setIsExpanded] = useState(false);
  const [storageData, setStorageData] = useState<StorageInfo[]>([]);
  const [healingStatus, setHealingStatus] = useState<HealingStatus>({
    lastRun: null,
    corruptedFixed: 0,
    isRunning: false,
  });
  const [cleanupStatus, setCleanupStatus] = useState<CleanupStatus>({
    lastRun: null,
    deletedCount: 0,
    isRunning: false,
  });
  const [sessionInfo, setSessionInfo] = useState({
    userAgent: '',
    platform: '',
    language: '',
    cookiesEnabled: false,
    onLine: true,
    memory: '',
  });

  const isDebugMode = searchParams.get('debug') === 'true';

  const getStorageSize = (value: string): string => {
    const bytes = new Blob([value]).size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getValueType = (value: string): string => {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return 'array';
      if (typeof parsed === 'object' && parsed !== null) return 'object';
      return typeof parsed;
    } catch {
      return 'string';
    }
  };

  const getPreview = (value: string): string => {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return `[${parsed.length} items]`;
      if (typeof parsed === 'object' && parsed !== null) {
        const keys = Object.keys(parsed);
        return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}}`;
      }
      return String(parsed).substring(0, 50);
    } catch {
      return value.substring(0, 50);
    }
  };

  const refreshData = () => {
    // Collect localStorage data
    const storage: StorageInfo[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key) || '';
        storage.push({
          key,
          size: getStorageSize(value),
          type: getValueType(value),
          preview: getPreview(value),
        });
      }
    }
    setStorageData(storage);

    // Collect session info
    const nav = navigator as Navigator & { deviceMemory?: number };
    setSessionInfo({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      cookiesEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      memory: nav.deviceMemory ? `${nav.deviceMemory} GB` : 'N/A',
    });
  };

  useEffect(() => {
    if (isDebugMode) {
      refreshData();
    }
  }, [isDebugMode]);

  const clearStorageItem = (key: string) => {
    localStorage.removeItem(key);
    refreshData();
  };

  const clearAllStorage = () => {
    localStorage.clear();
    refreshData();
  };

  if (!isDebugMode) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-background border-2 border-primary rounded-lg shadow-xl overflow-hidden"
      >
        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between p-3 bg-primary/10 hover:bg-primary/20 transition-colors"
        >
          <div className="flex items-center gap-2 text-primary font-semibold">
            <Bug className="w-5 h-5" />
            <span>Debug Panel</span>
          </div>
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-primary" />
          ) : (
            <ChevronUp className="w-5 h-5 text-primary" />
          )}
        </button>

        {/* Content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
                {/* Session Info */}
                <div>
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    📱 Device Info
                  </h4>
                  <div className="text-xs space-y-1 bg-muted/50 p-2 rounded">
                    <p><span className="text-muted-foreground">Platform:</span> {sessionInfo.platform}</p>
                    <p><span className="text-muted-foreground">Language:</span> {sessionInfo.language}</p>
                    <p><span className="text-muted-foreground">Memory:</span> {sessionInfo.memory}</p>
                    <p><span className="text-muted-foreground">Online:</span> {sessionInfo.onLine ? '✅' : '❌'}</p>
                    <p><span className="text-muted-foreground">Cookies:</span> {sessionInfo.cookiesEnabled ? '✅' : '❌'}</p>
                    <p className="break-all"><span className="text-muted-foreground">UA:</span> {sessionInfo.userAgent.substring(0, 100)}...</p>
                  </div>
                </div>

                {/* localStorage */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                      💾 LocalStorage ({storageData.length} items)
                    </h4>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={refreshData}
                        className="h-6 w-6 p-0"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={clearAllStorage}
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  
                  {storageData.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No localStorage data</p>
                  ) : (
                    <div className="space-y-1">
                      {storageData.map((item) => (
                        <div
                          key={item.key}
                          className="text-xs bg-muted/50 p-2 rounded flex items-start justify-between gap-2"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-mono font-semibold truncate">{item.key}</p>
                            <p className="text-muted-foreground">
                              <span className="inline-block px-1 py-0.5 bg-primary/10 rounded text-[10px] mr-1">
                                {item.type}
                              </span>
                              {item.size} • {item.preview}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => clearStorageItem(item.key)}
                            className="h-5 w-5 p-0 text-destructive hover:text-destructive shrink-0"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quick Actions */}
                <div>
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    ⚡ Quick Actions
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        localStorage.clear();
                        window.location.reload();
                      }}
                      className="text-xs h-7"
                    >
                      Clear & Reload
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        console.log('=== Debug Dump ===');
                        console.log('Session:', sessionInfo);
                        console.log('Storage:', storageData);
                        for (let i = 0; i < localStorage.length; i++) {
                          const key = localStorage.key(i);
                          if (key) {
                            try {
                              console.log(key, JSON.parse(localStorage.getItem(key) || ''));
                            } catch {
                              console.log(key, localStorage.getItem(key));
                            }
                          }
                        }
                      }}
                      className="text-xs h-7"
                    >
                      Dump to Console
                    </Button>
                  </div>
                </div>

                {/* Self-Healing Status */}
                <div className="bg-emerald-500/10 border border-emerald-500/30 p-2 rounded">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-sm flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                      <Wrench className="w-4 h-4" />
                      Self-Healing Data
                    </h4>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setHealingStatus(prev => ({ ...prev, isRunning: true }));
                        const report = triggerManualHealing();
                        setHealingStatus({
                          lastRun: new Date().toLocaleTimeString(),
                          corruptedFixed: report.fixedKeys,
                          isRunning: false,
                        });
                        refreshData();
                      }}
                      disabled={healingStatus.isRunning}
                      className="h-6 px-2 text-xs"
                    >
                      {healingStatus.isRunning ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        'Run Now'
                      )}
                    </Button>
                  </div>
                  <div className="text-xs space-y-1">
                    {healingStatus.lastRun ? (
                      <>
                        <p className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3 text-emerald-500" />
                          Last run: {healingStatus.lastRun}
                        </p>
                        <p className="text-muted-foreground">
                          Fixed: {healingStatus.corruptedFixed} corrupted keys
                        </p>
                      </>
                    ) : (
                      <p className="text-muted-foreground">
                        Auto-healing runs on page load and every 5 minutes
                      </p>
                    )}
                  </div>
                </div>

                {/* Visitor Data Cleanup */}
                <div className="bg-blue-500/10 border border-blue-500/30 p-2 rounded">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-sm flex items-center gap-2 text-blue-700 dark:text-blue-400">
                      <Database className="w-4 h-4" />
                      Visitor Data Cleanup
                    </h4>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        setCleanupStatus(prev => ({ ...prev, isRunning: true }));
                        try {
                          // Delete old preview data (before domain filtering was implemented)
                          const { data, error } = await supabase
                            .from('visitor_activity')
                            .delete()
                            .lt('created_at', '2025-01-27T00:00:00+00:00')
                            .select('id');
                          
                          if (error) throw error;
                          
                          setCleanupStatus({
                            lastRun: new Date().toLocaleTimeString(),
                            deletedCount: data?.length || 0,
                            isRunning: false,
                          });
                        } catch (err) {
                          console.error('Cleanup failed:', err);
                          setCleanupStatus(prev => ({ ...prev, isRunning: false }));
                        }
                      }}
                      disabled={cleanupStatus.isRunning}
                      className="h-6 px-2 text-xs"
                    >
                      {cleanupStatus.isRunning ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        'Cleanup'
                      )}
                    </Button>
                  </div>
                  <div className="text-xs space-y-1">
                    {cleanupStatus.lastRun ? (
                      <>
                        <p className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3 text-blue-500" />
                          Laatste cleanup: {cleanupStatus.lastRun}
                        </p>
                        <p className="text-muted-foreground">
                          Verwijderd: {cleanupStatus.deletedCount} preview records
                        </p>
                      </>
                    ) : (
                      <p className="text-muted-foreground">
                        Verwijdert oude preview/test data van vóór domein-filtering
                      </p>
                    )}
                  </div>
                </div>

                {/* React #310 Info */}
                <div className="bg-amber-500/10 border border-amber-500/30 p-2 rounded text-xs">
                  <p className="font-semibold text-amber-700 dark:text-amber-400 mb-1">
                    🔍 React #310 Debug Tips
                  </p>
                  <ul className="text-muted-foreground space-y-0.5 list-disc list-inside">
                    <li>Self-healing auto-repairs corrupted data</li>
                    <li>Check for objects in localStorage above</li>
                    <li>Clear suspicious items and reload</li>
                  </ul>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

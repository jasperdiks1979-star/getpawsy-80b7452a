import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Bug, RefreshCw, Trash2, Clock, Globe, Smartphone, TrendingUp, Filter, X } from 'lucide-react';
import { toast } from 'sonner';
import { format, subDays, startOfDay, eachDayOfInterval, isAfter, isBefore, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, Legend } from 'recharts';

interface ErrorLog {
  id: string;
  error_type: string;
  error_message: string;
  component_name: string | null;
  stack_trace: string | null;
  page_url: string | null;
  user_agent: string | null;
  session_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface ChartDataPoint {
  date: string;
  displayDate: string;
  total: number;
  react310: number;
  other: number;
}

interface ErrorTypeData {
  name: string;
  count: number;
  color: string;
}

type DeviceFilter = 'all' | 'iOS' | 'Android' | 'Windows' | 'Mac' | 'Other';
type DateFilter = 'all' | 'today' | '7days' | '30days';

const ERROR_TYPE_COLORS: Record<string, string> = {
  'REACT_310': 'hsl(var(--destructive))',
  'NETWORK': 'hsl(var(--primary))',
  'TYPE_ERROR': 'hsl(var(--secondary))',
  'REFERENCE_ERROR': 'hsl(var(--accent))',
  'UNKNOWN': 'hsl(var(--muted-foreground))',
};

const getDeviceType = (userAgent: string | null): string => {
  if (!userAgent) return 'Unknown';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iOS';
  if (/Android/i.test(userAgent)) return 'Android';
  if (/Windows/i.test(userAgent)) return 'Windows';
  if (/Mac/i.test(userAgent)) return 'Mac';
  return 'Other';
};

export const ErrorLogsManager = () => {
  const [selectedError, setSelectedError] = useState<ErrorLog | null>(null);
  const [errorTypeFilter, setErrorTypeFilter] = useState<string>('all');
  const [deviceFilter, setDeviceFilter] = useState<DeviceFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');

  const { data: errorLogs, isLoading, refetch } = useQuery({
    queryKey: ['frontend-error-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('frontend_error_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      return data as ErrorLog[];
    },
  });

  // Get unique error types for filter
  const errorTypes = useMemo(() => {
    if (!errorLogs) return [];
    const types = [...new Set(errorLogs.map(log => log.error_type))];
    return types.sort();
  }, [errorLogs]);

  // Filter logs based on selected filters
  const filteredLogs = useMemo(() => {
    if (!errorLogs) return [];

    return errorLogs.filter((log) => {
      // Error type filter
      if (errorTypeFilter !== 'all' && log.error_type !== errorTypeFilter) {
        return false;
      }

      // Device filter
      if (deviceFilter !== 'all') {
        const device = getDeviceType(log.user_agent);
        if (device !== deviceFilter) {
          return false;
        }
      }

      // Date filter
      if (dateFilter !== 'all') {
        const logDate = new Date(log.created_at);
        const now = new Date();
        const todayStart = startOfDay(now);

        switch (dateFilter) {
          case 'today':
            if (isBefore(logDate, todayStart)) return false;
            break;
          case '7days':
            if (isBefore(logDate, subDays(now, 7))) return false;
            break;
          case '30days':
            if (isBefore(logDate, subDays(now, 30))) return false;
            break;
        }
      }

      return true;
    });
  }, [errorLogs, errorTypeFilter, deviceFilter, dateFilter]);

  const hasActiveFilters = errorTypeFilter !== 'all' || deviceFilter !== 'all' || dateFilter !== 'all';

  const clearFilters = () => {
    setErrorTypeFilter('all');
    setDeviceFilter('all');
    setDateFilter('all');
  };

  // Calculate trends data for chart
  const trendsData = useMemo((): ChartDataPoint[] => {
    if (!errorLogs) return [];

    const days = 7;
    const today = startOfDay(new Date());
    const startDate = subDays(today, days - 1);

    const interval = eachDayOfInterval({ start: startDate, end: today });

    return interval.map((day) => {
      const dayStart = startOfDay(day);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const dayLogs = errorLogs.filter((log) => {
        const logDate = new Date(log.created_at);
        return logDate >= dayStart && logDate < dayEnd;
      });

      const react310 = dayLogs.filter((l) => l.error_type === 'REACT_310').length;
      const total = dayLogs.length;

      return {
        date: format(day, 'yyyy-MM-dd'),
        displayDate: format(day, 'EEE d', { locale: nl }),
        total,
        react310,
        other: total - react310,
      };
    });
  }, [errorLogs]);

  // Calculate error types distribution (using filtered logs)
  const errorTypeData = useMemo((): ErrorTypeData[] => {
    if (!filteredLogs) return [];

    const counts: Record<string, number> = {};
    filteredLogs.forEach((log) => {
      counts[log.error_type] = (counts[log.error_type] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([name, count]) => ({
        name,
        count,
        color: ERROR_TYPE_COLORS[name] || 'hsl(var(--muted-foreground))',
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredLogs]);

  const handleClearOldLogs = async () => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const { error } = await supabase
      .from('frontend_error_logs')
      .delete()
      .lt('created_at', oneWeekAgo.toISOString());

    if (error) {
      toast.error('Fout bij verwijderen logs');
    } else {
      toast.success('Oude logs verwijderd');
      refetch();
    }
  };

  const getErrorTypeBadge = (type: string) => {
    const variants: Record<string, 'destructive' | 'secondary' | 'default' | 'outline'> = {
      'REACT_310': 'destructive',
      'NETWORK': 'secondary',
      'TYPE_ERROR': 'default',
      'REFERENCE_ERROR': 'default',
      'UNKNOWN': 'outline',
    };
    return variants[type] || 'outline';
  };

  const react310Count = filteredLogs?.filter(e => e.error_type === 'REACT_310').length || 0;
  const totalCount = filteredLogs?.length || 0;
  const allCount = errorLogs?.length || 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="w-5 h-5" />
            Filters
            {hasActiveFilters && (
              <Badge variant="secondary" className="ml-2">
                {[errorTypeFilter !== 'all', deviceFilter !== 'all', dateFilter !== 'all'].filter(Boolean).length} actief
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            {/* Error Type Filter */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Error Type</label>
              <Select value={errorTypeFilter} onValueChange={setErrorTypeFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Alle types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle types</SelectItem>
                  {errorTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Device Filter */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Device</label>
              <Select value={deviceFilter} onValueChange={(v) => setDeviceFilter(v as DeviceFilter)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Alle devices" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle devices</SelectItem>
                  <SelectItem value="iOS">iOS</SelectItem>
                  <SelectItem value="Android">Android</SelectItem>
                  <SelectItem value="Windows">Windows</SelectItem>
                  <SelectItem value="Mac">Mac</SelectItem>
                  <SelectItem value="Other">Overig</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date Filter */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Periode</label>
              <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Alle tijd" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle tijd</SelectItem>
                  <SelectItem value="today">Vandaag</SelectItem>
                  <SelectItem value="7days">Laatste 7 dagen</SelectItem>
                  <SelectItem value="30days">Laatste 30 dagen</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-10">
                <X className="w-4 h-4 mr-1" />
                Wis filters
              </Button>
            )}

            {/* Results count */}
            <div className="ml-auto text-sm text-muted-foreground">
              {totalCount} van {allCount} errors
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Gefilterde Errors</CardDescription>
            <CardTitle className="text-3xl">{totalCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card className={react310Count > 0 ? 'border-destructive' : ''}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Bug className="w-4 h-4" />
              React #310 Errors
            </CardDescription>
            <CardTitle className="text-3xl text-destructive">{react310Count}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Acties</CardDescription>
            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Vernieuwen
              </Button>
              <Button size="sm" variant="destructive" onClick={handleClearOldLogs}>
                <Trash2 className="w-4 h-4 mr-2" />
                Opruimen
              </Button>
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Error Trends Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Error Trends (afgelopen 7 dagen)
          </CardTitle>
          <CardDescription>Overzicht van errors per dag</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendsData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorReact310" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="displayDate" 
                  className="text-xs fill-muted-foreground"
                  tick={{ fontSize: 12 }}
                />
                <YAxis 
                  className="text-xs fill-muted-foreground"
                  tick={{ fontSize: 12 }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="other"
                  name="Andere Errors"
                  stackId="1"
                  stroke="hsl(var(--primary))"
                  fill="url(#colorTotal)"
                />
                <Area
                  type="monotone"
                  dataKey="react310"
                  name="React #310"
                  stackId="1"
                  stroke="hsl(var(--destructive))"
                  fill="url(#colorReact310)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Error Types Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Error Types Verdeling</CardTitle>
            <CardDescription>Aantal per error type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={errorTypeData} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" className="text-xs fill-muted-foreground" allowDecimals={false} />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    className="text-xs fill-muted-foreground"
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="count" name="Aantal">
                    {errorTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Error List */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Gefilterde Errors</CardTitle>
            <CardDescription>
              {totalCount} errors {hasActiveFilters ? '(gefilterd)' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-[400px] overflow-y-auto">
            {filteredLogs?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{hasActiveFilters ? 'Geen errors met deze filters' : 'Geen errors gevonden'}</p>
                {hasActiveFilters && (
                  <Button variant="link" onClick={clearFilters} className="mt-2">
                    Wis filters
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredLogs?.slice(0, 50).map((log) => (
                  <div
                    key={log.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 ${
                      selectedError?.id === log.id ? 'bg-muted border-primary' : ''
                    }`}
                    onClick={() => setSelectedError(log)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={getErrorTypeBadge(log.error_type)}>
                            {log.error_type}
                          </Badge>
                          {log.component_name && (
                            <span className="text-xs text-muted-foreground truncate">
                              {log.component_name}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-foreground line-clamp-2">
                          {log.error_message}
                        </p>
                      </div>
                      <div className="flex flex-col items-end text-xs text-muted-foreground shrink-0">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(new Date(log.created_at), 'HH:mm', { locale: nl })}
                        </span>
                        <span>{format(new Date(log.created_at), 'd MMM', { locale: nl })}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Error Details */}
      {selectedError && (
        <Card>
          <CardHeader>
            <CardTitle>Error Details</CardTitle>
            <CardDescription>Geselecteerde error informatie</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-1">Type</h4>
                  <Badge variant={getErrorTypeBadge(selectedError.error_type)}>
                    {selectedError.error_type}
                  </Badge>
                </div>

                <div>
                  <h4 className="font-medium mb-1">Bericht</h4>
                  <p className="text-sm bg-muted p-3 rounded-lg break-words">
                    {selectedError.error_message}
                  </p>
                </div>

                {selectedError.component_name && (
                  <div>
                    <h4 className="font-medium mb-1">Component</h4>
                    <code className="text-sm bg-muted px-2 py-1 rounded">
                      {selectedError.component_name}
                    </code>
                  </div>
                )}

                {selectedError.page_url && (
                  <div>
                    <h4 className="font-medium mb-1 flex items-center gap-2">
                      <Globe className="w-4 h-4" /> URL
                    </h4>
                    <p className="text-sm text-muted-foreground break-all">
                      {selectedError.page_url}
                    </p>
                  </div>
                )}

                <div>
                  <h4 className="font-medium mb-1 flex items-center gap-2">
                    <Smartphone className="w-4 h-4" /> Device
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {getDeviceType(selectedError.user_agent)}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {selectedError.stack_trace && (
                  <div>
                    <h4 className="font-medium mb-1">Stack Trace</h4>
                    <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto max-h-40">
                      {selectedError.stack_trace}
                    </pre>
                  </div>
                )}

                {selectedError.metadata && Object.keys(selectedError.metadata).length > 0 && (
                  <div>
                    <h4 className="font-medium mb-1">Metadata</h4>
                    <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto max-h-40">
                      {JSON.stringify(selectedError.metadata, null, 2)}
                    </pre>
                  </div>
                )}

                <div className="text-xs text-muted-foreground pt-2 border-t">
                  <p>Session ID: {selectedError.session_id || 'N/A'}</p>
                  <p>Timestamp: {format(new Date(selectedError.created_at), 'PPpp', { locale: nl })}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ErrorLogsManager;

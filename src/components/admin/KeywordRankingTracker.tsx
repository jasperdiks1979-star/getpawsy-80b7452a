import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Plus, TrendingUp, TrendingDown, Minus, Search, History, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface KeywordRanking {
  id: string;
  keyword: string;
  position: number | null;
  clicks: number;
  impressions: number;
  ctr: number | null;
  tracked_date: string;
}

interface WatchlistItem {
  id: string;
  keyword: string;
  is_active: boolean;
  created_at: string;
}

export const KeywordRankingTracker = () => {
  const [newKeyword, setNewKeyword] = useState('');
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch top keywords
  const { data: topKeywords, isLoading: loadingTop } = useQuery({
    queryKey: ['top-keywords'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fetch-keyword-rankings', {
        body: { action: 'get_top_keywords' },
      });
      if (error) throw error;
      return data.keywords as KeywordRanking[];
    },
  });

  // Fetch watchlist
  const { data: watchlist } = useQuery({
    queryKey: ['keyword-watchlist'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('keyword_watchlist')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as WatchlistItem[];
    },
  });

  // Fetch keyword history
  const { data: keywordHistory, isLoading: loadingHistory } = useQuery({
    queryKey: ['keyword-history', selectedKeyword],
    queryFn: async () => {
      if (!selectedKeyword) return [];
      const { data, error } = await supabase.functions.invoke('fetch-keyword-rankings', {
        body: { action: 'get_history', keyword: selectedKeyword },
      });
      if (error) throw error;
      return data.history as KeywordRanking[];
    },
    enabled: !!selectedKeyword,
  });

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('fetch-keyword-rankings', {
        body: { action: 'sync' },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Synced ${data.count} keywords from Google Search Console`);
      queryClient.invalidateQueries({ queryKey: ['top-keywords'] });
    },
    onError: (error: Error) => {
      toast.error(`Sync failed: ${error.message}`);
    },
  });

  // Add keyword mutation
  const addKeywordMutation = useMutation({
    mutationFn: async (keyword: string) => {
      const { data, error } = await supabase.functions.invoke('fetch-keyword-rankings', {
        body: { action: 'add_keyword', keyword },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Keyword added to watchlist');
      setNewKeyword('');
      queryClient.invalidateQueries({ queryKey: ['keyword-watchlist'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Remove keyword mutation
  const removeKeywordMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('keyword_watchlist')
        .update({ is_active: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Keyword removed');
      queryClient.invalidateQueries({ queryKey: ['keyword-watchlist'] });
    },
  });

  const getPositionBadge = (position: number | null) => {
    if (!position) return <Badge variant="secondary">-</Badge>;
    if (position <= 3) return <Badge className="bg-yellow-500">#{position.toFixed(1)}</Badge>;
    if (position <= 10) return <Badge className="bg-green-500">#{position.toFixed(1)}</Badge>;
    if (position <= 20) return <Badge className="bg-blue-500">#{position.toFixed(1)}</Badge>;
    return <Badge variant="secondary">#{position.toFixed(1)}</Badge>;
  };

  const formatCTR = (ctr: number | null) => {
    if (!ctr) return '0%';
    return `${(ctr * 100).toFixed(2)}%`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Keyword Ranking Tracker</h2>
          <p className="text-muted-foreground">Track Google rankings for getpawsy.pet in USA</p>
        </div>
        <Button 
          onClick={() => syncMutation.mutate()} 
          disabled={syncMutation.isPending}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          Sync from GSC
        </Button>
      </div>

      {/* Top 10 Keywords */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Top 10 Best Ranking Keywords (USA)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingTop ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : topKeywords && topKeywords.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Keyword</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Clicks</TableHead>
                  <TableHead>Impressions</TableHead>
                  <TableHead>CTR</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topKeywords.map((kw, index) => (
                  <TableRow key={kw.id}>
                    <TableCell className="font-medium">#{index + 1}</TableCell>
                    <TableCell className="font-medium">{kw.keyword}</TableCell>
                    <TableCell>{getPositionBadge(kw.position)}</TableCell>
                    <TableCell>{kw.clicks}</TableCell>
                    <TableCell>{kw.impressions}</TableCell>
                    <TableCell>{formatCTR(kw.ctr)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedKeyword(kw.keyword)}
                      >
                        <History className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No ranking data yet. Click "Sync from GSC" to fetch data.</p>
              <p className="text-sm mt-2">
                Make sure your Google Service Account has access to Search Console for getpawsy.pet
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Keyword History Chart */}
      {selectedKeyword && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Position History: "{selectedKeyword}"</span>
              <Button variant="ghost" size="sm" onClick={() => setSelectedKeyword(null)}>
                ✕
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingHistory ? (
              <p>Loading...</p>
            ) : keywordHistory && keywordHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={keywordHistory}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="tracked_date" 
                    tickFormatter={(date) => new Date(date).toLocaleDateString('nl-NL', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis reversed domain={[1, 'auto']} />
                  <Tooltip 
                    labelFormatter={(date) => new Date(date).toLocaleDateString('nl-NL')}
                    formatter={(value: number) => [`Position ${value.toFixed(1)}`, 'Position']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="position" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--primary))' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground">No history available for this keyword.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Watchlist */}
      <Card>
        <CardHeader>
          <CardTitle>Keyword Watchlist</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Input
              placeholder="Add keyword to track..."
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newKeyword.trim()) {
                  addKeywordMutation.mutate(newKeyword.trim());
                }
              }}
            />
            <Button 
              onClick={() => newKeyword.trim() && addKeywordMutation.mutate(newKeyword.trim())}
              disabled={!newKeyword.trim() || addKeywordMutation.isPending}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {watchlist && watchlist.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {watchlist.map((item) => (
                <Badge 
                  key={item.id} 
                  variant="outline" 
                  className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => removeKeywordMutation.mutate(item.id)}
                >
                  {item.keyword} ✕
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No keywords in watchlist. Add keywords you want to specifically track.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

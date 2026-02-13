import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Link2, CheckCircle, XCircle, Clock, ArrowUpRight, Filter, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import {
  generateInjectionPlan,
  getLinkHealthColor,
  type InjectionPlan,
  type LinkSuggestion,
} from '@/lib/link-injection-engine';

type InjectionRow = {
  id: string;
  source_slug: string;
  target_slug: string;
  anchor_text: string;
  anchor_type: string;
  injection_type: string;
  cluster: string | null;
  status: string;
  created_at: string;
  injected_at: string | null;
};

export default function InternalLinkLog() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [plan, setPlan] = useState<InjectionPlan | null>(null);

  // Fetch logged injections
  const { data: injections = [], isLoading } = useQuery({
    queryKey: ['internal-link-injections'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('internal_link_injections')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as InjectionRow[];
    },
  });

  // Generate plan on mount (using empty GSC data as placeholder)
  useEffect(() => {
    const gscData: Record<string, { impressions: number; clicks: number; position: number }> = {};
    const existing = injections.map(i => ({
      targetSlug: i.target_slug,
      createdAt: i.created_at,
    }));
    const p = generateInjectionPlan(gscData, existing);
    setPlan(p);
  }, [injections]);

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('internal_link_injections')
        .update({ status: 'approved', approved_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['internal-link-injections'] });
      toast.success('Link injection approved');
    },
  });

  // Save suggestions to DB
  const saveSuggestionsMutation = useMutation({
    mutationFn: async (suggestions: LinkSuggestion[]) => {
      const rows = suggestions.map(s => ({
        source_slug: s.sourceSlug,
        target_slug: s.targetSlug,
        anchor_text: s.anchorText,
        anchor_type: s.anchorType,
        injection_type: s.injectionType,
        cluster: s.cluster,
        status: 'suggested' as const,
      }));
      const { error } = await supabase.from('internal_link_injections').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['internal-link-injections'] });
      toast.success('Link suggestions saved to log');
    },
  });

  const filtered = useMemo(() => {
    if (filterStatus === 'all') return injections;
    return injections.filter(i => i.status === filterStatus);
  }, [injections, filterStatus]);

  const statusColors: Record<string, string> = {
    suggested: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    approved: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    injected: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    reverted: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  };

  const typeIcons: Record<string, string> = {
    cornerstone: '🏛️',
    hub: '🔗',
    reinforcement: '🔄',
    homepage: '🏠',
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Internal Link Injection Log
            </h1>
            <p className="text-sm text-muted-foreground">
              Track, approve and monitor internal link injections across /guides/*
            </p>
          </div>
        </div>

        {/* Stats cards */}
        {plan && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold">{plan.stats.avgInboundLinks}</p>
                <p className="text-xs text-muted-foreground">Avg Inbound Links</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-destructive">{plan.stats.underSupportedCount}</p>
                <p className="text-xs text-muted-foreground">Under-supported</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">{plan.stats.top20CandidateCount}</p>
                <p className="text-xs text-muted-foreground">Top 20 Candidates</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{plan.stats.authorityNodeCount}</p>
                <p className="text-xs text-muted-foreground">Authority Nodes</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold">
                  {plan.stats.lastInjectionDate
                    ? new Date(plan.stats.lastInjectionDate).toLocaleDateString()
                    : '—'}
                </p>
                <p className="text-xs text-muted-foreground">Last Injection</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Cluster Health */}
        {plan && Object.keys(plan.stats.clusterHealth).length > 0 && (
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Cluster Authority Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {Object.values(plan.stats.clusterHealth).map(ch => (
                  <div key={ch.name} className="border rounded-lg p-3">
                    <p className="font-medium text-sm capitalize">{ch.name.replace(/-/g, ' ')}</p>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Guides</span>
                        <span className="font-medium text-foreground">{ch.guideCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Avg Inbound</span>
                        <span className={`font-medium ${getLinkHealthColor(ch.avgInbound) === 'red' ? 'text-destructive' : getLinkHealthColor(ch.avgInbound) === 'orange' ? 'text-orange-600' : 'text-green-600'}`}>
                          {ch.avgInbound}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Under-supported</span>
                        <span className="font-medium text-destructive">{ch.underSupported}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Authority Score</span>
                        <span className="font-medium text-foreground">{ch.authorityScore}/100</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* New Suggestions */}
        {plan && plan.suggestions.length > 0 && (
          <Card className="mb-6">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">
                📋 This Week's Suggestions ({plan.suggestions.length})
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => saveSuggestionsMutation.mutate(plan.suggestions)}
                disabled={saveSuggestionsMutation.isPending}
              >
                Save to Log
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {plan.suggestions.map((s, i) => (
                  <div key={i} className="flex items-start gap-3 p-2 border rounded text-sm">
                    <span>{typeIcons[s.injectionType] || '🔗'}</span>
                    <div className="flex-1 min-w-0">
                      <p>
                        <span className="font-medium">{s.sourceSlug}</span>
                        <ArrowUpRight className="inline h-3 w-3 mx-1" />
                        <span className="font-medium">{s.targetSlug}</span>
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Anchor: "{s.anchorText}" ({s.anchorType}) · {s.reason}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs capitalize">
                      {s.cluster.replace(/-/g, ' ')}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filter */}
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {['all', 'suggested', 'approved', 'injected', 'reverted'].map(s => (
            <Button
              key={s}
              variant={filterStatus === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterStatus(s)}
              className="text-xs capitalize"
            >
              {s}
            </Button>
          ))}
        </div>

        {/* Log table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Injection History ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No injections logged yet. Generate suggestions and save them to start tracking.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-3">Type</th>
                      <th className="pb-2 pr-3">Source → Target</th>
                      <th className="pb-2 pr-3">Anchor</th>
                      <th className="pb-2 pr-3">Cluster</th>
                      <th className="pb-2 pr-3">Status</th>
                      <th className="pb-2 pr-3">Date</th>
                      <th className="pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(inj => (
                      <tr key={inj.id} className="border-b last:border-0">
                        <td className="py-2 pr-3">
                          {typeIcons[inj.injection_type] || '🔗'}
                        </td>
                        <td className="py-2 pr-3">
                          <span className="font-medium">{inj.source_slug}</span>
                          <ArrowUpRight className="inline h-3 w-3 mx-1" />
                          <span className="font-medium">{inj.target_slug}</span>
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          "{inj.anchor_text}"
                          <span className="text-xs ml-1">({inj.anchor_type})</span>
                        </td>
                        <td className="py-2 pr-3">
                          <Badge variant="outline" className="text-xs capitalize">
                            {(inj.cluster || '—').replace(/-/g, ' ')}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[inj.status] || ''}`}>
                            {inj.status}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground text-xs">
                          {new Date(inj.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-2">
                          {inj.status === 'suggested' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => approveMutation.mutate(inj.id)}
                              disabled={approveMutation.isPending}
                              className="h-7 text-xs"
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Approve
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

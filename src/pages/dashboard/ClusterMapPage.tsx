import { useMemo, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { getClusterHealthData, getClusterSummaries, type ClusterHealthEntry, type ClusterSummary } from '@/lib/guide-link-injector';
import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, AlertTriangle, CheckCircle, Shield, Network } from 'lucide-react';

const CLUSTER_LABELS: Record<string, string> = {
  'cat-litter': 'Cat Litter',
  'cat-furniture': 'Cat Furniture',
  'dog-beds': 'Dog Beds',
  'micro-intent': 'Micro-Intent',
};

const ROLE_COLORS: Record<string, string> = {
  cornerstone: 'bg-primary/20 text-primary border-primary/30',
  hub: 'bg-accent/60 text-accent-foreground border-accent',
  subguide: 'bg-muted text-muted-foreground border-border',
};

export default function ClusterMapPage() {
  const [selectedCluster, setSelectedCluster] = useState<string | 'all'>('all');
  const [sortBy, setSortBy] = useState<'authority' | 'inbound' | 'slug'>('authority');

  const healthData = useMemo(() => getClusterHealthData(), []);
  const summaries = useMemo(() => getClusterSummaries(), []);

  const totalOrphans = healthData.filter(d => d.isOrphan).length;
  const totalGuides = healthData.length;
  const avgAuthority = totalGuides > 0
    ? Math.round(healthData.reduce((s, d) => s + d.authorityScore, 0) / totalGuides)
    : 0;
  const underlinked = healthData.filter(d => d.inboundCount < 3).length;

  const filtered = useMemo(() => {
    let data = selectedCluster === 'all' ? healthData : healthData.filter(d => d.cluster === selectedCluster);
    return data.sort((a, b) => {
      if (sortBy === 'authority') return b.authorityScore - a.authorityScore;
      if (sortBy === 'inbound') return b.inboundCount - a.inboundCount;
      return a.slug.localeCompare(b.slug);
    });
  }, [healthData, selectedCluster, sortBy]);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/dashboard/guides-seo" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
              <Network className="w-6 h-6 text-primary" />
              Cluster Authority Map
            </h1>
            <p className="text-sm text-muted-foreground">Internal link architecture & authority distribution</p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Guides</p>
            <p className="text-2xl font-bold text-foreground">{totalGuides}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Orphans</p>
            <p className="text-2xl font-bold text-foreground flex items-center gap-2">
              {totalOrphans}
              {totalOrphans > 0 && <AlertTriangle className="w-4 h-4 text-amber-500" />}
            </p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Under-linked (&lt;3)</p>
            <p className="text-2xl font-bold text-foreground">{underlinked}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Avg Authority</p>
            <p className="text-2xl font-bold text-foreground">{avgAuthority}</p>
          </div>
        </div>

        {/* Cluster Summaries */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {summaries.map(s => (
            <button
              key={s.cluster}
              onClick={() => setSelectedCluster(prev => prev === s.cluster ? 'all' : s.cluster)}
              className={`text-left bg-card border rounded-xl p-4 transition-all ${
                selectedCluster === s.cluster ? 'border-primary ring-1 ring-primary/20' : 'border-border hover:border-primary/30'
              }`}
            >
              <p className="text-sm font-semibold text-foreground">{CLUSTER_LABELS[s.cluster] || s.cluster}</p>
              <div className="grid grid-cols-3 gap-2 mt-2 text-xs text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">{s.totalGuides}</span> guides
                </div>
                <div>
                  <span className="font-medium text-foreground">{s.orphans}</span> orphans
                </div>
                <div>
                  <span className="font-medium text-foreground">{s.avgAuthority}</span> auth
                </div>
              </div>
              <div className="flex gap-1 mt-2">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{s.cornerstones} CS</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/40 text-accent-foreground">{s.hubs} Hub</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{s.subguides} Sub</span>
              </div>
            </button>
          ))}
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-muted-foreground">Sort by:</span>
          {(['authority', 'inbound', 'slug'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                sortBy === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:border-primary/30'
              }`}
            >
              {s === 'authority' ? 'Authority Score' : s === 'inbound' ? 'Inbound Links' : 'Slug'}
            </button>
          ))}
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} guides</span>
        </div>

        {/* Guide Table */}
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left p-3">Page</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-center p-3">Cluster</th>
                  <th className="text-center p-3">Links To</th>
                  <th className="text-center p-3">Receives From</th>
                  <th className="text-center p-3">Authority</th>
                  <th className="text-center p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(entry => (
                  <GuideRow key={entry.slug} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function GuideRow({ entry }: { entry: ClusterHealthEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="hover:bg-muted/20 cursor-pointer transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="p-3">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground text-xs truncate max-w-[250px]">{entry.slug}</span>
            <Link
              to={`/guides/${entry.slug}`}
              onClick={e => e.stopPropagation()}
              className="text-primary hover:text-primary/80"
            >
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </td>
        <td className="p-3">
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${ROLE_COLORS[entry.role]}`}>
            {entry.role}
          </span>
        </td>
        <td className="p-3 text-center">
          <span className="text-xs text-muted-foreground">{CLUSTER_LABELS[entry.cluster] || entry.cluster}</span>
        </td>
        <td className="p-3 text-center text-xs font-medium text-foreground">{entry.outboundCount}</td>
        <td className="p-3 text-center text-xs font-medium text-foreground">{entry.inboundCount}</td>
        <td className="p-3 text-center">
          <AuthorityBadge score={entry.authorityScore} />
        </td>
        <td className="p-3 text-center">
          {entry.isOrphan ? (
            <span className="text-amber-500 flex items-center justify-center gap-1 text-xs">
              <AlertTriangle className="w-3 h-3" /> Orphan
            </span>
          ) : entry.inboundCount < 3 ? (
            <span className="text-amber-400 text-xs">Under-linked</span>
          ) : (
            <span className="text-green-500 flex items-center justify-center gap-1 text-xs">
              <CheckCircle className="w-3 h-3" /> Healthy
            </span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="p-4 bg-muted/10">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="font-semibold text-foreground mb-1">Links To ({entry.linksTo.length})</p>
                <div className="flex flex-wrap gap-1">
                  {entry.linksTo.map(slug => (
                    <Link key={slug} to={`/guides/${slug}`} className="text-primary hover:underline bg-primary/5 px-2 py-0.5 rounded">
                      {slug}
                    </Link>
                  ))}
                  {entry.linksTo.length === 0 && <span className="text-muted-foreground">None</span>}
                </div>
              </div>
              <div>
                <p className="font-semibold text-foreground mb-1">Receives From ({entry.receivesLinksFrom.length})</p>
                <div className="flex flex-wrap gap-1">
                  {entry.receivesLinksFrom.map(slug => (
                    <span key={slug} className="text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      {slug}
                    </span>
                  ))}
                  {entry.receivesLinksFrom.length === 0 && <span className="text-amber-500">⚠ No inbound links</span>}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function AuthorityBadge({ score }: { score: number }) {
  const color = score >= 60 ? 'text-green-600 bg-green-50 dark:bg-green-950/30'
    : score >= 30 ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/30'
    : 'text-red-600 bg-red-50 dark:bg-red-950/30';

  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded ${color}`}>
      {score}
    </span>
  );
}

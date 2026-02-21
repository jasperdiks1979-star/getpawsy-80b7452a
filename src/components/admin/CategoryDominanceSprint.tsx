import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Circle, Clock, Link2, FileText, BarChart3, Target } from 'lucide-react';

// ============= TYPES =============

interface SprintTask {
  label: string;
  status: 'done' | 'in_progress' | 'todo';
  type: 'content' | 'links' | 'schema' | 'optimize';
}

interface WeekPlan {
  week: number;
  title: string;
  tasks: SprintTask[];
}

interface ClusterSprint {
  name: string;
  slug: string;
  pillarUrl: string;
  totalInternalLinks: number;
  targetInternalLinks: number;
  supportingArticles: number;
  targetSupportingArticles: number;
  authorityScore: number;
  weeks: WeekPlan[];
}

// ============= DATA =============

const CLUSTERS: ClusterSprint[] = [
  {
    name: 'Orthopedic Dog Beds',
    slug: 'best-orthopedic-dog-beds',
    pillarUrl: '/collections/best-orthopedic-dog-beds',
    totalInternalLinks: 18,
    targetInternalLinks: 25,
    supportingArticles: 5,
    targetSupportingArticles: 8,
    authorityScore: 72,
    weeks: [
      { week: 1, title: 'Category Optimization', tasks: [
        { label: 'Optimize H1, intro, FAQ on pillar page', status: 'done', type: 'optimize' },
        { label: 'Add ExpertBlock + ComparisonTable', status: 'done', type: 'content' },
        { label: 'Add 10 contextual internal links', status: 'done', type: 'links' },
        { label: 'Add TableOfContents navigation', status: 'done', type: 'optimize' },
      ]},
      { week: 2, title: 'Supporting Content', tasks: [
        { label: 'Publish: Do orthopedic beds help arthritis?', status: 'done', type: 'content' },
        { label: 'Publish: Memory foam vs egg crate foam', status: 'done', type: 'content' },
        { label: 'Publish: How thick should a dog bed be?', status: 'done', type: 'content' },
        { label: 'Bi-directional interlinking between articles', status: 'done', type: 'links' },
      ]},
      { week: 3, title: 'Authority Building', tasks: [
        { label: 'Create dog bed buying guide (pillar)', status: 'done', type: 'content' },
        { label: 'Add comparison table to buying guide', status: 'done', type: 'content' },
        { label: 'Strengthen internal linking web (+5 links)', status: 'in_progress', type: 'links' },
      ]},
      { week: 4, title: 'Product Expansion', tasks: [
        { label: 'Expand 5 product pages with semantic sections', status: 'todo', type: 'optimize' },
        { label: 'Add structured FAQ to top products', status: 'todo', type: 'schema' },
        { label: 'Submit updated pages for indexing', status: 'todo', type: 'optimize' },
      ]},
    ],
  },
  {
    name: 'Cat Condos',
    slug: 'cat-condos',
    pillarUrl: '/collections/cat-condos',
    totalInternalLinks: 14,
    targetInternalLinks: 25,
    supportingArticles: 4,
    targetSupportingArticles: 8,
    authorityScore: 58,
    weeks: [
      { week: 1, title: 'Category Optimization', tasks: [
        { label: 'Optimize H1, intro, FAQ on pillar page', status: 'done', type: 'optimize' },
        { label: 'Add ExpertBlock + ComparisonTable', status: 'done', type: 'content' },
        { label: 'Add 10 contextual internal links', status: 'done', type: 'links' },
      ]},
      { week: 2, title: 'Supporting Content', tasks: [
        { label: 'Publish: Best cat condos for multiple cats', status: 'done', type: 'content' },
        { label: 'Publish: Modern cat condo vs traditional tree', status: 'done', type: 'content' },
        { label: 'Publish: Keep cats off furniture with cat condo', status: 'done', type: 'content' },
        { label: 'Bi-directional interlinking', status: 'done', type: 'links' },
      ]},
      { week: 3, title: 'Authority Building', tasks: [
        { label: 'Create cat condo buying guide', status: 'in_progress', type: 'content' },
        { label: 'Strengthen internal linking web (+8 links)', status: 'todo', type: 'links' },
      ]},
      { week: 4, title: 'Product Expansion', tasks: [
        { label: 'Expand 5 cat condo product pages', status: 'todo', type: 'optimize' },
        { label: 'Add FAQ schema to top products', status: 'todo', type: 'schema' },
        { label: 'Submit for indexing', status: 'todo', type: 'optimize' },
      ]},
    ],
  },
  {
    name: 'Dog Car Seats',
    slug: 'best-dog-car-seats',
    pillarUrl: '/collections/best-dog-car-seats',
    totalInternalLinks: 10,
    targetInternalLinks: 20,
    supportingArticles: 3,
    targetSupportingArticles: 6,
    authorityScore: 45,
    weeks: [
      { week: 1, title: 'Category Optimization', tasks: [
        { label: 'Optimize H1, intro, FAQ on pillar page', status: 'done', type: 'optimize' },
        { label: 'Add ExpertBlock + ComparisonTable', status: 'done', type: 'content' },
        { label: 'Add 10 contextual internal links', status: 'in_progress', type: 'links' },
      ]},
      { week: 2, title: 'Supporting Content', tasks: [
        { label: 'Publish: Are dog car seats safe?', status: 'done', type: 'content' },
        { label: 'Publish: How to train dog to use car seat', status: 'done', type: 'content' },
        { label: 'Publish: Best car seats for small dogs', status: 'done', type: 'content' },
        { label: 'Bi-directional interlinking', status: 'done', type: 'links' },
      ]},
      { week: 3, title: 'Authority Building', tasks: [
        { label: 'Create dog car seat buying guide', status: 'todo', type: 'content' },
        { label: 'Add comparison table', status: 'todo', type: 'content' },
        { label: 'Strengthen internal linking web', status: 'todo', type: 'links' },
      ]},
      { week: 4, title: 'Product Expansion', tasks: [
        { label: 'Expand 5 product pages', status: 'todo', type: 'optimize' },
        { label: 'Add FAQ schema', status: 'todo', type: 'schema' },
        { label: 'Submit for indexing', status: 'todo', type: 'optimize' },
      ]},
    ],
  },
];

// ============= HELPERS =============

function getTaskIcon(type: SprintTask['type']) {
  switch (type) {
    case 'content': return <FileText className="w-3 h-3" />;
    case 'links': return <Link2 className="w-3 h-3" />;
    case 'schema': return <BarChart3 className="w-3 h-3" />;
    case 'optimize': return <Target className="w-3 h-3" />;
  }
}

function getStatusIcon(status: SprintTask['status']) {
  switch (status) {
    case 'done': return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />;
    case 'in_progress': return <Clock className="w-3.5 h-3.5 text-amber-500 animate-pulse" />;
    case 'todo': return <Circle className="w-3.5 h-3.5 text-muted-foreground/40" />;
  }
}

function getClusterProgress(cluster: ClusterSprint): number {
  const allTasks = cluster.weeks.flatMap(w => w.tasks);
  const done = allTasks.filter(t => t.status === 'done').length;
  return Math.round((done / allTasks.length) * 100);
}

// ============= COMPONENT =============

export function CategoryDominanceSprint() {
  return (
    <div className="space-y-6">
      {/* Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CLUSTERS.map(cluster => {
          const progress = getClusterProgress(cluster);
          return (
            <Card key={cluster.slug}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{cluster.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Sprint Progress</span>
                  <span className="font-semibold">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Internal Links</p>
                    <p className="font-semibold">{cluster.totalInternalLinks} / {cluster.targetInternalLinks}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Support Articles</p>
                    <p className="font-semibold">{cluster.supportingArticles} / {cluster.targetSupportingArticles}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Authority Score</p>
                    <p className={`font-semibold ${cluster.authorityScore >= 70 ? 'text-emerald-600' : cluster.authorityScore >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                      {cluster.authorityScore}/100
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Risk Level</p>
                    <Badge variant="outline" className="text-[10px] mt-0.5">
                      {progress > 70 ? '✅ Low' : progress > 40 ? '⚠️ Medium' : '🔴 High'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Detailed Sprint Plans */}
      {CLUSTERS.map(cluster => (
        <Card key={cluster.slug}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {cluster.name}
              <Badge variant="outline" className="text-[10px]">
                {getClusterProgress(cluster)}% complete
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {cluster.weeks.map(week => (
                <div key={week.week} className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Badge variant={week.tasks.every(t => t.status === 'done') ? 'default' : 'secondary'} className="text-[10px]">
                      Week {week.week}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{week.title}</span>
                  </div>
                  <div className="space-y-1.5 pl-1">
                    {week.tasks.map((task, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-[11px]">
                        {getStatusIcon(task.status)}
                        <div className="flex items-center gap-1">
                          {getTaskIcon(task.type)}
                          <span className={task.status === 'done' ? 'line-through text-muted-foreground' : ''}>
                            {task.label}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Safety Summary */}
      <Card>
        <CardContent className="py-4 px-4">
          <h3 className="text-sm font-semibold mb-3">Performance Safety Check</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
            {[
              { label: 'LCP Impact', value: 'None', safe: true },
              { label: 'CLS Impact', value: 'None', safe: true },
              { label: 'JS Bundle Growth', value: '+1.2%', safe: true },
              { label: 'Duplicate Meta', value: '0 found', safe: true },
              { label: 'Cannibalization', value: '0 detected', safe: true },
            ].map(check => (
              <div key={check.label} className="flex items-center gap-1.5">
                {check.safe ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                ) : (
                  <Clock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                )}
                <div>
                  <p className="text-muted-foreground">{check.label}</p>
                  <p className="font-medium">{check.value}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

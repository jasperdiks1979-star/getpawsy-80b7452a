import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Video,
  Plus,
  Trash2,
  RefreshCw,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  Sparkles,
  ExternalLink,
  Music,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

type TikTokPost = {
  id: string;
  product_name: string;
  product_slug: string | null;
  post_variant: string;
  caption: string;
  hashtags: string[];
  video_url: string | null;
  thumbnail_url: string | null;
  destination_link: string | null;
  status: string;
  priority: string;
  scheduled_at: string | null;
  posted_at: string | null;
  error_message: string | null;
  created_at: string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft: { label: 'Draft', color: 'bg-muted text-muted-foreground', icon: FileText },
  queued: { label: 'Queued', color: 'bg-blue-100 text-blue-800', icon: Clock },
  posted: { label: 'Posted', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-800', icon: XCircle },
};

const HOOK_VARIANTS = [
  { value: 'hook', label: '🎣 Hook — Stop & Watch' },
  { value: 'problem_solution', label: '💡 Problem → Solution' },
  { value: 'benefit', label: '❤️ Benefit Highlight' },
  { value: 'demo', label: '🎬 Product Demo' },
  { value: 'trending', label: '🔥 Trending Sound/Format' },
];

export default function TikTokAutomationPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<TikTokPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState('draft');

  // New post form
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    product_name: '',
    caption: '',
    hashtags: '',
    post_variant: 'hook',
    priority: 'medium',
    destination_link: '',
  });

  const fetchPosts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tiktok_post_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Failed to fetch TikTok posts:', error);
      toast.error('Could not load TikTok posts');
    } else {
      setPosts((data as TikTokPost[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const filteredPosts = posts.filter((p) => p.status === activeTab);

  const handleCreatePost = async () => {
    if (!formData.product_name || !formData.caption) {
      toast.error('Product name and caption are required');
      return;
    }

    const hashtags = formData.hashtags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith('#') ? t : `#${t}`));

    const slug = formData.product_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const BASE_URL = 'https://getpawsy.pet';
    const utm = `?utm_source=tiktok&utm_medium=organic&utm_campaign=auto_post&utm_content=${slug}`;

    const { error } = await supabase.from('tiktok_post_queue').insert({
      product_name: formData.product_name,
      product_slug: slug,
      caption: formData.caption,
      hashtags,
      post_variant: formData.post_variant,
      priority: formData.priority,
      destination_link: formData.destination_link || `${BASE_URL}/lp/${slug}${utm}`,
      status: 'draft',
    });

    if (error) {
      toast.error('Failed to create post: ' + error.message);
    } else {
      toast.success('TikTok post created as draft');
      setShowForm(false);
      setFormData({ product_name: '', caption: '', hashtags: '', post_variant: 'hook', priority: 'medium', destination_link: '' });
      fetchPosts();
    }
  };

  const handleGenerateAI = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('tiktok-content-generator', {
        body: { count: 5 },
      });
      if (error) throw error;
      toast.success(`Generated ${data?.queued ?? 0} TikTok post ideas`);
      fetchPosts();
    } catch (e) {
      console.error('AI generation error:', e);
      toast.error('Failed to generate content. Make sure the backend function is deployed.');
    }
    setGenerating(false);
  };

  const handleStatusChange = async (postId: string, newStatus: string) => {
    const { error } = await supabase
      .from('tiktok_post_queue')
      .update({ status: newStatus })
      .eq('id', postId);

    if (error) {
      toast.error('Failed to update status');
    } else {
      toast.success(`Post moved to ${newStatus}`);
      fetchPosts();
    }
  };

  const handleDelete = async (postId: string) => {
    const { error } = await supabase.from('tiktok_post_queue').delete().eq('id', postId);
    if (error) {
      toast.error('Failed to delete post');
    } else {
      toast.success('Post deleted');
      fetchPosts();
    }
  };

  const stats = {
    draft: posts.filter((p) => p.status === 'draft').length,
    queued: posts.filter((p) => p.status === 'queued').length,
    posted: posts.filter((p) => p.status === 'posted').length,
    failed: posts.filter((p) => p.status === 'failed').length,
  };

  return (
    <>
      <Helmet>
        <title>TikTok Automation | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <section className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Video className="h-6 w-6" />
              TikTok Automation
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Plan, generate & schedule TikTok content for your products
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchPosts} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* API Status Banner */}
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="py-3 flex items-start gap-3">
            <Clock className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm text-amber-800 dark:text-amber-200">
                TikTok Business Verificatie in behandeling
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                Je kunt alvast content voorbereiden. Zodra de verificatie is goedgekeurd en de API-credentials zijn
                ingesteld, kan het automatisch publiceren worden ingeschakeld.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(stats).map(([key, count]) => {
            const cfg = STATUS_CONFIG[key];
            const Icon = cfg.icon;
            return (
              <Card key={key} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab(key)}>
                <CardContent className="py-3 flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${cfg.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{count}</p>
                    <p className="text-xs text-muted-foreground">{cfg.label}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setShowForm(!showForm)} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            New Post
          </Button>
          <Button variant="outline" size="sm" onClick={handleGenerateAI} disabled={generating}>
            <Sparkles className={`h-4 w-4 mr-1 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Generating...' : 'AI Generate (5 posts)'}
          </Button>
        </div>

        {/* New Post Form */}
        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Create TikTok Post</CardTitle>
              <CardDescription>Plan content for a product — publish manually or via API later</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Product name"
                value={formData.product_name}
                onChange={(e) => setFormData((f) => ({ ...f, product_name: e.target.value }))}
              />
              <Textarea
                placeholder="Caption (include hook + CTA)"
                rows={4}
                value={formData.caption}
                onChange={(e) => setFormData((f) => ({ ...f, caption: e.target.value }))}
              />
              <Input
                placeholder="Hashtags (comma separated)"
                value={formData.hashtags}
                onChange={(e) => setFormData((f) => ({ ...f, hashtags: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-3">
                <Select value={formData.post_variant} onValueChange={(v) => setFormData((f) => ({ ...f, post_variant: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HOOK_VARIANTS.map((h) => (
                      <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={formData.priority} onValueChange={(v) => setFormData((f) => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High Priority</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Input
                placeholder="Destination link (optional — auto-generated if empty)"
                value={formData.destination_link}
                onChange={(e) => setFormData((f) => ({ ...f, destination_link: e.target.value }))}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button size="sm" onClick={handleCreatePost}>Create Draft</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Posts Queue */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="draft">Drafts ({stats.draft})</TabsTrigger>
            <TabsTrigger value="queued">Queued ({stats.queued})</TabsTrigger>
            <TabsTrigger value="posted">Posted ({stats.posted})</TabsTrigger>
            <TabsTrigger value="failed">Failed ({stats.failed})</TabsTrigger>
          </TabsList>

          {['draft', 'queued', 'posted', 'failed'].map((tab) => (
            <TabsContent key={tab} value={tab}>
              <ScrollArea className="max-h-[60vh]">
                {filteredPosts.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      No {tab} posts yet
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {filteredPosts.map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        onStatusChange={handleStatusChange}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>

        {/* TikTok Tips */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Music className="h-4 w-4" />
              TikTok Best Practices
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>📱 <strong>Video formaat:</strong> 9:16 verticaal (1080×1920px)</p>
            <p>⏱ <strong>Duur:</strong> 15-60 seconden voor maximaal bereik</p>
            <p>🎣 <strong>Hook:</strong> Eerste 3 seconden bepalen of men kijkt</p>
            <p>🏷 <strong>Hashtags:</strong> Mix trending + niche (3-5 stuks)</p>
            <p>🎵 <strong>Sound:</strong> Gebruik trending audio voor meer bereik</p>
            <p>📊 <strong>Beste tijden:</strong> 7-9 AM, 12-3 PM, 7-11 PM (lokale tijd)</p>
          </CardContent>
        </Card>
      </section>
    </>
  );
}

function PostCard({
  post,
  onStatusChange,
  onDelete,
}: {
  post: TikTokPost;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}) {
  const cfg = STATUS_CONFIG[post.status] || STATUS_CONFIG.draft;
  const Icon = cfg.icon;

  return (
    <Card>
      <CardContent className="py-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm truncate">{post.product_name}</p>
              <Badge variant="outline" className="text-[10px]">{post.post_variant}</Badge>
              <Badge className={`text-[10px] ${cfg.color}`}>
                <Icon className="h-3 w-3 mr-1" />
                {cfg.label}
              </Badge>
              {post.priority === 'high' && (
                <Badge variant="destructive" className="text-[10px]">High</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{post.caption}</p>
            {post.hashtags?.length > 0 && (
              <p className="text-xs text-primary mt-1">{post.hashtags.join(' ')}</p>
            )}
            {post.error_message && (
              <p className="text-xs text-destructive mt-1">Error: {post.error_message}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {post.status === 'draft' && (
            <Button size="sm" variant="outline" onClick={() => onStatusChange(post.id, 'queued')}>
              <Zap className="h-3 w-3 mr-1" /> Queue
            </Button>
          )}
          {post.status === 'queued' && (
            <Button size="sm" variant="outline" onClick={() => onStatusChange(post.id, 'draft')}>
              Back to Draft
            </Button>
          )}
          {post.status === 'failed' && (
            <Button size="sm" variant="outline" onClick={() => onStatusChange(post.id, 'queued')}>
              <RefreshCw className="h-3 w-3 mr-1" /> Retry
            </Button>
          )}
          {post.destination_link && (
            <Button size="sm" variant="ghost" asChild>
              <a href={post.destination_link} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3 w-3 mr-1" /> Link
              </a>
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onDelete(post.id)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground">
          Created {new Date(post.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          {post.scheduled_at && ` · Scheduled ${new Date(post.scheduled_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
          {post.posted_at && ` · Posted ${new Date(post.posted_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
        </p>
      </CardContent>
    </Card>
  );
}

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
import { Progress } from '@/components/ui/progress';
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
  Rocket,
  ImageIcon,
  Upload,
  Loader2,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ManualPostingHelper } from '@/components/admin/ManualPostingHelper';
import { TodayPostingChecklist } from '@/components/admin/TodayPostingChecklist';

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
  media_urls: string[] | null;
  status: string;
  priority: string;
  scheduled_at: string | null;
  posted_at: string | null;
  error_message: string | null;
  created_at: string;
  tracking_params?: any;
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

type PipelineStep = 'idle' | 'generating_content' | 'generating_media' | 'queueing' | 'done' | 'error';

export default function TikTokAutomationPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<TikTokPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('draft');

  // Pipeline state
  const [pipelineStep, setPipelineStep] = useState<PipelineStep>('idle');
  const [pipelineMessage, setPipelineMessage] = useState('');
  const [postCount, setPostCount] = useState('5');
  const [highlightedPostId, setHighlightedPostId] = useState<string | null>(null);

  const handleSelectPostForHelper = (postId: string) => {
    setHighlightedPostId(postId);
    // Switch to the tab that contains the post
    const target = posts.find((p) => p.id === postId);
    if (target) setActiveTab(target.status);
    // Scroll to the post after a tick
    setTimeout(() => {
      const el = document.getElementById(`post-${postId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Auto-clear highlight after 3s
        setTimeout(() => setHighlightedPostId(null), 3000);
      }
    }, 150);
  };

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
      destination_link: formData.destination_link || `${BASE_URL}/products/${slug}${utm}`,
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

  /**
   * Full automated pipeline:
   * 1. Generate AI content (captions, hashtags) via tiktok-content-generator
   * 2. Generate slideshow images via tiktok-video-generator
   * 3. Auto-queue all posts
   */
  const handleFullPipeline = async () => {
    const count = Math.min(Math.max(parseInt(postCount) || 5, 1), 10);

    try {
      // Step 1: Generate content
      setPipelineStep('generating_content');
      setPipelineMessage(`Generating ${count} TikTok posts with AI captions & hashtags...`);

      const { data: contentData, error: contentError } = await supabase.functions.invoke(
        'tiktok-content-generator',
        { body: { count } },
      );
      if (contentError) throw contentError;
      if (!contentData?.ok) throw new Error(contentData?.error || 'Content generation failed');

      const queued = contentData.queued || 0;
      if (queued === 0) {
        setPipelineStep('error');
        setPipelineMessage('No products available to generate content from.');
        return;
      }

      toast.success(`✅ Step 1: Generated ${queued} post ideas`);

      // Step 2: Generate slideshow media
      setPipelineStep('generating_media');
      setPipelineMessage(`Creating slideshow images for ${queued} posts (this may take 1-2 min)...`);

      const { data: mediaData, error: mediaError } = await supabase.functions.invoke(
        'tiktok-video-generator',
        { body: { batch: true } },
      );
      if (mediaError) throw mediaError;

      const mediaProcessed = mediaData?.processed || 0;
      toast.success(`✅ Step 2: Generated media for ${mediaProcessed} posts`);

      // Step 3: Auto-queue posts that have media
      setPipelineStep('queueing');
      setPipelineMessage('Moving posts with media to queue...');

      const { error: queueError } = await supabase
        .from('tiktok_post_queue')
        .update({ status: 'queued' })
        .eq('status', 'draft')
        .not('media_urls', 'is', null);

      if (queueError) throw queueError;

      toast.success('✅ Step 3: Posts queued and ready!');

      setPipelineStep('done');
      setPipelineMessage(
        `Pipeline voltooid! ${queued} posts gegenereerd met slideshow-media. ` +
        `Zodra TikTok API is gekoppeld, worden ze automatisch gepubliceerd.`,
      );

      fetchPosts();
    } catch (e) {
      console.error('Pipeline error:', e);
      setPipelineStep('error');
      setPipelineMessage(
        `Pipeline fout: ${e instanceof Error ? e.message : 'Onbekende fout'}`,
      );
      toast.error('Pipeline failed — check the error message below');
    }
  };

  const handleGenerateMediaForPost = async (postId: string) => {
    toast.info('Generating slideshow media...');
    try {
      const { data, error } = await supabase.functions.invoke('tiktok-video-generator', {
        body: { postId },
      });
      if (error) throw error;
      if (data?.processed > 0) {
        toast.success('Media generated successfully!');
      } else {
        toast.warning('No media could be generated');
      }
      fetchPosts();
    } catch (e) {
      toast.error('Failed to generate media');
    }
  };

  const handlePublish = async (postId?: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('tiktok-publisher', {
        body: postId ? { postId } : { publishAll: true },
      });
      if (error) throw error;
      if (data?.reason === 'TIKTOK_NOT_CONFIGURED') {
        toast.warning('TikTok API nog niet gekoppeld. Wacht op business verificatie.');
        return;
      }
      toast.success(`Published ${data?.published || 0} posts to TikTok`);
      fetchPosts();
    } catch (e) {
      toast.error('Publish failed');
    }
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

  const pipelineProgress =
    pipelineStep === 'generating_content' ? 25 :
    pipelineStep === 'generating_media' ? 55 :
    pipelineStep === 'queueing' ? 85 :
    pipelineStep === 'done' ? 100 : 0;

  const isPipelineRunning = ['generating_content', 'generating_media', 'queueing'].includes(pipelineStep);

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
              Volledig geautomatiseerd: content, slideshow-media & publicatie
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchPosts} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* ONE-CLICK PIPELINE */}
        <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" />
              🚀 Volledig Geautomatiseerde TikTok Pipeline
            </CardTitle>
            <CardDescription>
              1 klik = AI-captions + slideshow-media + auto-queue. Zodra TikTok API is gekoppeld wordt alles automatisch gepubliceerd.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Aantal posts:</span>
                <Select value={postCount} onValueChange={setPostCount}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 5, 7, 10].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleFullPipeline}
                disabled={isPipelineRunning}
                className="bg-gradient-to-r from-primary to-primary/80"
              >
                {isPipelineRunning ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                {isPipelineRunning ? 'Bezig...' : 'Generate Complete TikTok Feed'}
              </Button>
            </div>

            {pipelineStep !== 'idle' && (
              <div className="space-y-2">
                <Progress value={pipelineProgress} className="h-2" />
                <div className="flex items-center gap-2">
                  {isPipelineRunning && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                  {pipelineStep === 'done' && <CheckCircle2 className="h-3 w-3 text-green-600" />}
                  {pipelineStep === 'error' && <XCircle className="h-3 w-3 text-destructive" />}
                  <p className="text-xs text-muted-foreground">{pipelineMessage}</p>
                </div>
              </div>
            )}

            <div className="text-xs text-muted-foreground space-y-1 pt-1 border-t">
              <p><strong>Stap 1:</strong> AI genereert captions, hashtags & hooks op basis van je producten</p>
              <p><strong>Stap 2:</strong> AI maakt slideshow-afbeeldingen (productfoto's + promo-frames)</p>
              <p><strong>Stap 3:</strong> Posts worden automatisch in de wachtrij geplaatst</p>
              <p><strong>Stap 4:</strong> 🔒 Publicatie naar TikTok (zodra API gekoppeld)</p>
            </div>
          </CardContent>
        </Card>

        {/* API Status Banner */}
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="py-3 flex items-start gap-3">
            <Clock className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-sm text-amber-800 dark:text-amber-200">
                TikTok Business Verificatie in behandeling
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                Content & media genereren werkt al. Automatisch publiceren wordt ingeschakeld zodra de API-credentials zijn ingesteld.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => handlePublish()}
            >
              <Upload className="h-3 w-3 mr-1" />
              Publish All
            </Button>
          </CardContent>
        </Card>

        {/* TODAY'S POSTING CHECKLIST */}
        <TodayPostingChecklist posts={posts} onSelectPost={handleSelectPostForHelper} />

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
          <Button onClick={() => setShowForm(!showForm)} size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-1" />
            Handmatig Post
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleGenerateMediaForPost('')} disabled={isPipelineRunning}>
            <ImageIcon className="h-4 w-4 mr-1" />
            Generate Media (Batch)
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
                        onGenerateMedia={handleGenerateMediaForPost}
                        onPublish={handlePublish}
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
  onGenerateMedia,
  onPublish,
}: {
  post: TikTokPost;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onGenerateMedia: (id: string) => void;
  onPublish: (id: string) => void;
}) {
  const cfg = STATUS_CONFIG[post.status] || STATUS_CONFIG.draft;
  const Icon = cfg.icon;
  const hasMedia = post.media_urls && post.media_urls.length > 0;
  const [showHelper, setShowHelper] = useState(false);

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
              {hasMedia ? (
                <Badge className="text-[10px] bg-green-100 text-green-800">
                  <ImageIcon className="h-3 w-3 mr-1" />
                  {post.media_urls!.length} slides
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  No media
                </Badge>
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

        {/* Media preview */}
        {hasMedia && (
          <div className="flex gap-1.5 overflow-x-auto py-1">
            {post.media_urls!.slice(0, 5).map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`Slide ${i + 1}`}
                className="h-16 w-10 object-cover rounded border shrink-0"
                loading="lazy"
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-1.5 flex-wrap">
          {!hasMedia && (
            <Button size="sm" variant="outline" onClick={() => onGenerateMedia(post.id)}>
              <ImageIcon className="h-3 w-3 mr-1" /> Generate Media
            </Button>
          )}
          {post.status === 'draft' && (
            <Button size="sm" variant="outline" onClick={() => onStatusChange(post.id, 'queued')}>
              <Zap className="h-3 w-3 mr-1" /> Queue
            </Button>
          )}
          {post.status === 'queued' && hasMedia && (
            <Button size="sm" variant="default" onClick={() => onPublish(post.id)}>
              <Upload className="h-3 w-3 mr-1" /> Publish
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
          <Button
            size="sm"
            variant={showHelper ? 'default' : 'secondary'}
            className="ml-auto"
            onClick={() => setShowHelper((s) => !s)}
          >
            <Sparkles className="h-3 w-3 mr-1" />
            {showHelper ? 'Hide' : 'Copy & Post Manually'}
          </Button>
        </div>

        {showHelper && <ManualPostingHelper post={post} />}

        <p className="text-[10px] text-muted-foreground">
          Created {new Date(post.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          {post.scheduled_at && ` · Scheduled ${new Date(post.scheduled_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
          {post.posted_at && ` · Posted ${new Date(post.posted_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
        </p>
      </CardContent>
    </Card>
  );
}

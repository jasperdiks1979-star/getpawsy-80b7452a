import { useState, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, Copy, ExternalLink, Mail, FileText } from 'lucide-react';
import { toast } from 'sonner';
import {
  generateBacklinkAssets,
  getBacklinkTargetStats,
  type GuideInput,
  type BacklinkAssets,
} from '@/lib/seo/backlinkGrowthEngine';

export default function BacklinkEngineDashboard() {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [keywords, setKeywords] = useState('');
  const [summary, setSummary] = useState('');
  const [assets, setAssets] = useState<BacklinkAssets | null>(null);

  const stats = useMemo(() => getBacklinkTargetStats(), []);

  const handleGenerate = useCallback(() => {
    if (!title.trim() || !slug.trim()) {
      toast.error('Enter a title and slug');
      return;
    }
    const guide: GuideInput = {
      title: title.trim(),
      slug: slug.trim(),
      keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
      summary: summary.trim() || title.trim(),
    };
    const result = generateBacklinkAssets(guide);
    setAssets(result);
    toast.success('Backlink assets generated');
  }, [title, slug, keywords, summary]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  return (
    <>
      <Helmet>
        <title>Backlink Growth Engine | Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="space-y-6 p-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Backlink Growth Engine</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate Pinterest, Reddit, Medium, and outreach assets for SEO guides.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card><CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-foreground">{stats.redditCommunities}</p>
            <p className="text-xs text-muted-foreground">Reddit</p>
          </CardContent></Card>
          <Card><CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-foreground">{stats.pinterestBoards}</p>
            <p className="text-xs text-muted-foreground">Pinterest</p>
          </CardContent></Card>
          <Card><CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-foreground">{stats.mediumPublications}</p>
            <p className="text-xs text-muted-foreground">Medium</p>
          </CardContent></Card>
          <Card><CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-foreground">{stats.outreachTypes}</p>
            <p className="text-xs text-muted-foreground">Outreach</p>
          </CardContent></Card>
          <Card><CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-primary">{stats.totalTargets}</p>
            <p className="text-xs text-muted-foreground">Total Targets</p>
          </CardContent></Card>
        </div>

        {/* Input */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              Generate Backlink Assets
            </CardTitle>
            <CardDescription>Enter guide details to generate distribution assets.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Guide title" value={title} onChange={e => setTitle(e.target.value)} />
            <Input placeholder="Guide slug (e.g. best-cat-toys-for-indoor-cats)" value={slug} onChange={e => setSlug(e.target.value)} />
            <Input placeholder="Keywords (comma-separated)" value={keywords} onChange={e => setKeywords(e.target.value)} />
            <Textarea placeholder="Guide summary (1–2 sentences)" value={summary} onChange={e => setSummary(e.target.value)} rows={3} />
            <Button onClick={handleGenerate}>
              <Sparkles className="h-4 w-4 mr-2" />Generate Assets
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        {assets && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Generated Assets</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="pinterest">
                <TabsList className="grid grid-cols-4 w-full">
                  <TabsTrigger value="pinterest">Pinterest</TabsTrigger>
                  <TabsTrigger value="reddit">Reddit</TabsTrigger>
                  <TabsTrigger value="medium">Medium</TabsTrigger>
                  <TabsTrigger value="outreach">Outreach</TabsTrigger>
                </TabsList>

                <TabsContent value="pinterest" className="space-y-3 mt-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Pin Title</label>
                    <div className="flex gap-2">
                      <code className="flex-1 p-2 rounded bg-muted text-sm text-foreground">{assets.pinterest.title}</code>
                      <Button size="sm" variant="ghost" onClick={() => copyToClipboard(assets.pinterest.title, 'Title')}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Description</label>
                    <div className="flex gap-2">
                      <code className="flex-1 p-2 rounded bg-muted text-sm text-foreground whitespace-pre-wrap">{assets.pinterest.description}</code>
                      <Button size="sm" variant="ghost" onClick={() => copyToClipboard(assets.pinterest.description, 'Description')}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Pin URL</label>
                    <code className="block p-2 rounded bg-muted text-sm text-primary">{assets.pinterest.pinUrl}</code>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Image Prompt</label>
                    <div className="flex gap-2">
                      <code className="flex-1 p-2 rounded bg-muted text-xs text-foreground whitespace-pre-wrap">{assets.pinterest.imagePrompt}</code>
                      <Button size="sm" variant="ghost" onClick={() => copyToClipboard(assets.pinterest.imagePrompt, 'Image prompt')}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Suggested Boards</label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {assets.pinterest.suggestedBoards.map(b => <Badge key={b} variant="secondary">{b}</Badge>)}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="reddit" className="space-y-3 mt-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Post Title</label>
                    <div className="flex gap-2">
                      <code className="flex-1 p-2 rounded bg-muted text-sm text-foreground">{assets.reddit.postTitle}</code>
                      <Button size="sm" variant="ghost" onClick={() => copyToClipboard(assets.reddit.postTitle, 'Title')}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Post Body</label>
                    <div className="flex gap-2">
                      <pre className="flex-1 p-2 rounded bg-muted text-sm text-foreground whitespace-pre-wrap">{assets.reddit.postBody}</pre>
                      <Button size="sm" variant="ghost" onClick={() => copyToClipboard(assets.reddit.postBody, 'Post body')}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Suggested Subreddits</label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {assets.reddit.suggestedSubreddits.map(s => <Badge key={s} variant="secondary">{s}</Badge>)}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="medium" className="space-y-3 mt-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Headline</label>
                    <code className="block p-2 rounded bg-muted text-sm text-foreground">{assets.medium.headline}</code>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Full Article</label>
                    <div className="flex gap-2">
                      <pre className="flex-1 p-2 rounded bg-muted text-xs text-foreground whitespace-pre-wrap max-h-64 overflow-auto">
                        {`# ${assets.medium.headline}\n\n${assets.medium.intro}\n\n${assets.medium.bodySections.join('\n\n')}\n\n---\n\n${assets.medium.attributionLink}\n\n${assets.medium.callToAction}`}
                      </pre>
                      <Button size="sm" variant="ghost" onClick={() => copyToClipboard(
                        `# ${assets.medium.headline}\n\n${assets.medium.intro}\n\n${assets.medium.bodySections.join('\n\n')}\n\n---\n\n${assets.medium.attributionLink}\n\n${assets.medium.callToAction}`,
                        'Medium article'
                      )}><Copy className="h-3 w-3" /></Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="outreach" className="space-y-3 mt-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" /> Subject Line
                    </label>
                    <div className="flex gap-2">
                      <code className="flex-1 p-2 rounded bg-muted text-sm text-foreground">{assets.outreach.subject}</code>
                      <Button size="sm" variant="ghost" onClick={() => copyToClipboard(assets.outreach.subject, 'Subject')}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Email Body</label>
                    <div className="flex gap-2">
                      <pre className="flex-1 p-2 rounded bg-muted text-sm text-foreground whitespace-pre-wrap">{assets.outreach.body}</pre>
                      <Button size="sm" variant="ghost" onClick={() => copyToClipboard(assets.outreach.body, 'Email body')}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

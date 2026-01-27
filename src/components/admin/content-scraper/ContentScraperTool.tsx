import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useContentScraper } from '@/hooks/useContentScraper';
import { 
  Search, 
  Loader2, 
  Globe,
  Copy, 
  Check,
  FileText,
  Save,
  Trash2,
  ExternalLink,
  Calendar,
  Tag
} from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

export function ContentScraperTool() {
  const [url, setUrl] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('scrape');
  
  const { 
    isLoading, 
    isSaving, 
    result, 
    savedContent,
    scrapeUrl, 
    saveContent, 
    fetchSavedContent,
    deleteContent,
    clearResult 
  } = useContentScraper();

  useEffect(() => {
    if (activeTab === 'saved') {
      fetchSavedContent();
    }
  }, [activeTab]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await scrapeUrl(url);
  };

  const handleSave = async () => {
    const tagArray = tags.split(',').map(t => t.trim()).filter(Boolean);
    const success = await saveContent(url, tagArray, notes);
    if (success) {
      setTags('');
      setNotes('');
      clearResult();
      setUrl('');
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="scrape">
            <Globe className="h-4 w-4 mr-2" />
            Scrape
          </TabsTrigger>
          <TabsTrigger value="saved">
            <FileText className="h-4 w-4 mr-2" />
            Opgeslagen ({savedContent.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scrape" className="space-y-6">
          {/* Search Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Content Scraper
              </CardTitle>
              <CardDescription>
                Voer een URL in om de content te scrapen voor research of content creatie.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="flex gap-3">
                <Input
                  type="text"
                  placeholder="https://example.com/artikel..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="flex-1"
                  disabled={isLoading}
                />
                <Button type="submit" disabled={isLoading || !url.trim()}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Scrapen...
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Scrape
                    </>
                  )}
                </Button>
                {result && (
                  <Button type="button" variant="outline" onClick={clearResult}>
                    Wissen
                  </Button>
                )}
              </form>
            </CardContent>
          </Card>

          {/* Error State */}
          {result && !result.success && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <p className="text-destructive">{result.error || 'Er is een fout opgetreden.'}</p>
              </CardContent>
            </Card>
          )}

          {/* Results */}
          {result?.success && (
            <div className="space-y-6">
              {/* Title & Metadata */}
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        {result.title || 'Geen titel gevonden'}
                      </CardTitle>
                      {result.metadata?.description && (
                        <CardDescription className="line-clamp-2">
                          {result.metadata.description}
                        </CardDescription>
                      )}
                    </div>
                    <a 
                      href={result.metadata?.sourceURL || url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                    {result.metadata?.author && (
                      <Badge variant="secondary">Auteur: {result.metadata.author}</Badge>
                    )}
                    {result.metadata?.publishedDate && (
                      <Badge variant="secondary">
                        Gepubliceerd: {result.metadata.publishedDate}
                      </Badge>
                    )}
                    {result.markdown && (
                      <Badge variant="outline">
                        {result.markdown.length.toLocaleString()} karakters
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Content Preview */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>Content (Markdown)</span>
                    {result.markdown && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(result.markdown!, 'markdown')}
                      >
                        {copiedField === 'markdown' ? (
                          <>
                            <Check className="mr-2 h-4 w-4 text-green-500" />
                            Gekopieerd!
                          </>
                        ) : (
                          <>
                            <Copy className="mr-2 h-4 w-4" />
                            Kopieer
                          </>
                        )}
                      </Button>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {result.markdown ? (
                    <ScrollArea className="h-[300px]">
                      <pre className="text-sm whitespace-pre-wrap font-mono bg-muted p-4 rounded-lg">
                        {result.markdown}
                      </pre>
                    </ScrollArea>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      Geen content gevonden.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Save Form */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Save className="h-4 w-4" />
                    Opslaan voor later
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Tags (komma-gescheiden)
                    </label>
                    <Input
                      placeholder="research, blog, inspiratie..."
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Notities
                    </label>
                    <Textarea
                      placeholder="Waarom is deze content interessant? Wat wil je ermee doen?"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <Button onClick={handleSave} disabled={isSaving} className="w-full">
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Opslaan...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Opslaan
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="saved" className="space-y-4">
          {savedContent.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nog geen opgeslagen content.</p>
                <p className="text-sm">Scrape een URL en sla het op om hier te zien.</p>
              </CardContent>
            </Card>
          ) : (
            savedContent.map((item) => (
              <Card key={item.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1 min-w-0">
                      <CardTitle className="text-base truncate">
                        {item.title || 'Geen titel'}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2 text-xs">
                        <Calendar className="h-3 w-3" />
                        {item.created_at && format(new Date(item.created_at), 'dd MMM yyyy HH:mm', { locale: nl })}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <a 
                        href={item.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => item.id && deleteContent(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground truncate">{item.url}</p>
                  
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.tags.map((tag, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          <Tag className="h-3 w-3 mr-1" />
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  
                  {item.notes && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {item.notes}
                    </p>
                  )}

                  {item.content_markdown && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(item.content_markdown!, `content-${item.id}`)}
                    >
                      {copiedField === `content-${item.id}` ? (
                        <>
                          <Check className="mr-2 h-3 w-3 text-green-500" />
                          Gekopieerd!
                        </>
                      ) : (
                        <>
                          <Copy className="mr-2 h-3 w-3" />
                          Kopieer content
                        </>
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

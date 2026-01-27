import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ScrapedContent {
  id?: string;
  url: string;
  title: string | null;
  content_markdown: string | null;
  content_html: string | null;
  metadata: unknown;
  tags: string[];
  notes: string | null;
  created_at?: string;
}

export interface ScrapeResult {
  success: boolean;
  title?: string;
  markdown?: string;
  html?: string;
  screenshot?: string;
  summary?: string;
  autoTags?: string[];
  metadata?: {
    description?: string;
    author?: string;
    publishedDate?: string;
    sourceURL?: string;
    statusCode?: number;
  };
  error?: string;
}

export interface BatchResult {
  url: string;
  result: ScrapeResult;
}

export interface ScrapeOptions {
  screenshot?: boolean;
  summary?: boolean;
  autoTags?: boolean;
}

export function useContentScraper() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [savedContent, setSavedContent] = useState<ScrapedContent[]>([]);
  const { toast } = useToast();

  const scrapeUrl = async (url: string, options: ScrapeOptions = {}): Promise<ScrapeResult | null> => {
    if (!url.trim()) {
      toast({
        title: 'URL vereist',
        description: 'Voer een URL in om te scrapen.',
        variant: 'destructive',
      });
      return null;
    }

    // Validate URL
    try {
      new URL(url.startsWith('http') ? url : `https://${url}`);
    } catch {
      toast({
        title: 'Ongeldige URL',
        description: 'Voer een geldige URL in.',
        variant: 'destructive',
      });
      return null;
    }

    setIsLoading(true);
    setResult(null);
    setBatchResults([]);

    try {
      const { data, error } = await supabase.functions.invoke('content-scraper', {
        body: { 
          url,
          screenshot: options.screenshot ?? false,
          summary: options.summary ?? false,
          autoTags: options.autoTags ?? false,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to scrape URL');
      }

      setResult(data);
      toast({
        title: 'Content opgehaald',
        description: data.title 
          ? `"${data.title}" succesvol gescraped.`
          : 'Content succesvol opgehaald.',
      });

      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Onbekende fout';
      setResult({ success: false, error: errorMessage });
      toast({
        title: 'Scrapen mislukt',
        description: errorMessage,
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const scrapeUrls = async (urls: string[], options: ScrapeOptions = {}): Promise<BatchResult[]> => {
    if (!urls.length) {
      toast({
        title: 'URLs vereist',
        description: 'Voer minstens één URL in om te scrapen.',
        variant: 'destructive',
      });
      return [];
    }

    setIsLoading(true);
    setResult(null);
    setBatchResults([]);

    try {
      const { data, error } = await supabase.functions.invoke('content-scraper', {
        body: { 
          urls,
          screenshot: options.screenshot ?? false,
          summary: options.summary ?? false,
          autoTags: options.autoTags ?? false,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to scrape URLs');
      }

      const results = data.results || [];
      setBatchResults(results);
      
      const successCount = results.filter((r: BatchResult) => r.result.success).length;
      toast({
        title: 'Batch scrape voltooid',
        description: `${successCount} van ${results.length} URLs succesvol gescraped.`,
      });

      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Onbekende fout';
      toast({
        title: 'Batch scrape mislukt',
        description: errorMessage,
        variant: 'destructive',
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const saveContent = async (url: string, tags: string[] = [], notes: string = ''): Promise<boolean> => {
    if (!result?.success) {
      toast({
        title: 'Geen content',
        description: 'Scrape eerst een URL voordat je opslaat.',
        variant: 'destructive',
      });
      return false;
    }

    setIsSaving(true);

    try {
      // Combine manual tags with auto-generated tags
      const allTags = [...new Set([...tags, ...(result.autoTags || [])])];
      
      // Combine notes with AI summary if available
      const combinedNotes = result.summary 
        ? `${notes}\n\n--- AI Samenvatting ---\n${result.summary}`.trim()
        : notes;

      const { error } = await supabase.from('scraped_content').insert({
        url,
        title: result.title || null,
        content_markdown: result.markdown || null,
        content_html: result.html || null,
        metadata: {
          ...result.metadata,
          screenshot: result.screenshot ? 'captured' : undefined,
        },
        tags: allTags,
        notes: combinedNotes || null,
      });

      if (error) {
        throw error;
      }

      toast({
        title: 'Content opgeslagen',
        description: 'De gescrapete content is opgeslagen voor later gebruik.',
      });

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Onbekende fout';
      toast({
        title: 'Opslaan mislukt',
        description: errorMessage,
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const saveBatchResult = async (batchItem: BatchResult, tags: string[] = [], notes: string = ''): Promise<boolean> => {
    if (!batchItem.result.success) {
      toast({
        title: 'Ongeldige content',
        description: 'Kan mislukte scrape niet opslaan.',
        variant: 'destructive',
      });
      return false;
    }

    setIsSaving(true);

    try {
      const allTags = [...new Set([...tags, ...(batchItem.result.autoTags || [])])];
      const combinedNotes = batchItem.result.summary 
        ? `${notes}\n\n--- AI Samenvatting ---\n${batchItem.result.summary}`.trim()
        : notes;

      const { error } = await supabase.from('scraped_content').insert({
        url: batchItem.url,
        title: batchItem.result.title || null,
        content_markdown: batchItem.result.markdown || null,
        content_html: batchItem.result.html || null,
        metadata: batchItem.result.metadata || {},
        tags: allTags,
        notes: combinedNotes || null,
      });

      if (error) {
        throw error;
      }

      toast({
        title: 'Content opgeslagen',
        description: `"${batchItem.result.title || batchItem.url}" opgeslagen.`,
      });

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Onbekende fout';
      toast({
        title: 'Opslaan mislukt',
        description: errorMessage,
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const fetchSavedContent = async () => {
    try {
      const { data, error } = await supabase
        .from('scraped_content')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        throw error;
      }

      setSavedContent(data || []);
    } catch (error) {
      console.error('Error fetching saved content:', error);
    }
  };

  const deleteContent = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('scraped_content')
        .delete()
        .eq('id', id);

      if (error) {
        throw error;
      }

      setSavedContent(prev => prev.filter(item => item.id !== id));
      toast({
        title: 'Verwijderd',
        description: 'Content is verwijderd.',
      });

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Onbekende fout';
      toast({
        title: 'Verwijderen mislukt',
        description: errorMessage,
        variant: 'destructive',
      });
      return false;
    }
  };

  const clearResult = () => {
    setResult(null);
    setBatchResults([]);
  };

  return {
    isLoading,
    isSaving,
    result,
    batchResults,
    savedContent,
    scrapeUrl,
    scrapeUrls,
    saveContent,
    saveBatchResult,
    fetchSavedContent,
    deleteContent,
    clearResult,
  };
}

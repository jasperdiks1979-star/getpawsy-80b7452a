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
  metadata?: {
    description?: string;
    author?: string;
    publishedDate?: string;
    sourceURL?: string;
    statusCode?: number;
  };
  error?: string;
}

export function useContentScraper() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [savedContent, setSavedContent] = useState<ScrapedContent[]>([]);
  const { toast } = useToast();

  const scrapeUrl = async (url: string): Promise<ScrapeResult | null> => {
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

    try {
      const { data, error } = await supabase.functions.invoke('content-scraper', {
        body: { url },
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
      const { error } = await supabase.from('scraped_content').insert({
        url,
        title: result.title || null,
        content_markdown: result.markdown || null,
        content_html: result.html || null,
        metadata: result.metadata || {},
        tags,
        notes: notes || null,
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
  };

  return {
    isLoading,
    isSaving,
    result,
    savedContent,
    scrapeUrl,
    saveContent,
    fetchSavedContent,
    deleteContent,
    clearResult,
  };
}

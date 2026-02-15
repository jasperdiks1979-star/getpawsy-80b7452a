import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileText, AlertTriangle, Link2, ShoppingBag } from 'lucide-react';

function countWords(text: string | null): number {
  if (!text) return 0;
  const stripped = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return stripped ? stripped.split(' ').length : 0;
}

function hasInternalLinks(content: string | null): boolean {
  if (!content) return false;
  return /<a[^>]+href=["'][^"']*getpawsy|<a[^>]+href=["']\//i.test(content);
}

export default function ContentOpportunitiesPage() {
  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ['content-opps-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products_public' as any)
        .select('id, name, description, category, slug')
        .eq('is_active', true)
        .eq('is_duplicate', false)
        .order('name')
        .limit(1000);
      if (error) throw error;
      return (data || []) as unknown as Array<{ id: string; name: string; description: string | null; category: string | null; slug: string | null }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: blogPosts = [], isLoading: blogLoading } = useQuery({
    queryKey: ['content-opps-blog'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('id, title, content, slug, is_published')
        .eq('is_published', true)
        .order('title');
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: categories = [], isLoading: catsLoading } = useQuery({
    queryKey: ['content-opps-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, description, slug')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const thinProducts = products
    .map(p => ({ ...p, wordCount: countWords(p.description) }))
    .filter(p => p.wordCount < 400)
    .sort((a, b) => a.wordCount - b.wordCount);

  const thinCategories = categories
    .map(c => ({ ...c, wordCount: countWords(c.description) }))
    .filter(c => c.wordCount < 800)
    .sort((a, b) => a.wordCount - b.wordCount);

  const blogMissingLinks = blogPosts
    .filter(p => !hasInternalLinks(p.content))
    .map(p => ({ ...p, wordCount: countWords(p.content) }));

  const isLoading = productsLoading || blogLoading || catsLoading;

  if (isLoading) {
    return (
      <div className="container py-8 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
        <title>Content Opportunities | Admin</title>
      </Helmet>
      <div className="container py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Content Opportunities
          </h1>
          <p className="text-muted-foreground">Find thin content and SEO gaps to fix</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <ShoppingBag className="h-4 w-4" /> Thin Products (&lt;400 words)
              </CardDescription>
              <CardTitle className="text-2xl text-amber-600">{thinProducts.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" /> Thin Categories (&lt;800 words)
              </CardDescription>
              <CardTitle className="text-2xl text-amber-600">{thinCategories.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <Link2 className="h-4 w-4" /> Blog Posts Missing Links
              </CardDescription>
              <CardTitle className="text-2xl text-destructive">{blogMissingLinks.length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Thin Products */}
        <Card>
          <CardHeader>
            <CardTitle>Products Under 400 Words</CardTitle>
            <CardDescription>These product descriptions need SEO expansion (use-case, FAQ, internal links)</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Word Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {thinProducts.slice(0, 30).map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-[350px] truncate font-medium">{p.name}</TableCell>
                    <TableCell className="text-muted-foreground">{p.category || '—'}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={p.wordCount < 100 ? 'destructive' : 'secondary'}>
                        {p.wordCount}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {thinProducts.length > 30 && (
              <p className="text-sm text-muted-foreground mt-2">…and {thinProducts.length - 30} more</p>
            )}
          </CardContent>
        </Card>

        {/* Thin Categories */}
        <Card>
          <CardHeader>
            <CardTitle>Categories Under 800 Words</CardTitle>
            <CardDescription>Add buying guides, "Best for…" sections, and FAQ schema</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Word Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {thinCategories.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={c.wordCount < 200 ? 'destructive' : 'secondary'}>
                        {c.wordCount}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Blog Posts Missing Internal Links */}
        <Card>
          <CardHeader>
            <CardTitle>Blog Posts Without Internal Links</CardTitle>
            <CardDescription>Each blog post should have at least 5 internal links for authority flow</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Post Title</TableHead>
                  <TableHead className="text-right">Word Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {blogMissingLinks.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-[400px] truncate font-medium">{p.title}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{p.wordCount}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {blogMissingLinks.length === 0 && (
              <p className="text-sm text-green-600 mt-2">✓ All blog posts have internal links</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

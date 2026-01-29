import { Helmet } from 'react-helmet-async';

interface ArticleSchemaProps {
  article: {
    title: string;
    slug: string;
    excerpt: string;
    content: string;
    featuredImage?: string | null;
    category: string;
    tags?: string[] | null;
    authorName?: string | null;
    publishedAt?: string | null;
    modifiedAt?: string | null;
    readingTimeMinutes?: number | null;
  };
  baseUrl?: string;
}

export function ArticleSchema({ 
  article, 
  baseUrl = 'https://getpawsy.pet' 
}: ArticleSchemaProps) {
  const articleUrl = `${baseUrl}/blog/${article.slug}`;
  const publishDate = article.publishedAt || new Date().toISOString();
  const modifiedDate = article.modifiedAt || publishDate;
  
  // Clean content for word count
  const cleanContent = article.content
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const wordCount = cleanContent.split(' ').length;

  // Article Schema
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${articleUrl}#article`,
    headline: article.title.slice(0, 110), // Google recommends max 110 chars
    description: article.excerpt,
    image: article.featuredImage || `${baseUrl}/og-image.png`,
    datePublished: publishDate,
    dateModified: modifiedDate,
    wordCount: wordCount,
    articleSection: article.category,
    keywords: article.tags?.join(', ') || article.category,
    inLanguage: 'en-US',
    author: {
      '@type': 'Person',
      name: article.authorName || 'Pawsy Team',
      url: baseUrl,
    },
    publisher: {
      '@type': 'Organization',
      name: 'GetPawsy',
      logo: {
        '@type': 'ImageObject',
        url: `${baseUrl}/favicon.png`,
        width: 512,
        height: 512,
      },
      url: baseUrl,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': articleUrl,
    },
    isPartOf: {
      '@type': 'Blog',
      '@id': `${baseUrl}/blog#blog`,
      name: 'GetPawsy Pet Care Blog',
      description: 'Expert tips, guides, and advice for pet owners',
    },
    ...(article.readingTimeMinutes && {
      timeRequired: `PT${article.readingTimeMinutes}M`,
    }),
  };

  // Breadcrumb Schema
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    '@id': `${articleUrl}#breadcrumb`,
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: baseUrl,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Blog',
        item: `${baseUrl}/blog`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: article.category,
        item: `${baseUrl}/blog?category=${encodeURIComponent(article.category)}`,
      },
      {
        '@type': 'ListItem',
        position: 4,
        name: article.title,
        item: articleUrl,
      },
    ],
  };

  // WebPage Schema
  const webPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${articleUrl}#webpage`,
    url: articleUrl,
    name: article.title,
    description: article.excerpt,
    isPartOf: { '@id': `${baseUrl}/#website` },
    primaryImageOfPage: article.featuredImage ? {
      '@type': 'ImageObject',
      url: article.featuredImage,
    } : undefined,
    breadcrumb: { '@id': `${articleUrl}#breadcrumb` },
  };

  return (
    <Helmet>
      {/* Article-specific meta tags */}
      <meta property="article:published_time" content={publishDate} />
      <meta property="article:modified_time" content={modifiedDate} />
      <meta property="article:section" content={article.category} />
      {article.tags?.map((tag, index) => (
        <meta key={index} property="article:tag" content={tag} />
      ))}
      <meta property="article:author" content={article.authorName || 'Pawsy Team'} />

      {/* JSON-LD Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(articleSchema)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(breadcrumbSchema)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(webPageSchema)}
      </script>
    </Helmet>
  );
}

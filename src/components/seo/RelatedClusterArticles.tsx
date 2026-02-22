import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

interface RelatedArticle {
  slug: string;
  title: string;
  desc: string;
}

interface Props {
  heading?: string;
  subheading?: string;
  articles: RelatedArticle[];
  crossLinks?: { label: string; href: string }[];
}

export function RelatedClusterArticles({
  heading = 'Explore More Expert Guides',
  subheading = 'In-depth research and buying advice from our pet product team.',
  articles,
  crossLinks,
}: Props) {
  return (
    <section className="mb-16 bg-muted/30 rounded-2xl p-6 md:p-10">
      <h2 className="text-2xl font-display font-bold mb-1">{heading}</h2>
      <p className="text-muted-foreground text-sm mb-6">{subheading}</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {articles.map(a => (
          <Link
            key={a.slug}
            to={`/guides/${a.slug}`}
            className="group bg-background border rounded-xl p-4 hover:border-primary/30 hover:shadow-sm transition-all"
          >
            <h3 className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors">{a.title}</h3>
            <p className="text-xs text-muted-foreground">{a.desc}</p>
            <span className="inline-flex items-center gap-1 text-xs text-primary mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              Read guide <ArrowRight className="w-3 h-3" />
            </span>
          </Link>
        ))}
      </div>
      {crossLinks && crossLinks.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-3">
          {crossLinks.map(l => (
            <Link key={l.href} to={l.href} className="text-sm text-primary hover:underline font-medium">
              {l.label} →
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

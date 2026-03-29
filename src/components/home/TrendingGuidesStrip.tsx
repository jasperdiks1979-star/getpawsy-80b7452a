import { Link } from 'react-router-dom';
import { TrendingUp, ArrowRight, BadgeCheck, CalendarCheck } from 'lucide-react';
import { FadeInView } from '@/components/ui/FadeInView';

const TRENDING_GUIDES = [
  {
    path: '/best-cat-litter-box-2026',
    title: 'Best Cat Litter Box 2026',
    badge: '🔥 Trending Now',
    desc: 'Top-rated odor-control picks, tested & reviewed.',
    emoji: '🐱',
  },
  {
    path: '/best-dog-car-seat-safety',
    title: 'Best Dog Car Seat Safety',
    badge: '🔥 Trending Now',
    desc: 'Crash-tested seats for safe travel with your dog.',
    emoji: '🚗',
  },
  {
    path: '/best-interactive-cat-toys',
    title: 'Best Interactive Cat Toys',
    badge: '⭐ Expert Pick',
    desc: 'Keep indoor cats active and mentally stimulated.',
    emoji: '🎯',
  },
  {
    path: '/best-dog-anxiety-solutions',
    title: 'Best Dog Anxiety Solutions',
    badge: '⭐ Expert Pick',
    desc: 'Calming products that may help reduce stress.',
    emoji: '🐕',
  },
] as const;

export default function TrendingGuidesStrip() {
  return (
    <section className="py-8 md:py-10 bg-muted/30 border-b border-border/30">
      <div className="container px-4 md:px-6">
        <FadeInView className="flex items-center gap-2 mb-5">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h2 className="text-lg md:text-xl font-display font-bold text-foreground">
            Most Popular Guides
          </h2>
          <span className="ml-2 flex items-center gap-1 text-[10px] font-semibold bg-primary/10 text-primary rounded-full px-2 py-0.5">
            <CalendarCheck className="w-3 h-3" /> Updated 2026
          </span>
        </FadeInView>

        <FadeInView>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {TRENDING_GUIDES.map((g) => (
              <Link
                key={g.path}
                to={g.path}
                className="group relative rounded-xl border border-border/50 bg-card p-4 hover:border-primary/40 hover:shadow-md transition-all duration-200"
              >
                <span className="absolute top-2 right-2 text-[9px] font-bold bg-primary/10 text-primary rounded-full px-2 py-0.5">
                  {g.badge}
                </span>
                <span className="text-xl block mb-1.5">{g.emoji}</span>
                <h3 className="font-display font-semibold text-xs md:text-sm text-foreground group-hover:text-primary transition-colors mb-1 pr-12 sm:pr-0 leading-snug">
                  {g.title}
                </h3>
                <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2 leading-relaxed">
                  {g.desc}
                </p>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                  Read guide <ArrowRight className="w-3 h-3" />
                </span>
              </Link>
            ))}
          </div>
        </FadeInView>
      </div>
    </section>
  );
}

/**
 * SiloBackLinks — Contextual internal linking component for silo pages.
 * 
 * Renders back-links to the silo hub, pillar, and sibling sub-collections.
 * Enforces silo isolation: never links to the opposite animal silo.
 */

import { Link } from 'react-router-dom';
import { type SiloId, getSilo, type SiloLink } from '@/lib/silo-config';

interface SiloBackLinksProps {
  silo: SiloId;
  /** Current page path — excluded from rendered links */
  currentPath?: string;
  /** Show hub link */
  showHub?: boolean;
  /** Show pillar link */
  showPillar?: boolean;
  /** Show training/travel sub-hub links */
  showSubHubs?: boolean;
  /** Show sub-collection links */
  showCollections?: boolean;
  /** Max sub-collection links to show */
  maxCollections?: number;
  className?: string;
}

export function SiloBackLinks({
  silo,
  currentPath = '',
  showHub = true,
  showPillar = true,
  showSubHubs = true,
  showCollections = true,
  maxCollections = 3,
  className = '',
}: SiloBackLinksProps) {
  const config = getSilo(silo);
  const normalize = (p: string) => p.replace(/\/+$/, '');
  const isCurrent = (href: string) => normalize(href) === normalize(currentPath);

  const links: SiloLink[] = [];

  if (showHub && !isCurrent(config.hub.href)) links.push(config.hub);
  if (showPillar && !isCurrent(config.pillar.href)) links.push(config.pillar);
  if (showSubHubs) {
    if (!isCurrent(config.training.href)) links.push(config.training);
    if (!isCurrent(config.travel.href)) links.push(config.travel);
  }
  if (showCollections) {
    config.subCollections
      .filter(c => !isCurrent(c.href))
      .slice(0, maxCollections)
      .forEach(c => links.push(c));
  }

  if (links.length === 0) return null;

  return (
    <nav className={`py-8 ${className}`} aria-label={`Related ${silo} guides`}>
      <h2 className="text-2xl font-display font-bold mb-4">
        {silo === 'dog' ? 'Explore Dog Guides' : 'Explore Cat Guides'}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {links.map(link => (
          <Link
            key={link.href}
            to={link.href}
            className="group bg-card rounded-xl border border-border/40 p-5 hover:border-primary/30 hover:shadow-sm transition-all"
          >
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors mb-1">
              {link.label} →
            </h3>
            <p className="text-sm text-muted-foreground">{link.desc}</p>
          </Link>
        ))}
      </div>
    </nav>
  );
}

/**
 * StickyJumpNav — Sticky in-page navigation with jump links.
 * Increases dwell time and scroll depth. Phase 5 behavioral signal.
 */

import { useEffect, useState } from 'react';

interface JumpNavItem {
  id: string;
  label: string;
}

interface Props {
  items: JumpNavItem[];
}

export function StickyJumpNav({ items }: Props) {
  const [activeId, setActiveId] = useState('');
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Show after scrolling 400px
      setIsVisible(window.scrollY > 400);

      // Determine active section
      let current = '';
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 120) current = item.id;
        }
      }
      setActiveId(current);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [items]);

  if (!isVisible) return null;

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-sm border-b shadow-sm transition-all duration-200"
      aria-label="Page sections"
    >
      <div className="container overflow-x-auto">
        <div className="flex gap-1 py-2">
          {items.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`whitespace-nowrap text-xs px-3 py-1.5 rounded-full border transition-colors ${
                activeId === item.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted border-transparent'
              }`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              {item.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}

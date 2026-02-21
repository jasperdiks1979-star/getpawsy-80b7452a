import { List } from 'lucide-react';

interface TocItem {
  id: string;
  label: string;
}

interface CollectionTableOfContentsProps {
  items: TocItem[];
}

/** Jump-navigation table of contents for authority category pages */
export function CollectionTableOfContents({ items }: CollectionTableOfContentsProps) {
  if (items.length < 3) return null;

  return (
    <nav className="mb-10 border rounded-xl bg-card p-5 max-w-md" aria-label="Table of contents">
      <div className="flex items-center gap-2 mb-3">
        <List className="w-4 h-4 text-primary" />
        <span className="font-semibold text-sm">In This Guide</span>
      </div>
      <ol className="space-y-1.5">
        {items.map((item, i) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-2"
            >
              <span className="text-xs text-primary/60 font-mono w-4">{i + 1}.</span>
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Generate standard ToC items for priority category pages */
export function getCollectionTocItems(hasComparison: boolean, hasFaq: boolean): TocItem[] {
  const items: TocItem[] = [
    { id: 'products', label: 'Shop Products' },
    { id: 'expert-guides', label: 'Expert Guides' },
  ];
  if (hasComparison) {
    items.splice(1, 0, { id: 'comparison', label: 'Comparison Table' });
  }
  if (hasFaq) {
    items.push({ id: 'faq', label: 'Frequently Asked Questions' });
  }
  items.push({ id: 'trust', label: 'Why Shop With Us' });
  return items;
}

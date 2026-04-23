import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, ExternalLink, RotateCcw, ClipboardList } from 'lucide-react';

const STORAGE_KEY = 'gp_gmc_review_checklist_v1';

interface ChecklistItem {
  id: string;
  label: string;
  hint?: string;
  href?: string; // internal link
  external?: string; // external URL
}

interface ChecklistSection {
  id: string;
  title: string;
  description: string;
  items: ChecklistItem[];
}

const SECTIONS: ChecklistSection[] = [
  {
    id: 'pages',
    title: '1. Verify policy & contact pages are live',
    description:
      'Open each page in an incognito window. Confirm US identity (GetPawsy LLC, New York, NY) is visible and consistent.',
    items: [
      { id: 'page-contact', label: 'Contact page shows US identity + support email', href: '/contact' },
      { id: 'page-about', label: 'About page references GetPawsy LLC, New York, NY', href: '/about' },
      { id: 'page-shipping', label: 'Shipping page lists US delivery times & free shipping threshold', href: '/shipping' },
      { id: 'page-returns', label: '30-day return policy is visible and accurate', href: '/returns' },
      { id: 'page-privacy', label: 'Privacy Policy mentions US jurisdiction', href: '/privacy' },
      { id: 'page-terms', label: 'Terms of Service governed by State of New York', href: '/terms' },
      { id: 'page-footer', label: 'Footer shows GetPawsy LLC + support email on every page' },
    ],
  },
  {
    id: 'feed',
    title: '2. Refresh the product feed',
    description: 'Push the freshly published data to Google Merchant Center.',
    items: [
      {
        id: 'feed-publish',
        label: 'Site has been Published (latest changes are live)',
        hint: 'Click Publish → Update in the Lovable editor before continuing.',
      },
      {
        id: 'feed-refresh',
        label: 'Run “Refresh feed now” on the Merchant Integration page',
        href: '/admin/integrations/merchant',
      },
      {
        id: 'feed-validate',
        label: 'Feed Status card shows healthy validation (0 fail)',
        href: '/admin/integrations/merchant',
      },
    ],
  },
  {
    id: 'gmc-diagnostics',
    title: '3. Merchant Center → Diagnostics → Fetch Now',
    description:
      'In Google Merchant Center, force a fresh fetch of the feed so the reviewer sees the latest product data.',
    items: [
      {
        id: 'gmc-open',
        label: 'Open Merchant Center → Products → Diagnostics',
        external: 'https://merchants.google.com/mc/diagnostics',
      },
      {
        id: 'gmc-fetch',
        label: 'Click “Fetch Now” on the primary feed (merchant-feed.xml)',
      },
      {
        id: 'gmc-wait',
        label: 'Wait for fetch to complete (usually 5–15 min) and confirm item count matches',
      },
      {
        id: 'gmc-noissues',
        label: 'No new critical item-level issues appear after the fetch',
      },
    ],
  },
  {
    id: 'gmc-review',
    title: '4. Merchant Center → Request Review',
    description:
      'Submit the appeal once the feed and policy pages are confirmed correct.',
    items: [
      {
        id: 'review-open',
        label: 'Open Merchant Center → Account issues',
        external: 'https://merchants.google.com/mc/accountissues',
      },
      {
        id: 'review-read',
        label: 'Read the suspension reason and confirm it matches “Misrepresentation”',
      },
      {
        id: 'review-submit',
        label: 'Click “Request review” and submit appeal',
        hint:
          'Suggested note: “Business identity has been updated to GetPawsy LLC, New York, NY. All Dutch references have been removed. Contact, About, Shipping, Returns, Privacy and Terms pages now reflect a US-only operation. Feed has been re-fetched.”',
      },
      {
        id: 'review-monitor',
        label: 'Monitor account status for 3–7 days for review outcome',
      },
    ],
  },
];

export default function MerchantReviewChecklistPage() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setChecked(JSON.parse(raw));
    } catch {
      // ignore parse errors
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(checked));
    } catch {
      // ignore quota errors
    }
  }, [checked]);

  const allItems = useMemo(() => SECTIONS.flatMap((s) => s.items), []);
  const totalCount = allItems.length;
  const doneCount = allItems.filter((i) => checked[i.id]).length;
  const pct = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);

  const toggle = (id: string) =>
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  const reset = () => setChecked({});

  return (
    <>
      <Helmet>
        <title>Merchant Center Review Checklist | Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="p-6 space-y-6 max-w-4xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ClipboardList className="h-6 w-6" />
              Merchant Center Review Checklist
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Step-by-step checklist for resolving the GMC suspension. Progress is saved
              locally in your browser.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                Progress: {doneCount} / {totalCount} steps complete
              </span>
              <Badge variant={pct === 100 ? 'default' : 'secondary'}>{pct}%</Badge>
            </div>
            <Progress value={pct} />
            {pct === 100 && (
              <p className="text-sm text-primary flex items-center gap-2 pt-1">
                <CheckCircle2 className="h-4 w-4" />
                Ready to submit the GMC review appeal.
              </p>
            )}
          </CardContent>
        </Card>

        {SECTIONS.map((section) => {
          const sectionDone = section.items.filter((i) => checked[i.id]).length;
          return (
            <Card key={section.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{section.title}</CardTitle>
                    <CardDescription>{section.description}</CardDescription>
                  </div>
                  <Badge variant="outline">
                    {sectionDone} / {section.items.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {section.items.map((item, idx) => {
                    const isChecked = !!checked[item.id];
                    return (
                      <li key={item.id}>
                        <div className="flex items-start gap-3">
                          <Checkbox
                            id={item.id}
                            checked={isChecked}
                            onCheckedChange={() => toggle(item.id)}
                            className="mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <label
                              htmlFor={item.id}
                              className={`text-sm cursor-pointer ${
                                isChecked ? 'text-muted-foreground line-through' : 'text-foreground'
                              }`}
                            >
                              {item.label}
                            </label>
                            {item.hint && (
                              <p className="text-xs text-muted-foreground mt-1">{item.hint}</p>
                            )}
                            {(item.href || item.external) && (
                              <div className="mt-1">
                                {item.href && (
                                  <Link
                                    to={item.href}
                                    className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                                  >
                                    Open page
                                    <ExternalLink className="h-3 w-3" />
                                  </Link>
                                )}
                                {item.external && (
                                  <a
                                    href={item.external}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                                  >
                                    Open in Merchant Center
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        {idx < section.items.length - 1 && <Separator className="mt-3" />}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
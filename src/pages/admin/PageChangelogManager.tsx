import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  CalendarDays,
  GitCommit,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
  ExternalLink,
  History,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

/**
 * Admin: per-page changelog manager.
 *
 * Lets admins create, edit, publish/unpublish and delete entries that show
 * up inside the inline <PageChangelog /> on /contact, /about, /shipping,
 * /return-policy, /privacy-policy, /terms-of-service and /cookie-policy.
 *
 * Each entry mirrors the original static schema (date, build tag, commit
 * ref, bullet changes) and an admin-only `is_published` toggle for staging
 * an upcoming release without exposing it to visitors.
 */

type PageKey =
  | 'contact'
  | 'about'
  | 'shipping'
  | 'returns'
  | 'privacy'
  | 'terms'
  | 'cookies';

interface ChangelogRow {
  id: string;
  page_key: PageKey;
  entry_date: string; // YYYY-MM-DD
  build_tag: string;
  commit_ref: string;
  changes: string[];
  sort_order: number;
  is_published: boolean;
  updated_at: string;
}

/**
 * Tab definition: pageKey + the public route it surfaces on, so admins can
 * jump straight to the live page from the editor.
 */
const PAGES: Array<{ key: PageKey; label: string; href: string }> = [
  { key: 'contact', label: 'Contact', href: '/contact' },
  { key: 'about', label: 'About', href: '/about' },
  { key: 'shipping', label: 'Shipping', href: '/shipping' },
  { key: 'returns', label: 'Returns', href: '/return-policy' },
  { key: 'privacy', label: 'Privacy', href: '/privacy-policy' },
  { key: 'terms', label: 'Terms', href: '/terms-of-service' },
  { key: 'cookies', label: 'Cookies', href: '/cookie-policy' },
];

interface DraftEntry {
  id?: string;
  entry_date: string;
  build_tag: string;
  commit_ref: string;
  changes_text: string; // textarea — one bullet per line
  is_published: boolean;
  sort_order: number;
}

function emptyDraft(): DraftEntry {
  return {
    entry_date: new Date().toISOString().slice(0, 10),
    build_tag: '',
    commit_ref: '',
    changes_text: '',
    is_published: true,
    sort_order: 0,
  };
}

function rowToDraft(row: ChangelogRow): DraftEntry {
  return {
    id: row.id,
    entry_date: row.entry_date,
    build_tag: row.build_tag,
    commit_ref: row.commit_ref,
    changes_text: (row.changes ?? []).join('\n'),
    is_published: row.is_published,
    sort_order: row.sort_order,
  };
}

export default function PageChangelogManager() {
  const [activeKey, setActiveKey] = useState<PageKey>('contact');
  const [rows, setRows] = useState<ChangelogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DraftEntry | null>(null);
  const [saving, setSaving] = useState(false);

  const loadRows = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('page_changelog_entries')
      .select(
        'id,page_key,entry_date,build_tag,commit_ref,changes,sort_order,is_published,updated_at',
      )
      .order('entry_date', { ascending: false })
      .order('sort_order', { ascending: false });
    if (error) {
      console.error('[PageChangelogManager] load failed', error);
      toast.error('Could not load changelog entries');
      setRows([]);
    } else {
      setRows((data ?? []) as ChangelogRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadRows();
  }, []);

  const filtered = useMemo(
    () => rows.filter((r) => r.page_key === activeKey),
    [rows, activeKey],
  );

  const counts = useMemo(() => {
    const map: Record<PageKey, { total: number; published: number }> = {
      contact: { total: 0, published: 0 },
      about: { total: 0, published: 0 },
      shipping: { total: 0, published: 0 },
      returns: { total: 0, published: 0 },
      privacy: { total: 0, published: 0 },
      terms: { total: 0, published: 0 },
      cookies: { total: 0, published: 0 },
    };
    for (const r of rows) {
      map[r.page_key].total += 1;
      if (r.is_published) map[r.page_key].published += 1;
    }
    return map;
  }, [rows]);

  const onSave = async () => {
    if (!editing) return;
    if (!editing.entry_date || !editing.build_tag.trim() || !editing.commit_ref.trim()) {
      toast.error('Date, build tag and commit ref are required');
      return;
    }
    const changes = editing.changes_text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (changes.length === 0) {
      toast.error('Add at least one bullet point');
      return;
    }

    setSaving(true);
    try {
      if (editing.id) {
        const { error } = await supabase
          .from('page_changelog_entries')
          .update({
            entry_date: editing.entry_date,
            build_tag: editing.build_tag.trim(),
            commit_ref: editing.commit_ref.trim(),
            changes,
            is_published: editing.is_published,
            sort_order: editing.sort_order,
          })
          .eq('id', editing.id);
        if (error) throw error;
        toast.success('Entry updated');
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const { error } = await supabase.from('page_changelog_entries').insert({
          page_key: activeKey,
          entry_date: editing.entry_date,
          build_tag: editing.build_tag.trim(),
          commit_ref: editing.commit_ref.trim(),
          changes,
          is_published: editing.is_published,
          sort_order: editing.sort_order,
          created_by: userData.user?.id ?? null,
        });
        if (error) throw error;
        toast.success('Entry created');
      }
      setEditing(null);
      await loadRows();
    } catch (e) {
      console.error('[PageChangelogManager] save failed', e);
      toast.error('Save failed — see console for details');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (row: ChangelogRow) => {
    if (!confirm(`Delete entry "${row.build_tag}" (${row.entry_date})?`)) return;
    const { error } = await supabase
      .from('page_changelog_entries')
      .delete()
      .eq('id', row.id);
    if (error) {
      console.error(error);
      toast.error('Delete failed');
      return;
    }
    toast.success('Entry deleted');
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  const onTogglePublish = async (row: ChangelogRow) => {
    const { error } = await supabase
      .from('page_changelog_entries')
      .update({ is_published: !row.is_published })
      .eq('id', row.id);
    if (error) {
      console.error(error);
      toast.error('Could not update publish state');
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id ? { ...r, is_published: !row.is_published } : r,
      ),
    );
    toast.success(row.is_published ? 'Hidden from public page' : 'Published live');
  };

  const activePage = PAGES.find((p) => p.key === activeKey)!;

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <Helmet>
        <title>Page Changelog Manager · GetPawsy Admin</title>
      </Helmet>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <History className="h-6 w-6 text-primary" />
            Page Changelog Manager
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Manage the inline “Page changelog” block that shows on contact and
            policy pages. Each entry has a date, build tag, commit ref and
            bullet points — and is shown on the matching live page when
            published.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadRows} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setEditing(emptyDraft())}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New entry
          </Button>
        </div>
      </div>

      <Tabs value={activeKey} onValueChange={(v) => setActiveKey(v as PageKey)}>
        <TabsList className="flex flex-wrap h-auto">
          {PAGES.map((p) => (
            <TabsTrigger key={p.key} value={p.key} className="gap-2">
              <span>{p.label}</span>
              <Badge
                variant="secondary"
                className="h-5 px-1.5 text-[10px] font-mono"
              >
                {counts[p.key].published}/{counts[p.key].total}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {PAGES.map((p) => (
          <TabsContent key={p.key} value={p.key} className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <CardTitle className="text-lg">{p.label} page</CardTitle>
                    <CardDescription>
                      Surfaces inside <code className="text-xs">{p.href}</code> via{' '}
                      <code className="text-xs">&lt;PageChangelog pageKey="{p.key}" /&gt;</code>
                    </CardDescription>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <a href={p.href} target="_blank" rel="noopener noreferrer">
                      View live
                      <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                    </a>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-12 text-sm text-muted-foreground">
                    No entries yet for this page.
                    <div className="mt-3">
                      <Button size="sm" onClick={() => setEditing(emptyDraft())}>
                        <Plus className="h-4 w-4 mr-1.5" />
                        Add the first entry
                      </Button>
                    </div>
                  </div>
                ) : (
                  <ol className="space-y-3">
                    {filtered.map((row) => (
                      <li
                        key={row.id}
                        className={cn(
                          'rounded-lg border bg-card p-4',
                          !row.is_published && 'border-dashed opacity-70',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="space-y-1.5 min-w-0">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                                <CalendarDays className="h-3 w-3" />
                                {row.entry_date}
                              </span>
                              <Badge className="bg-primary/10 text-primary hover:bg-primary/15 border-0">
                                {row.build_tag}
                              </Badge>
                              <span className="inline-flex items-center gap-1 font-mono text-muted-foreground">
                                <GitCommit className="h-3 w-3" />
                                {row.commit_ref}
                              </span>
                              {row.is_published ? (
                                <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700">
                                  Published
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                                  Draft
                                </Badge>
                              )}
                            </div>
                            <ul className="list-disc pl-5 space-y-0.5 text-sm text-foreground">
                              {row.changes.map((c, i) => (
                                <li key={i}>{c}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onTogglePublish(row)}
                              title={row.is_published ? 'Unpublish' : 'Publish'}
                            >
                              {row.is_published ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditing(rowToDraft(row))}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onDelete(row)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Editor dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? 'Edit changelog entry' : 'New changelog entry'}
            </DialogTitle>
            <DialogDescription>
              For page{' '}
              <code className="text-xs">{activePage.label}</code> ({activePage.href})
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="entry_date">Date</Label>
                  <Input
                    id="entry_date"
                    type="date"
                    value={editing.entry_date}
                    onChange={(e) =>
                      setEditing({ ...editing, entry_date: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="build_tag">Build tag</Label>
                  <Input
                    id="build_tag"
                    placeholder="v2026.04.23 — US identity rollout"
                    value={editing.build_tag}
                    onChange={(e) =>
                      setEditing({ ...editing, build_tag: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="commit_ref">Commit ref</Label>
                  <Input
                    id="commit_ref"
                    placeholder="bcf6c8d"
                    value={editing.commit_ref}
                    onChange={(e) =>
                      setEditing({ ...editing, commit_ref: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sort_order">Sort order</Label>
                  <Input
                    id="sort_order"
                    type="number"
                    value={editing.sort_order}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        sort_order: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="is_published">Status</Label>
                  <Select
                    value={editing.is_published ? 'published' : 'draft'}
                    onValueChange={(v) =>
                      setEditing({ ...editing, is_published: v === 'published' })
                    }
                  >
                    <SelectTrigger id="is_published">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="published">Published (live)</SelectItem>
                      <SelectItem value="draft">Draft (hidden)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="changes_text">
                  Bullet points
                  <span className="text-xs text-muted-foreground font-normal ml-2">
                    one per line
                  </span>
                </Label>
                <Textarea
                  id="changes_text"
                  rows={8}
                  placeholder={'Removed EU/NL address lines...\nUpdated support email...'}
                  value={editing.changes_text}
                  onChange={(e) =>
                    setEditing({ ...editing, changes_text: e.target.value })
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
              <X className="h-4 w-4 mr-1.5" />
              Cancel
            </Button>
            <Button onClick={onSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Save className="h-4 w-4 mr-1.5" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-muted-foreground">
        Tip: each entry’s build tag can be matched to a release record on the{' '}
        <Link to="/admin/integrations/merchant" className="underline">
          Merchant Integration page
        </Link>{' '}
        — the inline “View release” link in the public changelog will then deep-link to that record.
      </p>
    </div>
  );
}
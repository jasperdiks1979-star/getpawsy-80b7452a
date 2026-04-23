import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type ReleaseIssueStatus = 'open' | 'in_progress' | 'resolved';
export type ReleaseIssueSource = 'validation_fail' | 'custom';

export interface ReleaseIssue {
  id: string;
  release_id: string;
  issue_key: string;
  source: ReleaseIssueSource;
  title: string;
  description: string | null;
  status: ReleaseIssueStatus;
  assignee_id: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminAssignee {
  id: string;
  email: string | null;
  display_name: string | null;
}

export const STATUS_LABELS: Record<ReleaseIssueStatus, string> = {
  open: 'Open',
  in_progress: 'In behandeling',
  resolved: 'Opgelost',
};

/**
 * Hook: load + mutate release_report_issues for one release.
 *
 * - Auto-imports any new validation_fail items from `topFailReasons` so the
 *   admin always has a row per known feed-validation issue.
 * - Exposes `assignees` (admin users) for the dropdown — cached at module scope.
 */
let assigneesCache: AdminAssignee[] | null = null;
let assigneesPromise: Promise<AdminAssignee[]> | null = null;

async function loadAssignees(): Promise<AdminAssignee[]> {
  if (assigneesCache) return assigneesCache;
  if (assigneesPromise) return assigneesPromise;
  assigneesPromise = (async () => {
    const { data, error } = await supabase.rpc('list_admin_assignees');
    if (error) {
      console.error('[useReleaseIssues] loadAssignees failed:', error);
      return [];
    }
    const list = (data ?? []) as AdminAssignee[];
    assigneesCache = list;
    return list;
  })();
  const result = await assigneesPromise;
  assigneesPromise = null;
  return result;
}

export function useReleaseIssues(
  releaseId: string,
  topFailReasons: Array<[string, number]> | null | undefined,
) {
  const [issues, setIssues] = useState<ReleaseIssue[] | null>(null);
  const [assignees, setAssignees] = useState<AdminAssignee[]>(assigneesCache ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const failReasons = useMemo(
    () =>
      Array.isArray(topFailReasons)
        ? topFailReasons.filter(
            (r): r is [string, number] => Array.isArray(r) && typeof r[0] === 'string',
          )
        : [],
    [topFailReasons],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('release_report_issues')
      .select('*')
      .eq('release_id', releaseId)
      .order('created_at', { ascending: true });
    if (err) {
      setError(err.message);
      setIssues([]);
      setLoading(false);
      return;
    }
    let rows = (data ?? []) as ReleaseIssue[];

    // Auto-seed any validation_fail issues we haven't tracked yet so the
    // admin gets one row per known feed failure without manual setup.
    const existingKeys = new Set(rows.map((r) => r.issue_key));
    const toInsert = failReasons
      .map(([reason, count]) => ({
        key: `validation_fail:${reason}`,
        title: reason,
        description: `Auto-detected from validate-merchant-feed (${count} occurrence${count === 1 ? '' : 's'}).`,
      }))
      .filter((x) => !existingKeys.has(x.key));

    if (toInsert.length > 0) {
      const { data: inserted, error: insErr } = await supabase
        .from('release_report_issues')
        .insert(
          toInsert.map((x) => ({
            release_id: releaseId,
            issue_key: x.key,
            source: 'validation_fail' as const,
            title: x.title,
            description: x.description,
          })),
        )
        .select('*');
      if (insErr) {
        // Non-fatal — the panel still works with manual issues.
        console.warn('[useReleaseIssues] auto-seed failed:', insErr);
      } else if (inserted) {
        rows = [...rows, ...(inserted as ReleaseIssue[])];
      }
    }

    setIssues(rows);
    setLoading(false);
  }, [releaseId, failReasons]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void loadAssignees().then((list) => {
      if (!cancelled) setAssignees(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateIssue = useCallback(
    async (id: string, patch: Partial<Pick<ReleaseIssue, 'status' | 'assignee_id' | 'description' | 'title'>>) => {
      const { data, error: err } = await supabase
        .from('release_report_issues')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (err) {
        toast.error(`Issue update faalde: ${err.message}`);
        return;
      }
      setIssues((prev) =>
        prev ? prev.map((i) => (i.id === id ? (data as ReleaseIssue) : i)) : prev,
      );
    },
    [],
  );

  const addCustomIssue = useCallback(
    async (title: string, description?: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      const userResp = await supabase.auth.getUser();
      const userId = userResp.data.user?.id ?? null;
      const issueKey = `custom:${crypto.randomUUID()}`;
      const { data, error: err } = await supabase
        .from('release_report_issues')
        .insert({
          release_id: releaseId,
          issue_key: issueKey,
          source: 'custom' as const,
          title: trimmed,
          description: description?.trim() || null,
          created_by: userId,
        })
        .select('*')
        .single();
      if (err) {
        toast.error(`Issue toevoegen faalde: ${err.message}`);
        return;
      }
      setIssues((prev) => (prev ? [...prev, data as ReleaseIssue] : [data as ReleaseIssue]));
      toast.success('Issue toegevoegd');
    },
    [releaseId],
  );

  const deleteIssue = useCallback(async (id: string) => {
    const { error: err } = await supabase
      .from('release_report_issues')
      .delete()
      .eq('id', id);
    if (err) {
      toast.error(`Issue verwijderen faalde: ${err.message}`);
      return;
    }
    setIssues((prev) => (prev ? prev.filter((i) => i.id !== id) : prev));
  }, []);

  return {
    issues,
    assignees,
    loading,
    error,
    reload: load,
    updateIssue,
    addCustomIssue,
    deleteIssue,
  };
}
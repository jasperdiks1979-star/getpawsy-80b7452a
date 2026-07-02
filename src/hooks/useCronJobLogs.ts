import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CronJobLog {
  id: string;
  job_name: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  success: boolean | null;
  items_processed: number;
  items_failed: number;
  error_message: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface CronJobSummary {
  job_name: string;
  display_name: string;
  schedule: string;
  last_run: CronJobLog | null;
  last_success: CronJobLog | null;
  runs_24h: number;
  success_rate_24h: number;
}

const KNOWN_JOBS: Record<string, { displayName: string; schedule: string }> = {
  'nightly-stock-sync': {
    displayName: 'Voorraad Sync',
    schedule: '03:00 UTC (05:00 CET)',
  },
  'nightly-variant-data-fix': {
    displayName: 'Variant Data Fix',
    schedule: '03:30 UTC (05:30 CET)',
  },
  'daily-cj-packaging-sync': {
    displayName: 'CJ Verpakking Sync',
    schedule: '04:00 UTC (06:00 CET)',
  },
  'nightly-competitor-scrape': {
    displayName: 'Competitor Scrape',
    schedule: '04:00 UTC (06:00 CET)',
  },
  'process-scheduled-campaigns': {
    displayName: 'Nieuwsbrief Scheduler',
    schedule: 'Elke 5 minuten',
  },
  'cj-google-merchant-sync': {
    displayName: 'CJ → Google Merchant Sync',
    schedule: 'Elke 6 uur (00:00, 06:00, 12:00, 18:00 UTC)',
  },
  'daily-auto-publish-guides': {
    displayName: 'Auto Guide Publisher',
    schedule: '03:00 UTC (05:00 CET)',
  },
  'canonical-ingest-recent': {
    displayName: 'Canonical Ingest (near real-time)',
    schedule: 'Elke 3 minuten',
  },
};

export const useCronJobLogs = (limit = 50) => {
  return useQuery({
    queryKey: ['cron-job-logs', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cron_job_logs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as CronJobLog[];
    },
  });
};

export const useCronJobSummaries = () => {
  return useQuery({
    queryKey: ['cron-job-summaries'],
    queryFn: async () => {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Get all logs from last 24 hours
      const { data: recentLogs, error: recentError } = await supabase
        .from('cron_job_logs')
        .select('*')
        .gte('started_at', twentyFourHoursAgo)
        .order('started_at', { ascending: false });

      if (recentError) throw recentError;

      // Get latest run for each known job
      const summaries: CronJobSummary[] = [];

      for (const [jobName, jobInfo] of Object.entries(KNOWN_JOBS)) {
        const jobLogs = (recentLogs as CronJobLog[]).filter(log => log.job_name === jobName);
        const completedLogs = jobLogs.filter(log => log.status === 'completed');
        const successfulLogs = completedLogs.filter(log => log.success === true);

        // Get absolute last run (may be older than 24h)
        const { data: lastRunData } = await supabase
          .from('cron_job_logs')
          .select('*')
          .eq('job_name', jobName)
          .order('started_at', { ascending: false })
          .limit(1);

        // Get last successful run
        const { data: lastSuccessData } = await supabase
          .from('cron_job_logs')
          .select('*')
          .eq('job_name', jobName)
          .eq('success', true)
          .order('started_at', { ascending: false })
          .limit(1);

        summaries.push({
          job_name: jobName,
          display_name: jobInfo.displayName,
          schedule: jobInfo.schedule,
          last_run: (lastRunData?.[0] as CronJobLog) || null,
          last_success: (lastSuccessData?.[0] as CronJobLog) || null,
          runs_24h: completedLogs.length,
          success_rate_24h: completedLogs.length > 0 
            ? Math.round((successfulLogs.length / completedLogs.length) * 100) 
            : 0,
        });
      }

      return summaries;
    },
    refetchInterval: 60000, // Refetch every minute
  });
};

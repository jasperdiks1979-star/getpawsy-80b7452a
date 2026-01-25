-- Add column to track last follow-up email sent
ALTER TABLE public.disputes 
ADD COLUMN IF NOT EXISTS last_followup_sent_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add index for efficient querying of stale disputes
CREATE INDEX IF NOT EXISTS idx_disputes_followup_status 
ON public.disputes (status, updated_at, last_followup_sent_at) 
WHERE status IN ('pending', 'under_review');
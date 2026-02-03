-- Add scheduling fields to email_campaigns table
ALTER TABLE public.email_campaigns
ADD COLUMN IF NOT EXISTS scheduled_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS recurrence_pattern text, -- 'weekly', 'biweekly', 'monthly'
ADD COLUMN IF NOT EXISTS recurrence_day integer, -- 0-6 for day of week, 1-28 for day of month
ADD COLUMN IF NOT EXISTS recurrence_time time, -- Time of day to send
ADD COLUMN IF NOT EXISTS last_recurring_sent_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS next_recurring_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS is_ai_generated boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_prompt text,
ADD COLUMN IF NOT EXISTS ai_content_type text; -- 'new_products', 'bestsellers', 'tips', 'mixed'

-- Create index for scheduled campaigns
CREATE INDEX IF NOT EXISTS idx_email_campaigns_scheduled 
ON public.email_campaigns(scheduled_at) 
WHERE scheduled_at IS NOT NULL AND status = 'scheduled';

-- Create index for recurring campaigns
CREATE INDEX IF NOT EXISTS idx_email_campaigns_recurring 
ON public.email_campaigns(next_recurring_at) 
WHERE is_recurring = true AND status = 'active';
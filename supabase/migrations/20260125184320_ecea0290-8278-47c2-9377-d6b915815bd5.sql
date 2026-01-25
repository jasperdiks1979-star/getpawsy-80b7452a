-- Fix 1: Newsletter subscribers - validate email format and limit rate
DROP POLICY IF EXISTS "Anyone can subscribe to newsletter" ON public.newsletter_subscribers;
CREATE POLICY "Anyone can subscribe with valid email"
ON public.newsletter_subscribers
FOR INSERT
WITH CHECK (
  email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  AND length(email) <= 255
);

-- Fix 2: Stock notifications - validate email format
DROP POLICY IF EXISTS "Anyone can sign up for stock notifications" ON public.stock_notifications;
CREATE POLICY "Anyone can sign up with valid email"
ON public.stock_notifications
FOR INSERT
WITH CHECK (
  email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  AND length(email) <= 255
);

-- Fix 3: Contact messages - add length validation
DROP POLICY IF EXISTS "Anyone can submit contact messages" ON public.contact_messages;
CREATE POLICY "Anyone can submit valid contact messages"
ON public.contact_messages
FOR INSERT
WITH CHECK (
  email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  AND length(email) <= 255
  AND length(name) >= 2 AND length(name) <= 100
  AND length(subject) >= 3 AND length(subject) <= 200
  AND length(message) >= 10 AND length(message) <= 5000
);

-- Fix 4: Frontend error logs - add size limits to prevent abuse
DROP POLICY IF EXISTS "Anyone can insert error logs" ON public.frontend_error_logs;
CREATE POLICY "Anyone can insert valid error logs"
ON public.frontend_error_logs
FOR INSERT
WITH CHECK (
  length(error_message) <= 2000
  AND (stack_trace IS NULL OR length(stack_trace) <= 10000)
  AND length(error_type) <= 100
);

-- Fix 5: Visitor activity - add session_id validation
DROP POLICY IF EXISTS "Anyone can insert visitor activity" ON public.visitor_activity;
CREATE POLICY "Anyone can insert valid visitor activity"
ON public.visitor_activity
FOR INSERT
WITH CHECK (
  length(session_id) >= 16
  AND length(session_id) <= 100
  AND activity_type IN ('browsing', 'cart', 'checkout')
);
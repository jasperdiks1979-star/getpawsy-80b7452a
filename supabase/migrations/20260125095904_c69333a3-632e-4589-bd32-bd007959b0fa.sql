-- Create disputes table for customer complaints
CREATE TABLE public.disputes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_email TEXT NOT NULL,
  dispute_type TEXT NOT NULL CHECK (dispute_type IN ('damaged', 'not_received', 'wrong_item', 'quality_issue', 'other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'awaiting_evidence', 'processing_with_supplier', 'resolved_refund', 'resolved_replacement', 'resolved_partial_refund', 'denied')),
  description TEXT NOT NULL,
  customer_evidence JSONB DEFAULT '[]'::jsonb,
  admin_notes TEXT,
  cj_dispute_id TEXT,
  resolution_type TEXT CHECK (resolution_type IN ('full_refund', 'partial_refund', 'replacement', 'store_credit', 'denied')),
  resolution_amount NUMERIC,
  resolution_notes TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create dispute messages table for communication thread
CREATE TABLE public.dispute_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'admin', 'system')),
  sender_id UUID,
  message TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  is_internal BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for disputes
CREATE POLICY "Admins can view all disputes"
  ON public.disputes FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update disputes"
  ON public.disputes FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete disputes"
  ON public.disputes FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can create disputes"
  ON public.disputes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Customers can view their own disputes"
  ON public.disputes FOR SELECT
  USING (
    customer_email IN (
      SELECT email FROM public.profiles WHERE id = auth.uid()
    )
  );

-- RLS policies for dispute messages
CREATE POLICY "Admins can view all dispute messages"
  ON public.dispute_messages FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert dispute messages"
  ON public.dispute_messages FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR sender_type = 'customer');

CREATE POLICY "Customers can view non-internal messages for their disputes"
  ON public.dispute_messages FOR SELECT
  USING (
    is_internal = false AND
    EXISTS (
      SELECT 1 FROM public.disputes d
      WHERE d.id = dispute_id
      AND d.customer_email IN (
        SELECT email FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Service role can manage disputes"
  ON public.disputes FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage dispute messages"
  ON public.dispute_messages FOR ALL
  USING (auth.role() = 'service_role');

-- Create indexes for performance
CREATE INDEX idx_disputes_order_id ON public.disputes(order_id);
CREATE INDEX idx_disputes_status ON public.disputes(status);
CREATE INDEX idx_disputes_customer_email ON public.disputes(customer_email);
CREATE INDEX idx_dispute_messages_dispute_id ON public.dispute_messages(dispute_id);

-- Update trigger for disputes
CREATE TRIGGER update_disputes_updated_at
  BEFORE UPDATE ON public.disputes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
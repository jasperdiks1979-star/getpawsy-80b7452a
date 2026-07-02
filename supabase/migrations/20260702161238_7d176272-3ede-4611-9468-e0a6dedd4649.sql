CREATE TABLE IF NOT EXISTS public.us_traffic_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  channel TEXT NOT NULL,
  utm_source TEXT NOT NULL,
  utm_medium TEXT NOT NULL DEFAULT 'cpc',
  utm_campaign TEXT NOT NULL,
  landing_page TEXT,
  daily_budget_usd NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  launched_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (utm_campaign)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.us_traffic_campaigns TO authenticated;
GRANT ALL ON public.us_traffic_campaigns TO service_role;

ALTER TABLE public.us_traffic_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage us_traffic_campaigns"
  ON public.us_traffic_campaigns FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_us_traffic_campaigns_status ON public.us_traffic_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_us_traffic_campaigns_utm_campaign ON public.us_traffic_campaigns(utm_campaign);

CREATE OR REPLACE FUNCTION public.update_us_traffic_campaigns_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_us_traffic_campaigns_updated_at ON public.us_traffic_campaigns;
CREATE TRIGGER trg_us_traffic_campaigns_updated_at
BEFORE UPDATE ON public.us_traffic_campaigns
FOR EACH ROW EXECUTE FUNCTION public.update_us_traffic_campaigns_updated_at();

-- Seed the two ready-to-run US Google Ads campaigns already documented in
-- public/data/google-ads-copy.json so tracking works the moment they launch.
INSERT INTO public.us_traffic_campaigns
  (name, channel, utm_source, utm_medium, utm_campaign, landing_page, daily_budget_usd, status, notes)
VALUES
  ('Cat Litter Box — US Search', 'google_ads', 'google', 'cpc', 'us_litter_box_search',
   '/best-cat-litter-box-2026', 10,
   'draft', 'Manual CPC $0.40–$0.80. US-only. Ad group: Cat Litter Boxes.'),
  ('Dog Car Seat Safety — US Search', 'google_ads', 'google', 'cpc', 'us_dog_car_seat_safety',
   '/best-dog-car-seat-safety', 10,
   'draft', 'Manual CPC $0.40–$0.80. US-only. Ad group: Dog Car Seats.')
ON CONFLICT (utm_campaign) DO NOTHING;
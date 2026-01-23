-- Create table for storing Google Sheets export history
CREATE TABLE public.google_sheets_exports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  spreadsheet_id TEXT NOT NULL,
  spreadsheet_url TEXT NOT NULL,
  title TEXT NOT NULL,
  product_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.google_sheets_exports ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own exports" 
ON public.google_sheets_exports 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own exports" 
ON public.google_sheets_exports 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own exports" 
ON public.google_sheets_exports 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_google_sheets_exports_user_id ON public.google_sheets_exports(user_id);
CREATE INDEX idx_google_sheets_exports_created_at ON public.google_sheets_exports(created_at DESC);
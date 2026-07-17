
CREATE OR REPLACE FUNCTION public.normalize_country(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s text := btrim(coalesce(p, ''));
BEGIN
  IF s = '' OR s = '??' OR lower(s) IN ('unknown', 'null', 'n/a', '-') THEN
    RETURN 'Unknown';
  END IF;
  RETURN CASE upper(s)
    WHEN 'US'  THEN 'United States'
    WHEN 'USA' THEN 'United States'
    WHEN 'UNITED STATES OF AMERICA' THEN 'United States'
    WHEN 'UNITED STATES' THEN 'United States'
    WHEN 'NL'  THEN 'Netherlands'
    WHEN 'NLD' THEN 'Netherlands'
    WHEN 'NETHERLANDS' THEN 'Netherlands'
    WHEN 'THE NETHERLANDS' THEN 'Netherlands'
    WHEN 'HOLLAND' THEN 'Netherlands'
    WHEN 'GB'  THEN 'United Kingdom'
    WHEN 'UK'  THEN 'United Kingdom'
    WHEN 'GBR' THEN 'United Kingdom'
    WHEN 'UNITED KINGDOM' THEN 'United Kingdom'
    WHEN 'DE'  THEN 'Germany'
    WHEN 'DEU' THEN 'Germany'
    WHEN 'GERMANY' THEN 'Germany'
    WHEN 'FR'  THEN 'France'
    WHEN 'FRA' THEN 'France'
    WHEN 'FRANCE' THEN 'France'
    WHEN 'CA'  THEN 'Canada'
    WHEN 'CAN' THEN 'Canada'
    WHEN 'CANADA' THEN 'Canada'
    WHEN 'AU'  THEN 'Australia'
    WHEN 'AUS' THEN 'Australia'
    WHEN 'AUSTRALIA' THEN 'Australia'
    ELSE s
  END;
END;
$$;

DO $do$
DECLARE d text; d0 text;
BEGIN
  d := pg_get_functiondef('public.canonical_sessions_set_classified_channel()'::regprocedure);
  IF position('getpawsy_self_referrer' in d) = 0 THEN
    d0 := d;
    d := replace(d,
$s$  -- Legacy classifier (unchanged behavior for existing views/callers)$s$,
$r$  -- getpawsy_self_referrer: own-host referrer is internal navigation for the legacy label too.
  IF lower(COALESCE(eff_ref, '')) ~ '^(https?://)?(www\.)?getpawsy\.pet([/:?#]|$)' THEN eff_ref := NULL; END IF;
  -- Legacy classifier (unchanged behavior for existing views/callers)$r$);
    IF d = d0 THEN RAISE EXCEPTION 'trigger self-referrer patch anchor not found'; END IF;
    EXECUTE d;
  END IF;
END
$do$;
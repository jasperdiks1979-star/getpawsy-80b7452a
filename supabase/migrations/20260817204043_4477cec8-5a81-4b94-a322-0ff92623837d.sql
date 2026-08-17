ALTER ROLE authenticator SET statement_timeout = '60s';
NOTIFY pgrst, 'reload schema';
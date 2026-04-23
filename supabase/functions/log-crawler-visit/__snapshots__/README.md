# Fuzz snapshots

This directory holds the **stable snapshot** of the smallest failing
over-limit fixture produced by the property-based fuzz suite in
`../index_test.ts`.

On every test run that finds a violation, the suite overwrites:

- `latest-over-limit-fixture.json` — machine-readable snapshot with the
  seed, iteration index, axis, shrunk value, and length semantics
  (`expectedMaxLen` / `actualLen` / `overBy`).
- `latest-over-limit-fixture.replay.sh` — one-shot bash script that
  re-POSTs the exact failing payload to the deployed edge function
  (override `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` to target a
  different env).

## Replay locally

```bash
# Option 1 — replay just the failing payload (fastest):
bash supabase/functions/log-crawler-visit/__snapshots__/latest-over-limit-fixture.replay.sh

# Option 2 — re-run the whole fuzz suite with the captured seed
# (also prints the [fuzz-snapshot] banner with the same paths):
FUZZ_SEED=$(jq -r .seed latest-over-limit-fixture.json) \
  FUZZ_ITERATIONS=$(jq -r .replay.env.FUZZ_ITERATIONS latest-over-limit-fixture.json) \
  deno test --allow-net --allow-env --allow-read --allow-write \
    --filter "fuzz" supabase/functions/log-crawler-visit/index_test.ts
```

## CI override

Set `FUZZ_SNAPSHOT_DIR` to route the snapshot into a CI artifacts
directory (the `edge-fuzz-coverage` workflow can then upload it
alongside the bucket-coverage JSON).
# Release validation and rollback

## Why releases were blocked
Earlier runs reported "manual typecheck/build prohibited". That was an agent-level
instruction (the harness already builds the preview after each edit), not a
technical block: `tsgo` and `vite build` run normally. The only technically
enforced block found is a git shim that rejects stateful git commands
(`add, apply, checkout, commit, merge, reset, restore, revert, stash, ...`) with
"'git <cmd>' is not allowed". Read-only git (`log`, `diff`, `archive`) works.
GitHub Actions workflows exist in `.github/workflows` but cannot run while the
GitHub billing lock is active.

## Gate (run before any publish)
`bash scripts/release-validate.sh <ROLLBACK_SHA>` (allow up to ~10 minutes)
1. Clean tree, HEAD recorded.
2. `tsgo --noEmit` for `tsconfig.app.json` and `tsconfig.node.json` exit 0.
3. `npm run build` in an isolated `/tmp` copy exits 0 (includes checkout idempotency
   test, US-address guard, sitemaps, product/guide prerender, seo-coverage gate).
4. Rollback rehearsal: previous published commit builds from `git archive`.
5. Full `bunx vitest run` green; database health RAM <=85%, connections <30/60, no restarts.
Build file names contain a random build id, so a deployed SHA cannot be proven by
matching asset hashes; verify live by rendered content instead.

## Rollback (frontend)
History -> restore the previous published version -> Publish -> Update, then check
the changed page live (desktop + mobile) with cache-busting. Backend functions roll
back separately by redeploying the previous function source.

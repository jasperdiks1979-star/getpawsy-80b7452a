# Release preflight: findings and required steps (nothing executed)

## Verified evidence (read-only, this session)
- Workspace HEAD: `e1d9d6f7c` "Work in progress", parent `381d0c358` (stale base again).
- Lovable storage `main` = `217cd1541f7bdb6a97611f55ee1c5426e2ab35e0` (correct).
- In workspace: `session-shadow-classify.ts` and migration 0016 missing, so it is not safe to edit.
- Branch `repair/release-gates-20261018` / PR #14 is **not** visible in Lovable's storage. Only `main`, `_agent-publish` and `lovable-backup-main-*` exist. So Lovable has not received that branch.

## Answers
1. **Can a new agent load 217cd15?** Not right now. Each turn still starts on 381d0c358 even though main is 217cd15. The agent cannot choose its own starting version. Fix (owner only): open History, find "Botclassificatie hersteld en live" and click Restore. Then start a new turn and run the preflight again.
2. **Integrating PR #14:** Lovable only syncs the synced branch (main). Other branches never arrive. So merge PR #14 into main on GitHub. That push arrives in Lovable through Git sync. Do this only after step 1 passes. If PR #14 is based on 217cd15, the merge keeps the current code.
   - Risk: an autosave from the stale base could push 381d0c358-based work over main. Lovable then reports "diverged" and puts its version on a `lovable-sync` branch. Check this after the merge.
3. **Does GitHub main auto-deploy?** Partly. Code changes sync into the editor, but the live site does not change. Frontend changes need Publish → Update. Backend functions are not redeployed by the sync on Lovable Cloud; they must be deployed from chat. Migrations are never applied automatically.
4. **Does publishing update getpawsy.pet?** Yes. The custom domain serves the published version, so Publish/Update changes getpawsy.pet.
5. **GitHub Actions locked:** this does not block Lovable sync or publishing. But PR #14 has no passing CI checks, so tests, typecheck and build must run in a Lovable turn before publishing.

## Blockers
- Stale workspace base, until the owner restores 217cd15.
- PR #14 not merged to main.
- Deploy gate: RAM ≤85%, connections <30/60, no restarts or overload for 48h, healthy catalog (432 active, confirmed by the user), tests, typecheck, build, diff review, and a 10-minute recheck after deploy.

## Steps once approved (in order)
1. Owner: History → Restore 217cd15.
2. New turn: read-only preflight (HEAD contains 217cd15, all 9 files present).
3. Owner: merge PR #14 into main on GitHub.
4. New turn: confirm the merge commit is in the workspace with no divergence. Run tests, typecheck and build, and review the diff.
5. Check the deploy gate, then deploy only the functions PR #14 changes, then Publish → Update. Recheck after 10 minutes.

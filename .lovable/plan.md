# Diagnosis: cat-toy guide release and the "1 critical security finding"

Read-only. Nothing was changed, retried, ignored or deployed.

## Headline correction

The release did NOT fail. It is live in production. My earlier "NOT DEPLOYED" report was wrong: my checks read old copies of the files.

## VERIFIED FACTS

**Release (B, C)**
- Live version marker on getpawsy.pet: build `build-mukbt4kq-v2mg`, built at 2026-09-27 21:23:58 UTC. That is about 1–2 minutes after the publish request (around 21:22 UTC).
- Version marker before: build `build-muhhhtv5-zwbh`, built 2026-09-25 21:39:50 UTC. My checks at around 21:25 and 21:28 still saw this old marker and the old picks.
- Live guide data now:
  - best-cat-toys links to the Cat Puzzle Toy, Catnip Fish Toy and Rolling Ball product pages.
  - best-interactive-cat-toys-that-work starts with the Cat Puzzle Toy. Only the first link was sampled.
- All three product pages return 200.
- `guide_product_click` is present in the live guide page code (`GuidePage-Vttby__-.js`).
- Saved patch (commits from 26 Sep, 17:45–17:48 UTC):
  - `public/data/guides/best-cat-toys.json`
  - `public/data/guides/best-interactive-cat-toys-that-work.json`
  - `src/components/guides/QuickRecommendation.tsx` (the click event)
  - `src/pages/GuidePage.tsx` (one line that switches tracking on for only these two guides)
  - `src/test/cat-toy-guide-picks.test.ts`
  - `roadmap.md`
- Other saved changes since the previous release:
  - Three Pinterest images that nothing in the site uses.
  - Backend functions that were already live separately.
- There are no unsaved changes.
- Stage that "failed": none. The build, release and live-site stages all completed.
- Preview error log: says only "frontend build failed" and names no file. Every other line is a warning. The main live release built anyway, so that preview message did not block production.
- `src/lib/boot-diagnostics.ts` appears only in a warning about how it loads. It is not failing.
- The ~15 MB code size is NOT proven to cause anything. It did not stop this release.

**Security (A)**
- In the stored scan results, the database scan (from 25 Sep) has zero critical findings. One is a warning (open inserts into `ai_credit_recovery_log`); the rest are informational.
- The other scanners report zero findings. All of these results are marked out of date for the latest version.
- The "1 unresolved critical finding" notice does not appear in any stored result I can read. I cannot name its rule, file or time.
- The publish went ahead and is live, so this finding did not block the release.
- The guide patch touches only guide data and two display files: no backend, access rules or secrets. A link to the patch is therefore very unlikely, but that stays unproven until the finding is identified.

**Health / safety (D)**
- Latest cheap check: memory 75%, 0 restarts, 16 of 60 connections, disk 66%.
- Cleanup is still off (disarmed). No Pinterest, product, price, order or auth changes were made.

## UNPROVEN HYPOTHESES
- My earlier checks were served old copies, probably by the website cache in front of the shop, while the new release was spreading. Consistent with the timing, not proven.
- The critical notice most likely comes from a new scan that ran at publish time and isn't saved in the results I can read yet.

## Smallest next action (not done)
1. Run one fresh security scan, which only reads. Then read its results to identify the exact critical finding: rule, file or resource, and why it was flagged.
2. Report whether it is new or old and whether it relates to the guide patch. Fix, ignore or change nothing without separate approval.

No further action is needed for the guide release itself; it is live.

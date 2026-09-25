# Cleanup status check (read-only) — no changes proposed

Checked 25 Sep 2026, 14:04 UTC. Only cheap, capped checks were used.

## Findings

1. **Supplier message logs (keep 90 days): NOT satisfied**
   - Oldest remaining message: 16 Apr 2026.
   - Oldest message the cleanup is allowed to delete (already processed): 13 May 2026.
   - More than 10,000 messages are older than 90 days. The check stopped counting at 10,001, so the real number is higher.
   - The oldest ones haven't been processed yet. The cleanup never deletes those, so even when it finishes, some older messages will remain.

2. **Scheduler history (keep 30 days): almost, not fully**
   - Oldest entry: 26 Aug 2026, 13:14 UTC.
   - 817 entries have just passed the 30-day line. New ones keep passing it every minute while cleanup is off.

3. **Cleanup job: OFF but unfinished (paused, not completed)**
   - Last batch ran at 13:14 UTC today. None is running now.
   - It's the new safe version (5,000 rows, 02:00–08:00 UTC), which isn't switched on yet.

4. **Database health: stable**
   - Up, no restarts. Memory is 65%, down from 78%, and disk is 66%.
   - 18 of 60 connections in use, 6 active queries, no lock waits, nothing running longer than 60 seconds.

## Decision for you

- Nothing to change unless you want cleanup to continue.
- To continue, approve switching on the safe overnight cleanup from tonight after 22:28 UTC, while memory is under 80%.
- Separately, decide whether unprocessed supplier messages older than 90 days should ever be deleted. Right now they are always kept.

**CLEANUP_NOT_COMPLETE**

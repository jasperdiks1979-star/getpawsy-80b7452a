# Security findings inventory (read-only, no changes)

## CURRENT_SECURITY_STATE (fresh scan, 21:38 UTC)
- 23 findings: 0 critical, 11 warnings, 12 informational.
- Every finding comes from the database scan and falls under one of two rules:
  - "Access rule lets everyone through": open inserts or public reads on analytics, event and category tables.
  - "Storage rule not tied to owner": anyone can list files in 7 public image and media folders.
- The ai_credit_recovery_log finding is gone.

## STORED_FINDINGS_STATE
**Verified**
- The full read-only stored view (fetched at 21:41 UTC) contains findings from exactly one scanner, the database scan.
- The other five scanners store 0 findings: app check, deep app check, connector check, dependency check and agent check.
- Size of the stored view: 814 lines now, 849 lines at 21:22 UTC. The difference of 35 lines is one finding record, the ai_credit_recovery_log item marked fixed at 21:38 UTC.
- Stored and fresh results match rule for rule: the same 23 table and storage items, all first recorded on 2 Sep 2026.
  - 12 carry the "carried" label, meaning they were brought forward from earlier scans.
  - The 11 storage items have no such label.
- Stored critical items: 0.
- Duplicates: some folders have several separate rules, for example 3 for pinterest-ads and 2 each for tiktok-media and blog-images. These are distinct rules, not repeated records.

**Not verified / untraceable**
- The "~1,007 active" figure appeared only once: as a summary line returned by the "mark as fixed" action. No read-only view I can access contains records beyond the 23.
- That figure cannot be broken down by scanner, severity, date or status. None of the read-only tools expose those records.
- What it represents is therefore UNPROVEN. Possibilities:
  - An internal all-time counter.
  - Items from other scanners or categories not shown in the stored results.
  - A counting quirk in that one action's reply.
- Nothing proves it contains any critical, current, or distinct finding.

**Counts as far as evidence allows**
- Matching the fresh 23: 23 of 23 stored findings.
- Tied to old scans: 12 carried forward, all still current per the fresh scan.
- Fixed but still stored: 0. The recovery-log item is removed.
- Distinct findings missing from the fresh scan: 0 in the stored view.
- Unclassifiable: about 984, which is the gap between 1,007 and 23. These records are not visible to read-only tools.

## ACTION_NEEDED (not implemented)
- None required for security. The fresh scan shows no critical issues.
- Optional, zero-risk step: Jasper checks the count in the project's Security tab.
  - If it shows about 23, the 1,007 was a quirk of that one action reply.
  - If it shows about 1,007, send a screenshot of the scanner or category breakdown so those records can be classified. They cannot be read from here.

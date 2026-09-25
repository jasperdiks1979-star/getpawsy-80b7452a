# Read-only triage: "5 issues found"

Nothing was changed. One limit up front: I can't see the "5 issues" panel itself. What I can read is the security scan, which lists 24 low-level notices (1 warn, 23 info, all dated 2 Sept), and the database. So this triage covers the named issue in full, plus the notices that most likely make up the rest. Paste the other four titles and I will match them one to one.

## 1. Abandoned cart tracking fails to save (the named issue) — confirmed real

- **Cause: a mismatch between the app code and the database's access rules.** The function didn't fail, and this path wasn't switched off on purpose.
  - Visitors may **add** a row to the abandoned-carts table. Only admins and the server may **read** or **update** rows.
  - Since the 16 Sept change, the shop asks the database to send back the new row's id after adding a row. Sending it back counts as reading, so the database rejects the whole write. That matches the 12 rejected writes.
  - The shop's "find my existing cart" check also can't read anything, so it always tries to add a new row. Updates are blocked too.
- **Evidence:** the newest row in the table is from 14 Sept 05:21 UTC, and nothing has been saved since. The 95 rows from the last 30 days are all older. The cart code changed on 16 Sept. The access rules are as described above. Visitors do have permission to use the table.
- **Separately:** recovery emails are switched off anyway, on purpose, by the setting `OUTBOUND_CUSTOMER_EMAIL_ENABLED`. So no shopper has lost an email because of this bug. What's lost is the record of abandoned carts, including your admin list of abandoned carts.
- **Severity:** medium. Checkout, carts and payments are not affected. The error shows only in the browser's error log.
- **Fix type:** a small code change. The shop would stop asking for the id back and would save by session through one server step or database function. The access rules would not be loosened.
- **Regression risk:** low. The change would touch only the abandoned-cart saving part of the cart code.
- **When:** after the cleanup finishes. Nothing is being lost that you would otherwise act on, because emails are off.

## 2. "Anyone can add any record to ai_credit_recovery_log" (warn) — real, low

- The rule for adding rows to this internal log accepts any row. It should allow only the server.
- **Impact:** someone could add junk rows to an internal log. No data is exposed.
- **Fix type:** a database access-rule change. **Risk:** low. **When:** defer until after the cleanup.

## 3. Open "add" rules on tracking tables (info) — intended, false alarm

- The tables are funnel events, web vitals, sessions, UTM log, crawler visits, quarantine and CRO signals.
- The storefront's tracking works this way on purpose, for visitors who aren't signed in. Tightening these rules would break tracking.
- **When:** keep as is, and mark as accepted.

## 4. Anyone can read categories and product categories (info) — intended

- This is public shop data that the storefront needs.
- **When:** keep as is.

## 5. Anyone can list files in public media folders (info) — intended, low

- The folders are product images, blog images, TikTok media, Pinterest ads and video ads. They hold public marketing files.
- The one to look at later is `cinematic-runway` (raw video assets), if those files aren't meant to be public.
- **When:** defer.

## Priority order
1. Abandoned-cart saving: medium, fix after the cleanup.
2. ai_credit_recovery_log rule: low, fix after the cleanup.
3. The rest: accepted or intended, no action.

Nothing here is critical or high. Nothing here affects sign-in, checkout, payments or the recent security and category fixes. Nothing needs doing while the database cleanup is running.

# Live verification: login return-link fix

## Verdict: FIX_LIVE_CONFIRMED

## Evidence (checked 22:02 UTC, cache-busted fetch of https://getpawsy.pet/auth)

**Live version**
- Live build marker: `build-mukcytnj-nsfx`, built 2026-09-27 21:56:23 UTC.
- Previous build: `build-mukbt4kq-v2mg`, which carried the old check. It has now been replaced.
- Main bundle: `index-oV98yD_0.js`, previously `index-B87Ycwl8.js`.
- Login page bundle: `Auth-ByxUX3Bo.js`, previously `Auth-DuFlEenO.js`.

**Login page health**
- `/auth` returns HTTP 200 in 0.19 s.

**The live check**
- The old check `s.startsWith("/")?s:"/"` is gone from the live login page code.
- Its "next" value now goes through the new check: `useMemo(() => ge(u.get("next")))`.
- The live `ge` function sends every one of these back to `/`:
  - missing, empty or overlong links (over 2,048 characters);
  - hidden control characters and spaces;
  - links not starting with `/`;
  - links starting with `//`;
  - links containing a backslash.
- After those checks, `ge` reads the link as a full web address. If it cannot be read, or it leads to a different site, the visitor goes back to `/`.
- Allowed links keep only the page, query and `#section`.

I did not make a real login or signup, and did not visit any outside site.

Nothing was changed or republished. Cleanup is still off.

#!/usr/bin/env bash
# Post-deploy smoke test for getpawsy-gsc-recovery.
# Exits non-zero if any assertion fails.

set -u

HOST="${HOST:-https://getpawsy.pet}"
PASS=0
FAIL=0

check() {
  local method="$1" path="$2" want_status="$3" want_marker="$4" want_location="$5"
  local out status marker location
  out=$(curl -sI -X "$method" -o /dev/null -w "STATUS=%{http_code}\nLOCATION=%{redirect_url}\n" \
    -D /tmp/gsc-headers.$$ "$HOST$path")
  status=$(awk -F= '/^STATUS=/{print $2}' <<<"$out")
  location=$(awk -F= '/^LOCATION=/{print $2}' <<<"$out")
  marker=$(grep -i '^x-gsc-recovery:' /tmp/gsc-headers.$$ | head -n1 | awk '{print tolower($2)}' | tr -d '\r')
  rm -f /tmp/gsc-headers.$$

  local ok=1
  [ "$status" = "$want_status" ] || ok=0
  if [ -n "$want_marker" ]; then [ "$marker" = "$want_marker" ] || ok=0; fi
  if [ -n "$want_location" ]; then [[ "$location" == *"$want_location"* ]] || ok=0; fi

  if [ $ok -eq 1 ]; then
    printf "[ok]  %-4s %-60s → %s  x-gsc-recovery=%s\n" "$method" "$path" "$status" "${marker:-<none>}"
    PASS=$((PASS+1))
  else
    printf "[FAIL] %-4s %-60s → got status=%s marker=%s location=%s (wanted status=%s marker=%s location~=%s)\n" \
      "$method" "$path" "$status" "${marker:-<none>}" "${location:-<none>}" "$want_status" "${want_marker:-<any>}" "${want_location:-<any>}"
    FAIL=$((FAIL+1))
  fi
}

# 1. 410 — deprecated collection prefix
check GET  "/c/all"                                                        410 410 ""
check GET  "/c/best-sellers"                                               410 410 ""

# 2. 410 — legacy numeric product id
check GET  "/product/1806928748680728576"                                  410 410 ""
check HEAD "/product/1806928748680728576"                                  410 410 ""

# 3. 410 — removed /products/<slug>
check GET  "/products/60l-automatic-cat-litter-box"                        410 410 ""

# 4. 301 — /product/<uuid> where UUID still exists
check GET  "/product/e42efe24-988c-4581-b8e0-95efc2c5250f"                 301 301 "/products/outdoor-dog-kennel"
check GET  "/product/5a93dba6-2030-4469-b40b-2f6aa07590aa"                 301 301 "/products/house-type-with-running-ladder"

# 5. 200 — passthrough (live content, must be untouched)
check GET  "/"                                                             200 "" ""
check GET  "/dogs"                                                         200 "" ""
check GET  "/products/automatic-cat-litter-box-self-cleaning-app-control"  200 "" ""
check GET  "/products/24-inch-anti-slip-round-fluffy-plush-faux-fur-cat-bed-fits-up-to-25-lbs-pets" 200 "" ""

echo ""
echo "$PASS passed, $FAIL failed"
[ $FAIL -eq 0 ]
#!/usr/bin/env bash
# Fail closed: an advanced scan cursor is not proof of CJ-confirmed stock.
set -euo pipefail
response_file="${1:?Expected watchdog response JSON file}"

if ! jq -s -e '
  def nonnegative_integer: type == "number" and . >= 0 and . == floor;
  if length != 1 then false else .[0] |
  if .claimed == true then
    (.checkpoint_before | nonnegative_integer) and
    (.checkpoint_persisted | nonnegative_integer) and
    (.checkpoint_persisted == .checkpoint_before + 1) and
    (.status == "running" or .status == "completed" or .status == "needs_review") and
    (if .verified == true then (.deferred != true)
     elif .verified == false and .deferred == true then
       (.status == "running" or .status == "needs_review")
     else false end)
  elif .claimed == false then
    (.reason == "No partial running sync" or (.checkpoint | nonnegative_integer))
  else false end end
' "$response_file" >/dev/null; then
  echo "::error::Recovery response lacks valid persisted checkpoint proof" >&2
  exit 1
fi

jq -s -r '
  .[0] |
  if .claimed == true and .verified == true then
    "Verified CJ stock checkpoint: \(.checkpoint_before) -> \(.checkpoint_persisted) (\(.status))"
  elif .claimed == true and .deferred == true then
    "Unverified CJ stock deferred; scan cursor only: \(.checkpoint_before) -> \(.checkpoint_persisted) (\(.status))"
  else
    "No recovery claimed (no progress asserted)"
  end
' "$response_file"

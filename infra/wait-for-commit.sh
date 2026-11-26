#!/usr/bin/env bash
# Polls <base-url>/api/health until it reports the expected commit.
# Exits 0 once it does, 1 if it hasn't within the timeout (the deploy failed to come up).
#
# Usage: infra/wait-for-commit.sh <base-url> <commit-sha> [timeout-seconds=300] [interval-seconds=10]
set -euo pipefail

url="${1:?usage: wait-for-commit.sh <base-url> <commit-sha> [timeout] [interval]}"
want="${2:?usage: wait-for-commit.sh <base-url> <commit-sha> [timeout] [interval]}"
timeout="${3:-300}"
interval="${4:-10}"

deadline=$(($(date +%s) + timeout))
while true; do
  body="$(curl --silent --show-error --fail --max-time 30 "${url%/}/api/health" 2>&1)" || body=""
  got="$(jq -r '.commit // empty' <<<"$body" 2>/dev/null)" || got=""

  if [[ "$got" == "$want" ]]; then
    echo "Live: ${url%/}/api/health reports commit $got."
    exit 0
  fi
  if (($(date +%s) >= deadline)); then
    echo "::error::After ${timeout}s, ${url%/}/api/health reports commit '${got:-<no answer>}', not $want. The new version did not come up."
    exit 1
  fi
  echo "Waiting: health reports '${got:-<no answer>}', want $want."
  sleep "$interval"
done

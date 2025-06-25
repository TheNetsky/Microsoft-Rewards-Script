#!/usr/bin/env bash
set -euo pipefail

# Ensure Playwright uses the preinstalled browsers
export PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Ensure TZ is set (entrypoint sets TZ system-wide); fallback if missing
export TZ="${TZ:-UTC}"

# Change to project directory
cd /usr/src/microsoft-rewards-script

# Optional: prevent overlapping runs
LOCKFILE=/tmp/run_daily.lock
exec 9>"$LOCKFILE"
if ! flock -n 9; then
  echo "[$(date)] [run_daily.sh] Previous instance still running; exiting."
  exit 0
fi

# Random sleep between configurable minutes (default 5-50 minutes)
MINWAIT=${MIN_SLEEP_MINUTES:-5}
MAXWAIT=${MAX_SLEEP_MINUTES:-50}
MINWAIT_SEC=$((MINWAIT*60))
MAXWAIT_SEC=$((MAXWAIT*60))

# Skip sleep if SKIP_RANDOM_SLEEP is set to true
if [ "${SKIP_RANDOM_SLEEP:-false}" != "true" ]; then
    SLEEPTIME=$(( MINWAIT_SEC + RANDOM % (MAXWAIT_SEC - MINWAIT_SEC) ))
    SLEEP_MINUTES=$(( SLEEPTIME / 60 ))
    echo "[$(date)] [run_daily.sh] Sleeping for $SLEEP_MINUTES minutes ($SLEEPTIME seconds) to randomize execution..."
    sleep "$SLEEPTIME"
else
    echo "[$(date)] [run_daily.sh] Skipping random sleep (SKIP_RANDOM_SLEEP=true)"
fi

echo "[$(date)] [run_daily.sh] Starting script..."
if npm start; then
  echo "[$(date)] [run_daily.sh] Script completed successfully."
else
  echo "[$(date)] [run_daily.sh] ERROR: Script failed!" >&2
fi
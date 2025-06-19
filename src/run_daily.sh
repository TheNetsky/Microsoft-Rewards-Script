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
  echo "[$(date -Is)] [run_daily.sh] Previous instance still running; exiting."
  exit 0
fi

# Random sleep between 5 and 50 minutes
MINWAIT=$((5*60))
MAXWAIT=$((50*60))
SLEEPTIME=$(( MINWAIT + RANDOM % (MAXWAIT - MINWAIT) ))
SLEEP_MINUTES=$(( SLEEPTIME / 60 ))
echo "[$(date -Is)] [run_daily.sh] Sleeping for $SLEEP_MINUTES minutes ($SLEEPTIME seconds)..."
sleep "$SLEEPTIME"

echo "[$(date -Is)] [run_daily.sh] Starting script..."
if npm start; then
  echo "[$(date -Is)] [run_daily.sh] Script completed successfully."
else
  echo "[$(date -Is)] [run_daily.sh] ERROR: Script failed!" >&2
fi

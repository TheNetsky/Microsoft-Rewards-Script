#!/usr/bin/env bash
set -euo pipefail

# Ensure Playwright uses preinstalled browsers
export PLAYWRIGHT_BROWSERS_PATH=0

# 1. Timezone: default to UTC if not provided
: "${TZ:=UTC}"
ln -snf "/usr/share/zoneinfo/$TZ" /etc/localtime
echo "$TZ" > /etc/timezone
dpkg-reconfigure -f noninteractive tzdata

# 2. Validate CRON_SCHEDULE
if [ -z "${CRON_SCHEDULE:-}" ]; then
  echo "ERROR: CRON_SCHEDULE environment variable is not set." >&2
  echo "Please set CRON_SCHEDULE (e.g., \"0 2 * * *\")." >&2
  exit 1
fi

# 3. Initial run without sleep if RUN_ON_START=true
if [ "${RUN_ON_START:-false}" = "true" ]; then
  echo "[entrypoint] Starting initial run in background at $(date)"
  (
    cd /usr/src/microsoft-rewards-script || {
      echo "[entrypoint-bg] ERROR: Unable to cd to /usr/src/microsoft-rewards-script" >&2
      exit 1
    }
    # Skip random sleep for initial run, but preserve setting for cron jobs
    SKIP_RANDOM_SLEEP=true src/run_daily.sh
    echo "[entrypoint-bg] Initial run completed at $(date)"
  ) &
  echo "[entrypoint] Background process started (PID: $!)"
fi

# 4. Template and register cron file with explicit timezone export
if [ ! -f /etc/cron.d/microsoft-rewards-cron.template ]; then
  echo "ERROR: Cron template /etc/cron.d/microsoft-rewards-cron.template not found." >&2
  exit 1
fi

# Export TZ for envsubst to use
export TZ
envsubst < /etc/cron.d/microsoft-rewards-cron.template > /etc/cron.d/microsoft-rewards-cron
chmod 0644 /etc/cron.d/microsoft-rewards-cron
crontab /etc/cron.d/microsoft-rewards-cron

echo "[entrypoint] Cron configured with schedule: $CRON_SCHEDULE and timezone: $TZ; starting cron at $(date)"

# 5. Start cron in foreground (PID 1)
exec cron -f
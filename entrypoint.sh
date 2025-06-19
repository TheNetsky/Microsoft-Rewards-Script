#!/usr/bin/env sh
set -eu

# Ensure Playwright uses preinstalled browsers
export PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# 1. Timezone: default to UTC if not provided
: "${TZ:=UTC}"
ln -snf "/usr/share/zoneinfo/$TZ" /etc/localtime
echo "$TZ" > /etc/timezone

# 2. Validate CRON_SCHEDULE
if [ -z "${CRON_SCHEDULE:-}" ]; then
  echo "ERROR: CRON_SCHEDULE environment variable is not set." >&2
  echo "Please set CRON_SCHEDULE (e.g., \"0 2 * * *\")." >&2
  exit 1
fi

# 3. Initial run without sleep if RUN_ON_START=true
if [ "${RUN_ON_START:-false}" = "true" ]; then
  echo "[entrypoint] RUN_ON_START=true: performing initial run at $(date -Is)"
  cd /usr/src/microsoft-rewards-script || {
    echo "[entrypoint] ERROR: Unable to cd to /usr/src/microsoft-rewards-script" >&2
    # proceed to cron setup so scheduled runs still occur
  }
  # npm start will pick up PLAYWRIGHT_BROWSERS_PATH from environment
  if ! npm start; then
    echo "[entrypoint] WARNING: Initial run failed; continuing to cron for future runs" >&2
  else
    echo "[entrypoint] Initial run completed successfully at $(date -Is)"
  fi
fi

# 4. Template and register cron file
if [ ! -f /etc/cron.d/microsoft-rewards-cron.template ]; then
  echo "ERROR: Cron template /etc/cron.d/microsoft-rewards-cron.template not found." >&2
  exit 1
fi
envsubst < /etc/cron.d/microsoft-rewards-cron.template > /etc/cron.d/microsoft-rewards-cron
chmod 0644 /etc/cron.d/microsoft-rewards-cron
crontab /etc/cron.d/microsoft-rewards-cron

echo "[entrypoint] Cron configured with schedule: $CRON_SCHEDULE; starting cron at $(date -Is)"

# 5. Start cron in foreground (PID 1)
exec cron -f

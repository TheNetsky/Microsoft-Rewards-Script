#!/bin/bash
set -e

# Docker entrypoint with cron support
# Usage:
#   Default (scheduler): npm run start:schedule
#   Cron mode: set USE_CRON=true

# If USE_CRON is set, configure cron instead of using built-in scheduler
if [ "$USE_CRON" = "true" ] || [ "$USE_CRON" = "1" ]; then
  echo "==> Cron mode enabled"
  
  # Default cron schedule if not provided (daily at 9 AM with random jitter)
  CRON_SCHEDULE="${CRON_SCHEDULE:-0 9 * * *}"
  
  echo "==> Installing cron..."
  apt-get update -qq && apt-get install -y -qq cron > /dev/null 2>&1
  
  # Create cron job file
  echo "==> Setting up cron schedule: $CRON_SCHEDULE"
  
  # Build environment variables for cron
  ENV_VARS=$(printenv | grep -E '^(TZ|NODE_ENV|FORCE_HEADLESS|PLAYWRIGHT_BROWSERS_PATH|ACCOUNTS_JSON|ACCOUNTS_FILE)=' | sed 's/^/export /' | tr '\n' ';')
  
  # Create cron job that runs the script
  CRON_JOB="$CRON_SCHEDULE cd /usr/src/microsoft-rewards-script && $ENV_VARS node --enable-source-maps ./dist/index.js >> /var/log/cron.log 2>&1"
  
  echo "$CRON_JOB" > /etc/cron.d/microsoft-rewards
  chmod 0644 /etc/cron.d/microsoft-rewards
  
  # Apply cron job
  crontab /etc/cron.d/microsoft-rewards
  
  # Create log file
  touch /var/log/cron.log
  
  echo "==> Cron job installed:"
  echo "    Schedule: $CRON_SCHEDULE"
  echo "    Command: node --enable-source-maps ./dist/index.js"
  echo "    Logs: /var/log/cron.log"
  echo ""
  
  # Run once immediately if requested
  if [ "$RUN_ON_START" = "true" ] || [ "$RUN_ON_START" = "1" ]; then
    echo "==> Running initial execution (RUN_ON_START=true)..."
    cd /usr/src/microsoft-rewards-script
    node --enable-source-maps ./dist/index.js 2>&1 | tee -a /var/log/cron.log
    echo "==> Initial execution completed"
    echo ""
  fi
  
  echo "==> Starting cron daemon..."
  echo "==> Container ready. Cron will execute: $CRON_SCHEDULE"
  echo "==> View logs: docker logs -f <container>"
  echo ""
  
  # Start cron in foreground and tail logs
  cron && tail -f /var/log/cron.log
else
  echo "==> Using built-in scheduler (JavaScript)"
  echo "==> To use cron instead, set USE_CRON=true"
  echo ""
  
  # Execute passed command (default: npm run start:schedule)
  exec "$@"
fi

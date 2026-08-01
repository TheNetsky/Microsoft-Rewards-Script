#!/usr/bin/env bash
set -euo pipefail

# Ensure Playwright uses preinstalled browsers
export PLAYWRIGHT_BROWSERS_PATH=0

SCRIPT_DIR="/usr/src/microsoft-rewards-script"

# 1. Timezone: default to UTC if not provided
: "${TZ:=UTC}"
ln -snf "/usr/share/zoneinfo/$TZ" /etc/localtime
echo "$TZ" > /etc/timezone
dpkg-reconfigure -f noninteractive tzdata

# 2. Validate CRON_SCHEDULE (not required in API mode)
if [ "${API_MODE:-false}" != "true" ]; then
  if [ -z "${CRON_SCHEDULE:-}" ]; then
    echo "ERROR: CRON_SCHEDULE environment variable is not set." >&2
    echo "Please set CRON_SCHEDULE (e.g., \"0 2 * * *\")." >&2
    echo "       To run the API server instead, set API_MODE=true." >&2
    exit 1
  fi
fi

# 3. Accounts: read directly from ACCOUNT_N_* env vars by the app at runtime.
#
#    Add one numbered block per account in .env:
#      ACCOUNT_1_EMAIL, ACCOUNT_1_PASSWORD, ...
#      ACCOUNT_2_EMAIL, ACCOUNT_2_PASSWORD, ...
#
#    No accounts.json is generated anymore - loadAccounts() parses the
#    environment. This is just a fail-fast presence check.
mapfile -t account_indexes < <(
  compgen -e | sed -n 's/^ACCOUNT_\([1-9][0-9]*\)_EMAIL$/\1/p' | sort -n -u
)

acct_count=0
for i in "${account_indexes[@]}"; do
  email_var="ACCOUNT_${i}_EMAIL"
  [ -z "${!email_var:-}" ] && continue

  password_var="ACCOUNT_${i}_PASSWORD"
  if [ -z "${!password_var:-}" ]; then
    echo "ERROR: $email_var is set but $password_var is missing." >&2
    exit 1
  fi
  acct_count=$((acct_count + 1))
done

if [ "$acct_count" -eq 0 ]; then
  echo "WARNING: No ACCOUNT_N_EMAIL found in environment - the script will fail." >&2
  echo "         Set at least one ACCOUNT_N_EMAIL and ACCOUNT_N_PASSWORD pair in your .env file." >&2
else
  echo "[entrypoint] Found $acct_count account(s) in environment"
fi

# 4. Config: generate/sync config.json
#
#    Generation and drift-detection are delegated to dist/util/ConfigSync.js
#    (built from src/util/ConfigSync.ts), the same module the API's config
#    editor uses, so this logic lives in exactly one place. See that file for
#    the diff/merge implementation.
#
#    Behaviour:
#      - No config.json       → generated from config.example.json
#      - config.json exists   → compared against config.example.json;
#                               CONFIG_* overrides always applied afterward
#      - Schema drift         → missing keys are reported. Set
#                               CONFIG_AUTO_SYNC=true to patch them into the
#                               file automatically (a .bak backup is kept);
#                               default is report-only, matching prior
#                               behaviour.
#      - Corrupt config.json  → fails loudly instead of being silently
#                               overwritten.
#
#    headless is always forced true - it is not optional in Docker.
#
#    CONFIG_* env var overrides (applied on every startup) are defined once,
#    in src/util/ConfigEnvOverrides.ts (ENV_OVERRIDES table) - not here.
#    Run `node dist/util/ConfigEnvOverrides.js list` for the full current
#    list of supported variables and the config path each maps to.
#
CONFIG_FILE="$SCRIPT_DIR/config/config.json"
CONFIG_EXAMPLE="$SCRIPT_DIR/config.example.json"

if ! [ -f "$CONFIG_EXAMPLE" ]; then
  echo "ERROR: config.example.json not found at $CONFIG_EXAMPLE - image may be corrupt." >&2
  exit 1
fi

# A single-file bind mount whose host path did not exist makes Docker create a
# *directory* at config.json. Fail clearly instead of writing a broken config.
if [ -d "$CONFIG_FILE" ]; then
  echo "ERROR: $CONFIG_FILE is a directory, not a file." >&2
  echo "       ./config.json likely did not exist on the host when the container" >&2
  echo "       started, so Docker created it as a folder. Remove it and create the" >&2
  echo "       file first:  cp config.example.json config.json" >&2
  exit 1
fi

SYNC_ARGS=(--config "$CONFIG_FILE" --example "$CONFIG_EXAMPLE")
if [ "${CONFIG_AUTO_SYNC:-false}" = "true" ]; then
  SYNC_ARGS+=(--patch)
fi
if ! node "$SCRIPT_DIR/dist/util/ConfigSync.js" sync "${SYNC_ARGS[@]}"; then
  echo "ERROR: config sync failed - see above." >&2
  exit 1
fi

# Apply CONFIG_* env var overrides (always runs, regardless of config
# source). Delegates to dist/util/ConfigEnvOverrides.js (built from
# src/util/ConfigEnvOverrides.ts) - see that file for the full mapping table.
echo "[entrypoint] Applying CONFIG_* environment variable overrides..."
if ! node "$SCRIPT_DIR/dist/util/ConfigEnvOverrides.js" apply --config "$CONFIG_FILE"; then
  echo "ERROR: applying CONFIG_* overrides failed - see above." >&2
  exit 1
fi

echo "[entrypoint] Config ready."

# Link the generated config back to the root so the app script can find it
ln -sf "$CONFIG_FILE" "$SCRIPT_DIR/config.json"

# Snapshot the full container environment for cron-spawned runs
export -p > /etc/container_env
chmod 600 /etc/container_env

# ─────────────────────────────────────────────────────────────────────────────
# 5. Initial run without sleep if RUN_ON_START=true
# ─────────────────────────────────────────────────────────────────────────────
if [ "${RUN_ON_START:-false}" = "true" ]; then
  # Always go through run_daily.sh so the lockfile is acquired and the same
  # code path runs regardless of mode.  In API mode, run_daily.sh calls
  # trigger.js which waits for the API server to be ready before firing.
  echo "[entrypoint] Starting initial run in background at $(date)"
  (
    cd "$SCRIPT_DIR" || {
      echo "[entrypoint-bg] ERROR: Unable to cd to $SCRIPT_DIR" >&2
      exit 1
    }
    SKIP_RANDOM_SLEEP=true scripts/docker/run_daily.sh
    echo "[entrypoint-bg] Initial run completed at $(date)"
  ) &
  echo "[entrypoint] Background process started (PID: $!)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 6. Start: scheduler-only (default) or API-integrated mode
# ─────────────────────────────────────────────────────────────────────────────
# Default API_HOST to 0.0.0.0 so Docker port-mapping works out of the box.
: "${API_HOST:=0.0.0.0}"
export API_HOST

if [ "${API_MODE:-false}" = "true" ]; then
  # API-integrated mode:
  #   - The API server is the main (foreground) process and becomes PID 1.
  #   - The cron schedule can come from two places, checked in this order:
  #       1. config/schedule.json - a persisted override written by
  #          PUT /schedule (e.g. from the dashboard). Present only if that
  #          endpoint has been used at least once; survives restarts because
  #          it lives in the ./config bind mount.
  #       2. CRON_SCHEDULE - the env var, exactly as before. This remains the
  #          only thing that matters for anyone not using PUT /schedule.
  #   - Either way, if a schedule is active, cron runs as a background daemon;
  #     run_daily.sh detects API_MODE=true and calls POST /start via
  #     scripts/api/trigger.js instead of running npm start directly, so the
  #     API server has full visibility and control over every run.
  #   - With neither source configured, runs must be triggered manually via
  #     POST /start.
  export TZ

  SCHEDULE_OVERRIDE="${SCHEDULE_FILE:-$SCRIPT_DIR/config/schedule.json}"

  if [ -f "$SCHEDULE_OVERRIDE" ]; then
    echo "[entrypoint] Found $SCHEDULE_OVERRIDE - applying it (overrides CRON_SCHEDULE)."
    if node scripts/api/apply-schedule.js; then
      cron -f &
      echo "[entrypoint] Cron started in background (schedule: from schedule.json, TZ: $TZ)"
    else
      echo "ERROR: Could not apply $SCHEDULE_OVERRIDE." >&2
      exit 1
    fi
  elif [ -n "${CRON_SCHEDULE:-}" ]; then
    if [ ! -f /etc/cron.d/microsoft-rewards-cron.template ]; then
      echo "ERROR: Cron template /etc/cron.d/microsoft-rewards-cron.template not found." >&2
      exit 1
    fi
    envsubst < /etc/cron.d/microsoft-rewards-cron.template > /etc/cron.d/microsoft-rewards-cron
    chmod 0644 /etc/cron.d/microsoft-rewards-cron
    crontab /etc/cron.d/microsoft-rewards-cron
    cron -f &
    echo "[entrypoint] Cron started in background (schedule: $CRON_SCHEDULE, TZ: $TZ)"
  else
    echo "[entrypoint] No CRON_SCHEDULE set and no schedule.json override - runs must be triggered manually via POST /start, or scheduled from the dashboard."
  fi
  echo "[entrypoint] Starting control API on ${API_HOST}:${API_PORT:-3010} at $(date)"
  exec node scripts/api/server.js
fi

# Scheduler-only mode (default): cron calls npm start directly.
if [ ! -f /etc/cron.d/microsoft-rewards-cron.template ]; then
  echo "ERROR: Cron template /etc/cron.d/microsoft-rewards-cron.template not found." >&2
  exit 1
fi

export TZ
envsubst < /etc/cron.d/microsoft-rewards-cron.template > /etc/cron.d/microsoft-rewards-cron
chmod 0644 /etc/cron.d/microsoft-rewards-cron
crontab /etc/cron.d/microsoft-rewards-cron

echo "[entrypoint] Cron configured with schedule: $CRON_SCHEDULE and timezone: $TZ; starting cron at $(date)"

# 7. Start cron in foreground (PID 1)
exec cron -f
